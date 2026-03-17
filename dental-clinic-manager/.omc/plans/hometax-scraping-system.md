# 홈택스 스크래핑 시스템 상세 구현 계획

**작성일:** 2026-03-12
**상태:** 계획 수립 완료
**분류:** 신규 시스템 구축 + 레거시 교체

---

## 1. 프로젝트 개요

### 목표
- 기존 CODEF API 의존성을 제거하고 자체 홈택스 스크래핑 시스템으로 대체
- Mac mini M4 (16GB)에서 Docker 기반 스크래핑 워커 운영
- Supabase를 매개체로 Next.js 앱과 스크래핑 워커 간 비동기 통신
- 하루 1회 자동 수집 + 월말 결산 자동화

### 현재 상태 (CODEF 기반)
- **제거 대상 파일:**
  - `src/lib/codefService.ts` (500+ lines)
  - `src/app/api/codef/connect/route.ts`
  - `src/app/api/codef/sync/route.ts`
  - `src/app/api/codef/tax-invoice-statistics/route.ts`
  - `src/app/api/codef/tax-invoice-detail/route.ts`
  - `src/app/api/codef/cash-receipt-purchase/route.ts`
  - `src/app/api/codef/business-card-deduction/route.ts`
  - `src/app/api/codef/credit-card-sales/route.ts`
  - `src/app/api/codef/scan-certs/route.ts`
  - `src/components/Financial/CertificateSelector.tsx`
  - `src/lib/certificateParser.ts`
  - `node_modules/easycodef-node/` (npm uninstall)

- **수정 대상 파일:**
  - `src/components/Financial/CodefSyncPanel.tsx` → `HometaxSyncPanel.tsx`로 재작성
  - `src/components/Financial/FinancialDashboard.tsx` (CodefSyncPanel import 변경)
  - `src/types/financial.ts` (codef_sync 인터페이스 변경)
  - `src/types/codef.ts` → 데이터 타입은 `src/types/hometax.ts`로 이관

- **유지 대상:**
  - `src/components/Financial/RevenueForm.tsx`
  - `src/components/Financial/ExpenseForm.tsx`
  - `src/components/Financial/CreditCardSalesPanel.tsx`
  - `src/lib/financialService.ts`
  - `src/utils/taxCalculationUtils.ts`

- **DB 테이블 마이그레이션 필요:**
  - `codef_connections` → `hometax_connections` (스키마 변경)
  - `codef_sync_logs` → `scraping_sync_logs` (스키마 변경)
  - 신규: `scraping_jobs`, `hometax_credentials`, `hometax_raw_data`

### 수집 대상 데이터 6종
1. 전자세금계산서 매출 (매출처별 세금계산서 합계표)
2. 전자세금계산서 매입 (매입처별 세금계산서 합계표)
3. 현금영수증 매출
4. 현금영수증 매입
5. 사업용 신용카드 매입
6. 신용카드 매출

---

## 2. Phase별 상세 구현 계획

---

### Phase 1: 기반 구축 (2주)

**목표:** DB 스키마 설계, 스크래핑 프로젝트 골격, CODEF 코드 제거

#### Task 1.1: DB 스키마 설계 및 마이그레이션 (3일)

**작업 내용:**
- 기존 CODEF 테이블 → 신규 테이블 마이그레이션 SQL 작성
- Supabase MCP로 직접 적용

**신규 테이블 설계:**

```sql
-- 1. 홈택스 인증정보 (클리닉별)
CREATE TABLE hometax_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  business_number VARCHAR(12) NOT NULL,        -- 사업자등록번호
  hometax_user_id VARCHAR(50) NOT NULL,        -- 홈택스 ID
  encrypted_password TEXT NOT NULL,            -- AES-256-GCM 암호화된 비밀번호
  login_method VARCHAR(20) DEFAULT 'id_pw',   -- id_pw | cert (향후)
  is_active BOOLEAN DEFAULT true,
  last_login_success TIMESTAMPTZ,
  last_login_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_clinic_hometax UNIQUE (clinic_id)
);

-- 2. 스크래핑 작업 큐 (Job Queue)
CREATE TABLE scraping_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  job_type VARCHAR(30) NOT NULL,              -- daily_sync | monthly_settlement | manual_sync
  data_types TEXT[] NOT NULL,                 -- {'tax_invoice_sales','tax_invoice_purchase',...}
  target_year INTEGER NOT NULL,
  target_month INTEGER NOT NULL,
  target_date DATE,                           -- daily_sync인 경우 특정 날짜
  status VARCHAR(20) DEFAULT 'pending',       -- pending | running | completed | failed | cancelled
  priority INTEGER DEFAULT 5,                -- 1(최고) ~ 10(최저)
  worker_id VARCHAR(50),                      -- 처리 중인 워커 ID
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  result_summary JSONB,                       -- 수집 결과 요약
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 홈택스 수집 데이터 (원시 데이터 저장)
CREATE TABLE hometax_raw_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  job_id UUID REFERENCES scraping_jobs(id),
  data_type VARCHAR(30) NOT NULL,             -- tax_invoice_sales, tax_invoice_purchase,
                                               -- cash_receipt_sales, cash_receipt_purchase,
                                               -- business_card_purchase, credit_card_sales
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  raw_data JSONB NOT NULL,                    -- 스크래핑 원시 데이터
  parsed_data JSONB,                          -- 파싱된 정규화 데이터
  record_count INTEGER DEFAULT 0,
  total_amount BIGINT DEFAULT 0,              -- 총 금액 (원)
  supply_amount BIGINT DEFAULT 0,             -- 공급가액 (원)
  tax_amount BIGINT DEFAULT 0,               -- 세액 (원)
  hash VARCHAR(64),                           -- 데이터 변경 감지용 SHA-256
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_clinic_data_period UNIQUE (clinic_id, data_type, year, month)
);

-- 4. 스크래핑 동기화 로그 (기존 codef_sync_logs 대체)
CREATE TABLE scraping_sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  job_id UUID REFERENCES scraping_jobs(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sync_type VARCHAR(30) NOT NULL,
  tax_invoice_sales_count INTEGER DEFAULT 0,
  tax_invoice_purchase_count INTEGER DEFAULT 0,
  cash_receipt_sales_count INTEGER DEFAULT 0,
  cash_receipt_purchase_count INTEGER DEFAULT 0,
  business_card_purchase_count INTEGER DEFAULT 0,
  credit_card_sales_count INTEGER DEFAULT 0,
  total_synced INTEGER DEFAULT 0,
  duration_ms INTEGER,                        -- 수집 소요 시간
  errors JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 스크래핑 워커 상태 (헬스체크용)
CREATE TABLE scraping_workers (
  id VARCHAR(50) PRIMARY KEY,                 -- 워커 고유 ID
  hostname VARCHAR(100),
  status VARCHAR(20) DEFAULT 'idle',          -- idle | busy | offline
  current_job_id UUID REFERENCES scraping_jobs(id),
  last_heartbeat TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ DEFAULT NOW(),
  jobs_completed INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,
  metadata JSONB
);
```

**인덱스:**
```sql
CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status, priority, created_at);
CREATE INDEX idx_scraping_jobs_clinic ON scraping_jobs(clinic_id);
CREATE INDEX idx_hometax_raw_data_clinic_type ON hometax_raw_data(clinic_id, data_type, year, month);
CREATE INDEX idx_scraping_sync_logs_clinic ON scraping_sync_logs(clinic_id, year, month);
CREATE INDEX idx_scraping_workers_heartbeat ON scraping_workers(last_heartbeat);
```

**RLS 정책:** 기존 CODEF 테이블과 동일 패턴 (clinic_id 기반)

**완료 기준:**
- [ ] 5개 테이블 + 인덱스 + RLS가 Supabase에 적용됨
- [ ] 기존 codef_connections/codef_sync_logs 데이터가 마이그레이션됨
- [ ] 마이그레이션 SQL 파일이 `supabase/migrations/`에 저장됨

**예상 소요:** 3일

---

#### Task 1.2: 스크래핑 워커 프로젝트 초기화 (2일)

**작업 내용:**
- 별도 디렉토리 `scraping-worker/`에 Node.js/TypeScript 프로젝트 생성
- Docker 설정 (Dockerfile, docker-compose.yml)
- Supabase 클라이언트 연결 설정
- 프로젝트 구조 생성

**프로젝트 구조:**
```
scraping-worker/
├── src/
│   ├── index.ts                 # 워커 엔트리포인트
│   ├── config.ts                # 환경변수/설정
│   ├── db/
│   │   └── supabaseClient.ts    # Supabase 서비스 롤 클라이언트
│   ├── queue/
│   │   ├── jobConsumer.ts       # Job 폴링 및 실행
│   │   └── jobProducer.ts       # Job 생성 (배치용)
│   ├── scrapers/
│   │   ├── baseScraper.ts       # 공통 스크래핑 로직
│   │   ├── loginHandler.ts      # 홈택스 로그인
│   │   ├── taxInvoiceScraper.ts # 전자세금계산서
│   │   ├── cashReceiptScraper.ts# 현금영수증
│   │   ├── businessCardScraper.ts# 사업용 신용카드
│   │   └── creditCardSalesScraper.ts # 신용카드 매출
│   ├── parsers/
│   │   └── dataParser.ts        # HTML/JSON 데이터 파싱
│   ├── crypto/
│   │   └── encryption.ts        # AES-256-GCM 암복호화
│   └── utils/
│       ├── logger.ts            # 로깅 (Winston/Pino)
│       └── retry.ts             # 재시도 로직
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── .env.example
```

**기술 스택 (스크래핑 워커):**
- Runtime: Node.js 20 LTS
- Language: TypeScript 5.x
- Browser Automation: Playwright (Chromium)
- DB Client: @supabase/supabase-js (service_role key)
- Encryption: Node.js crypto (AES-256-GCM)
- Logging: Pino (JSON structured logging)
- Process: tsx (TypeScript 실행)
- Container: Docker + docker-compose

**완료 기준:**
- [ ] `scraping-worker/` 프로젝트 생성, `npm install` 성공
- [ ] Docker build 성공, 컨테이너 내에서 Playwright Chromium 실행 확인
- [ ] Supabase 연결 테스트 (scraping_workers 테이블에 heartbeat 기록)
- [ ] 로깅 설정 완료 (stdout JSON 출력)

**예상 소요:** 2일

---

#### Task 1.3: CODEF 코드 제거 (2일)

**작업 내용:**
- `npm uninstall easycodef-node node-forge` (codef 관련 패키지)
- CODEF 관련 파일 삭제 (위 "제거 대상" 목록)
- `FinancialDashboard.tsx`에서 CodefSyncPanel import를 플레이스홀더로 교체
- `src/types/codef.ts` → `src/types/hometax.ts` 이관 (데이터 타입 유지, CODEF 설정 타입 제거)
- `src/types/financial.ts`의 `codef_sync` 필드를 `hometax_sync`로 변경
- 빌드 확인 (`npm run build`)

**의존성 관계:**
```
FinancialDashboard.tsx
  └── CodefSyncPanel.tsx (제거) → HometaxSyncPanel.tsx (Phase 3에서 구현)
  └── CreditCardSalesPanel.tsx (유지)

CodefSyncPanel.tsx
  └── CertificateSelector.tsx (제거)
  └── codefService.ts (제거)
  └── certificateParser.ts (제거)

API Routes (전부 제거):
  /api/codef/* → /api/hometax/* (Phase 3에서 구현)
```

**완료 기준:**
- [ ] CODEF 관련 파일 전부 삭제됨
- [ ] easycodef-node, node-forge 패키지 제거됨
- [ ] `npm run build` 성공 (에러 없음)
- [ ] Financial 대시보드에서 "홈택스 연동 준비 중" 플레이스홀더 표시
- [ ] 기존 수입/지출 수동 입력 기능 정상 동작 확인

**예상 소요:** 2일

---

#### Task 1.4: 암호화 모듈 구현 (1일)

**작업 내용:**
- 홈택스 ID/PW를 DB에 안전하게 저장하기 위한 AES-256-GCM 암복호화
- 암호화 키는 환경변수로 관리 (ENCRYPTION_KEY)
- Next.js 앱과 스크래핑 워커 모두에서 사용할 수 있는 동일 알고리즘

**구현 사항:**
```typescript
// 공통 인터페이스
interface EncryptedData {
  iv: string;        // 초기화 벡터 (hex)
  encrypted: string; // 암호화된 데이터 (hex)
  tag: string;       // 인증 태그 (hex)
}

function encrypt(plainText: string, key: string): EncryptedData
function decrypt(data: EncryptedData, key: string): string
```

**완료 기준:**
- [ ] encrypt/decrypt 함수 구현 및 단위 테스트 통과
- [ ] Next.js 앱 (`src/lib/encryption.ts`)과 스크래핑 워커 (`src/crypto/encryption.ts`)에 동일 코드 배치
- [ ] 테스트 데이터로 암복호화 라운드트립 검증

**예상 소요:** 1일

---

### Phase 2: Playwright MVP (3주)

**목표:** 홈택스 로그인 + 6종 데이터 수집 동작 확인

#### Task 2.1: 홈택스 로그인 구현 (5일)

**작업 내용:**
- Playwright Chromium으로 홈택스 접속
- ID/PW 로그인 흐름 자동화
- 로그인 실패/CAPTCHA/2FA 감지 및 에러 핸들링
- 세션 관리 (쿠키 저장/복원)

**구현 흐름:**
```
1. https://www.hometax.go.kr 접속
2. 로그인 페이지 이동
3. "아이디 로그인" 탭 선택
4. ID/PW 입력
5. 로그인 버튼 클릭
6. 로그인 결과 확인 (성공/실패/추가인증)
7. 사업자번호 선택 (다수 사업장인 경우)
8. 세션 쿠키 저장
```

**핵심 도전:**
- 홈택스는 키보드 입력 이벤트를 직접 감지 (단순 fill() 미작동 가능)
- 보안 프로그램 설치 요구 팝업 처리
- CAPTCHA 발생 시 수동 개입 알림 필요
- 접속 시간대 제한 (새벽 시간 점검)

**완료 기준:**
- [ ] ID/PW 로그인 성공 (실제 테스트 계정으로 확인)
- [ ] 로그인 실패 시 명확한 에러 메시지 반환
- [ ] 세션 쿠키 저장/복원으로 재로그인 없이 후속 요청 가능
- [ ] 로그인 결과를 `hometax_credentials.last_login_success`에 기록

**예상 소요:** 5일 (홈택스 UI 변경 대응 포함)

---

#### Task 2.2: 전자세금계산서 스크래핑 (3일)

**작업 내용:**
- 매출/매입 세금계산서 목록 조회 페이지 네비게이션
- 기간 설정 (연/월 기준)
- 데이터 테이블 파싱 (HTML → JSON)
- 페이지네이션 처리

**수집 데이터:**
```json
{
  "data_type": "tax_invoice_sales",
  "records": [
    {
      "issue_date": "2026-03-01",
      "supplier_name": "하얀치과",
      "supplier_biz_no": "123-45-67890",
      "buyer_name": "(주)ABC",
      "buyer_biz_no": "987-65-43210",
      "supply_amount": 1000000,
      "tax_amount": 100000,
      "total_amount": 1100000,
      "invoice_type": "일반",
      "status": "승인"
    }
  ]
}
```

**완료 기준:**
- [ ] 세금계산서 매출 목록 조회 + 파싱 성공
- [ ] 세금계산서 매입 목록 조회 + 파싱 성공
- [ ] 100건 이상 페이지네이션 처리
- [ ] `hometax_raw_data` 테이블에 저장 확인

**예상 소요:** 3일

---

#### Task 2.3: 현금영수증 스크래핑 (2일)

**작업 내용:**
- 현금영수증 매출/매입 내역 조회 자동화
- 기존 `CashReceiptPurchaseItem`/`CashReceiptSalesItem` 타입 활용

**수집 데이터:**
```json
{
  "data_type": "cash_receipt_purchase",
  "records": [
    {
      "trade_date": "2026-03-01",
      "trade_time": "14:30:00",
      "store_name": "OO약국",
      "store_biz_no": "111-22-33333",
      "supply_amount": 50000,
      "vat": 5000,
      "total_amount": 55000,
      "approval_no": "12345678",
      "deductible": true
    }
  ]
}
```

**완료 기준:**
- [ ] 현금영수증 매출 내역 수집 + 파싱 성공
- [ ] 현금영수증 매입 내역 수집 + 파싱 성공
- [ ] `hometax_raw_data` 테이블에 저장 확인

**예상 소요:** 2일

---

#### Task 2.4: 사업용 신용카드 매입 스크래핑 (2일)

**작업 내용:**
- 사업용 신용카드 매입세액 공제 내역 조회
- 기존 `BusinessCardDeductionItem`/`BusinessCardDeductionDetail` 타입 활용

**완료 기준:**
- [ ] 사업용 신용카드 매입 내역 수집 + 파싱 성공
- [ ] 공제/불공제 구분 정확도 확인
- [ ] `hometax_raw_data` 테이블에 저장 확인

**예상 소요:** 2일

---

#### Task 2.5: 신용카드 매출 스크래핑 (2일)

**작업 내용:**
- 신용카드 매출자료 조회
- 기존 `CreditCardSalesData` 타입 활용
- 월별 집계 + 카드사별 상세

**완료 기준:**
- [ ] 신용카드 매출 데이터 수집 + 파싱 성공
- [ ] `hometax_raw_data` 테이블에 저장 확인

**예상 소요:** 2일

---

#### Task 2.6: Job Queue 워커 구현 (3일)

**작업 내용:**
- PostgreSQL 기반 Job Queue 소비자 구현
- `SELECT ... FOR UPDATE SKIP LOCKED` 패턴으로 동시성 안전한 Job 획득
- Job 상태 관리 (pending → running → completed/failed)
- 재시도 로직 (exponential backoff)
- 워커 heartbeat (30초마다 scraping_workers 업데이트)

**Job 처리 흐름:**
```
1. scraping_jobs에서 status='pending' 인 Job 획득 (FOR UPDATE SKIP LOCKED)
2. status='running'으로 업데이트, worker_id 기록
3. hometax_credentials에서 인증정보 복호화
4. 홈택스 로그인
5. data_types 배열 순회하며 스크래핑 실행
6. 결과를 hometax_raw_data에 저장
7. scraping_sync_logs에 동기화 로그 기록
8. status='completed' + result_summary 업데이트
9. 실패 시 retry_count 증가, max_retries 미만이면 status='pending'으로 복원
```

**완료 기준:**
- [ ] Job 획득 → 실행 → 완료 전체 흐름 동작
- [ ] 동시에 2개 워커가 같은 Job을 중복 처리하지 않음
- [ ] 실패 시 3회까지 자동 재시도
- [ ] 워커 heartbeat가 30초마다 기록됨
- [ ] 워커 비정상 종료 시 stale Job 감지 (heartbeat 5분 초과)

**예상 소요:** 3일

---

### Phase 3: Next.js 연동 (2주)

**목표:** 프론트엔드 UI + API 연결

#### Task 3.1: API 엔드포인트 구현 (3일)

**엔드포인트 설계:**

```
POST   /api/hometax/credentials      # 홈택스 인증정보 등록/수정
GET    /api/hometax/credentials      # 인증정보 조회 (비밀번호 제외)
DELETE /api/hometax/credentials      # 인증정보 삭제

POST   /api/hometax/sync             # 수동 동기화 요청 (Job 생성)
GET    /api/hometax/sync/status      # 동기화 상태 조회
GET    /api/hometax/sync/logs        # 동기화 로그 목록

GET    /api/hometax/data             # 수집 데이터 조회 (타입/기간 필터)
GET    /api/hometax/data/summary     # 기간별 요약 통계

GET    /api/hometax/workers          # 워커 상태 조회 (admin용)
```

**완료 기준:**
- [ ] 9개 API 엔드포인트 구현 및 응답 테스트
- [ ] 인증정보 등록 시 비밀번호 AES-256-GCM 암호화 저장
- [ ] 동기화 요청 시 `scraping_jobs` 테이블에 Job 생성
- [ ] RLS 정책에 따른 접근 제어 동작

**예상 소요:** 3일

---

#### Task 3.2: HometaxSyncPanel 컴포넌트 구현 (3일)

**작업 내용:**
- 기존 `CodefSyncPanel.tsx`을 참고하여 `HometaxSyncPanel.tsx` 재작성
- 인증정보 등록/수정 폼 (ID/PW)
- 수동 동기화 버튼 + 실시간 진행 상태 표시
- 마지막 동기화 결과 표시
- 동기화 이력 로그 테이블

**UI 구성:**
```
[홈택스 연동 설정]
├── 인증정보 섹션
│   ├── 사업자등록번호 (표시)
│   ├── 홈택스 ID (입력)
│   ├── 홈택스 PW (입력, 마스킹)
│   └── 저장/수정 버튼
├── 동기화 섹션
│   ├── 연/월 선택
│   ├── 데이터 유형 체크박스 (6종)
│   ├── [수동 동기화] 버튼
│   └── 진행 상태 프로그레스 바
└── 동기화 이력 섹션
    └── 최근 10건 로그 테이블
```

**완료 기준:**
- [ ] 인증정보 CRUD 동작
- [ ] 수동 동기화 요청 및 상태 폴링 동작
- [ ] 기존 FinancialDashboard에 통합되어 렌더링
- [ ] 비밀번호가 프론트엔드에 노출되지 않음 (저장 후 마스킹만 표시)

**예상 소요:** 3일

---

#### Task 3.3: 수집 데이터 표시 UI (4일)

**작업 내용:**
- 데이터 유형별 탭/뷰 구현
- 테이블 형태로 상세 데이터 표시
- 월별 요약 차트 (매출/매입 추이)
- 기존 FinancialDashboard의 `codef_sync` 데이터를 `hometax_sync`로 교체

**컴포넌트:**
```
HometaxDataView.tsx
├── HometaxSummaryCards.tsx    # 6종 데이터 요약 카드
├── TaxInvoiceTable.tsx        # 세금계산서 테이블
├── CashReceiptTable.tsx       # 현금영수증 테이블
├── BusinessCardTable.tsx      # 사업용 카드 테이블
└── CreditCardSalesChart.tsx   # 신용카드 매출 차트
```

**완료 기준:**
- [ ] 6종 데이터가 각각 적절한 UI로 표시됨
- [ ] 기간 필터 (연/월) 동작
- [ ] 데이터 없을 때 적절한 빈 상태 표시
- [ ] 기존 Financial 대시보드와 자연스럽게 통합

**예상 소요:** 4일

---

### Phase 4: 자동화 (1.5주)

**목표:** 일일 배치, 월말 결산, 알림

#### Task 4.1: 일일 배치 스케줄러 (2일)

**작업 내용:**
- node-cron 또는 node-schedule로 매일 07:00 KST 자동 실행
- 활성 클리닉 목록 조회 → 각각 daily_sync Job 생성
- 전일(D-1) 데이터 수집
- 클리닉 간 간격 두기 (rate limiting, 5분 간격)

**스케줄 설계:**
```
07:00 KST - 일일 배치 시작
  - 활성 클리닉 N개에 대해 순차적으로 Job 생성
  - 각 Job 간 5분 간격 (홈택스 부하 분산)
  - 전일 데이터 6종 수집
```

**완료 기준:**
- [ ] 매일 07:00에 자동으로 daily_sync Job 생성
- [ ] 클리닉 간 5분 간격으로 순차 실행
- [ ] 실패 Job에 대한 재시도 동작
- [ ] 전일 대비 데이터 변경 감지 (hash 비교)

**예상 소요:** 2일

---

#### Task 4.2: 월말 결산 자동화 (3일)

**작업 내용:**
- 매월 마지막 영업일 + 1일에 전월 전체 데이터 재수집
- 6종 데이터의 월 합계 계산
- 기존 `FinancialSummary`의 홈택스 연동 필드 자동 업데이트
- 결산 보고서 생성 (JSON → 대시보드 표시)

**결산 데이터 구조:**
```json
{
  "clinic_id": "...",
  "year": 2026,
  "month": 3,
  "settlement": {
    "tax_invoice_sales": { "count": 45, "supply": 12000000, "tax": 1200000 },
    "tax_invoice_purchase": { "count": 23, "supply": 5000000, "tax": 500000 },
    "cash_receipt_sales": { "count": 120, "total": 3500000 },
    "cash_receipt_purchase": { "count": 8, "total": 250000 },
    "business_card_purchase": { "count": 35, "total": 1800000 },
    "credit_card_sales": { "count": 300, "total": 15000000 }
  }
}
```

**완료 기준:**
- [ ] 월초에 전월 데이터 자동 재수집 및 결산
- [ ] FinancialSummary에 홈택스 데이터 반영
- [ ] 전월 대비 증감률 계산

**예상 소요:** 3일

---

#### Task 4.3: 알림 시스템 (2일)

**작업 내용:**
- 일일 수집 완료 후 요약 알림
- 수집 실패 시 에러 알림
- 알림 채널: 앱 내 알림 (Supabase Realtime) + 향후 카카오톡 확장 가능
- `notifications` 테이블에 알림 기록

**알림 유형:**
```
1. 일일 수집 완료: "3/11 홈택스 데이터 수집 완료 - 세금계산서 3건, 현금영수증 12건"
2. 수집 실패: "3/11 홈택스 데이터 수집 실패 - 로그인 오류 (3회 재시도 후 실패)"
3. 월말 결산: "2월 결산 완료 - 매출 1,500만원, 매입 800만원"
4. 이상 감지: "3/11 현금영수증 매출이 평소 대비 200% 증가"
```

**완료 기준:**
- [ ] 수집 완료/실패 시 앱 내 알림 생성
- [ ] 대시보드에서 알림 확인 가능
- [ ] 월말 결산 요약 알림 동작

**예상 소요:** 2일

---

### Phase 5: Protocol 전환 (향후, 4주+)

**목표:** Playwright 의존 제거, HTTP 직접 통신으로 전환

> 이 Phase는 Phase 2 MVP가 안정적으로 운영된 후 착수합니다.
> 홈택스 API 역분석이 필요하므로 일정이 유동적입니다.

#### Task 5.1: 홈택스 통신 프로토콜 역분석 (7일)

**작업 내용:**
- Chrome DevTools / Playwright의 네트워크 탭으로 요청/응답 캡처
- 로그인 프로세스의 HTTP 요청 분석 (RSA 암호화, NTS 보안 모듈)
- 각 데이터 조회 페이지의 실제 API 엔드포인트 파악
- 필수 헤더, 쿠키, 토큰 식별

**분석 대상:**
```
1. 로그인 요청 (POST) - RSA 공개키 획득 → 비밀번호 암호화 → 인증 토큰
2. 세금계산서 조회 API - 요청 파라미터, 응답 JSON 구조
3. 현금영수증 조회 API - 동일
4. 사업용 카드 조회 API - 동일
5. 신용카드 매출 조회 API - 동일
```

**예상 난이도:** 높음 (홈택스 보안 모듈, 암호화 처리)

**완료 기준:**
- [ ] 6종 데이터 각각의 HTTP 요청 스펙 문서화
- [ ] 로그인 프로세스 역분석 완료
- [ ] 최소 1종 데이터를 HTTP 직접 호출로 수집 성공

**예상 소요:** 7일

---

#### Task 5.2: HTTP 클라이언트 구현 (5일)

**작업 내용:**
- Playwright 대신 `undici`/`node-fetch`로 직접 HTTP 요청
- 홈택스 로그인 프로토콜 구현 (RSA 암호화 등)
- 6종 데이터 수집을 HTTP API로 전환
- 기존 Scraper 인터페이스 유지 (교체 투명)

**완료 기준:**
- [ ] Playwright 없이 로그인 성공
- [ ] 6종 데이터 모두 HTTP 직접 수집 성공
- [ ] Docker 이미지 크기 대폭 감소 (Chromium 제거)
- [ ] 수집 속도 50% 이상 향상

**예상 소요:** 5일

---

#### Task 5.3: 안정화 및 폴백 (3일)

**작업 내용:**
- Protocol 방식 실패 시 Playwright 폴백
- 홈택스 UI 변경 감지 및 자동 알림
- 안정성 모니터링 (성공률 추적)

**완료 기준:**
- [ ] Protocol 실패 시 자동으로 Playwright 폴백
- [ ] 연속 3회 실패 시 관리자 알림
- [ ] 주간 성공률 리포트

**예상 소요:** 3일

---

## 3. 팀원 구성

### 최소 구성 (2명) -- 1인이 겸임 가능

| 역할 | 인원 | 담당 업무 |
|------|------|----------|
| **풀스택 개발자** | 1명 | Next.js API, 프론트엔드 UI, DB 스키마, 배포 |
| **스크래핑 엔지니어** | 1명 | Playwright 스크래퍼, 홈택스 역분석, 워커 운영 |

**1인 개발 시:** 풀스택 개발자가 모든 역할을 수행. Phase 1~4까지 약 8~10주 소요.

### 권장 구성 (3~4명)

| 역할 | 인원 | 담당 업무 | Phase 참여 |
|------|------|----------|-----------|
| **백엔드/인프라** | 1명 | DB 스키마, Job Queue, Docker, 배포, 모니터링 | 1, 2.6, 4 |
| **스크래핑 엔지니어** | 1명 | 홈택스 로그인, 6종 스크래퍼, 파싱, Protocol 역분석 | 2, 5 |
| **프론트엔드** | 1명 | Next.js API, React UI, 대시보드 통합 | 1.3, 3 |
| **QA/DevOps** (선택) | 0.5명 | 테스트 시나리오, 모니터링 대시보드, 알림 설정 | 4, 전체 |

### 역할 간 협업 포인트

```
백엔드 ←→ 스크래핑 엔지니어
  - DB 스키마 협의 (hometax_raw_data 구조)
  - Job Queue 프로토콜 합의
  - 암호화 키 관리 방식

스크래핑 엔지니어 ←→ 프론트엔드
  - 수집 데이터 JSON 구조 합의
  - 동기화 상태 폴링 API 스펙

백엔드 ←→ 프론트엔드
  - API 엔드포인트 스펙 (요청/응답 타입)
  - 인증/권한 처리 방식

전원 ←→ QA
  - 테스트 시나리오 공유
  - 홈택스 테스트 계정 관리
```

---

## 4. 기술 스택 상세

### 스크래핑 서비스

| 구분 | 선택 | 비고 |
|------|------|------|
| Runtime | Node.js 20 LTS | Next.js와 동일 언어 (TypeScript 공유) |
| Language | TypeScript 5.x | 타입 안전성 |
| Browser | Playwright (Chromium) | Phase 2 MVP |
| HTTP Client | undici | Phase 5 Protocol 전환용 |
| DB Client | @supabase/supabase-js | service_role key 사용 |
| Scheduler | node-cron | 일일/월말 배치 |
| Encryption | Node.js crypto | AES-256-GCM |
| Logging | Pino | JSON structured logging |
| Container | Docker + docker-compose | Mac mini M4에서 운영 |
| Process Manager | PM2 (컨테이너 내) | 재시작, 로그 관리 |

### 대안으로 고려했지만 채택하지 않은 것

| 대안 | 미채택 사유 |
|------|------------|
| Python + Selenium | 기존 프로젝트가 TypeScript이므로 언어 통일이 유리 |
| Puppeteer | Playwright가 더 안정적이고 auto-wait 지원 |
| Redis Job Queue (BullMQ) | 추가 인프라 부담, PostgreSQL로 충분 |
| Go/Rust 스크래퍼 | 팀 학습 비용, TypeScript 타입 공유 불가 |
| Supabase Edge Functions | Playwright 실행 불가, 실행 시간 제한 |

### API 엔드포인트 상세

```
# 인증정보 관리
POST   /api/hometax/credentials
  Body: { hometaxUserId, password, businessNumber }
  Response: { success: true, credentialId }

GET    /api/hometax/credentials
  Query: ?clinicId=xxx
  Response: { hometaxUserId, businessNumber, isActive, lastLoginSuccess }

DELETE /api/hometax/credentials
  Query: ?clinicId=xxx
  Response: { success: true }

# 동기화
POST   /api/hometax/sync
  Body: { clinicId, year, month, dataTypes[], jobType }
  Response: { jobId, status: 'pending' }

GET    /api/hometax/sync/status
  Query: ?jobId=xxx
  Response: { status, progress, resultSummary, errorMessage }

GET    /api/hometax/sync/logs
  Query: ?clinicId=xxx&year=2026&month=3&limit=10
  Response: { logs: [...] }

# 데이터 조회
GET    /api/hometax/data
  Query: ?clinicId=xxx&dataType=tax_invoice_sales&year=2026&month=3
  Response: { data: { records: [...], totalAmount, recordCount } }

GET    /api/hometax/data/summary
  Query: ?clinicId=xxx&year=2026&month=3
  Response: { summary: { byType: {...}, totals: {...} } }

# 관리자
GET    /api/hometax/workers
  Response: { workers: [{ id, status, currentJob, lastHeartbeat }] }
```

### 보안 구현 사항

| 항목 | 구현 방법 |
|------|----------|
| **비밀번호 저장** | AES-256-GCM 암호화 (환경변수 키), DB에는 암호문만 저장 |
| **비밀번호 전송** | HTTPS (TLS 1.3) 필수, 프론트→API 전송 후 즉시 암호화 |
| **API 인증** | Supabase Auth (JWT) + RLS (clinic_id 기반 행 수준 접근 제어) |
| **DB 접근** | 스크래핑 워커는 service_role key (서버 전용, 환경변수) |
| **로깅** | 비밀번호/토큰 마스킹, PII 최소화 |
| **환경변수** | .env 파일 git ignore, Docker secrets 활용 |
| **네트워크** | Mac mini ↔ Supabase: HTTPS, 워커 내부 통신만 허용 |
| **감사 로그** | 인증정보 변경, 동기화 실행 이력 모두 기록 |

---

## 5. 리스크와 대응 방안

### 높은 리스크

| 리스크 | 확률 | 영향 | 대응 방안 |
|--------|------|------|----------|
| **홈택스 UI/API 변경** | 높음 | 전체 스크래핑 중단 | Selector 분리 관리, 변경 감지 알림, 빠른 패치 프로세스 |
| **로그인 보안 강화 (CAPTCHA/2FA)** | 중간 | 자동 로그인 불가 | 수동 로그인 폴백, 세션 쿠키 수명 최대화, IP 고정 |
| **홈택스 접속 차단 (IP 밴)** | 중간 | 수집 불가 | 요청 간격 조절 (5초+), User-Agent 로테이션, 프록시 준비 |
| **암호화 키 유출** | 낮음 | 고객 비밀번호 노출 | 키 로테이션 절차, 환경변수 관리 강화, 정기 감사 |

### 중간 리스크

| 리스크 | 확률 | 영향 | 대응 방안 |
|--------|------|------|----------|
| **Mac mini 장애** | 낮음 | 배치 중단 | Docker restart policy, heartbeat 모니터링, 수동 트리거 가능 |
| **Supabase 연결 문제** | 낮음 | 데이터 저장 실패 | 재시도 로직, 로컬 임시 저장, connection pooling |
| **데이터 파싱 오류** | 중간 | 잘못된 금액 표시 | 원시 데이터 보존, 파싱 결과 검증 로직, 수동 확인 UI |
| **멀티테넌트 부하** | 중간 | 수집 지연 | 클리닉 간 시차 배치, Job 우선순위, 수집 시간대 분산 |

### 대응 전략 요약

1. **원시 데이터 항상 보존**: 파싱 로직 변경 시 재처리 가능
2. **Selector 외부화**: 홈택스 CSS/XPath selector를 config 파일로 분리
3. **모니터링 필수**: 워커 heartbeat + 수집 성공률 + 알림
4. **점진적 전환**: CODEF 제거 → Playwright MVP → Protocol 전환 (각 단계 안정화 후 다음)

---

## 6. 전체 일정 요약

| Phase | 기간 | 주요 산출물 |
|-------|------|-----------|
| Phase 1: 기반 구축 | 2주 | DB 스키마, 워커 프로젝트, CODEF 제거 |
| Phase 2: Playwright MVP | 3주 | 로그인 + 6종 스크래퍼 + Job Queue |
| Phase 3: Next.js 연동 | 2주 | API 9개 + UI 컴포넌트 |
| Phase 4: 자동화 | 1.5주 | 일일 배치, 월말 결산, 알림 |
| **Phase 1~4 합계** | **약 8.5주** | **MVP 완성** |
| Phase 5: Protocol 전환 | 4주+ | HTTP 직접 통신 (선택) |

> 1인 개발 시 약 10~12주, 3명 팀일 경우 약 6~7주 예상

---

## 7. 작업 의존성 다이어그램

```
Phase 1
  Task 1.1 (DB 스키마) ──┐
  Task 1.2 (워커 초기화) ─┤──→ Phase 2 (전체)
  Task 1.3 (CODEF 제거) ──┘──→ Phase 3 (Task 3.2, 3.3)
  Task 1.4 (암호화) ──────────→ Phase 2 (Task 2.1)

Phase 2
  Task 2.1 (로그인) ──→ Task 2.2~2.5 (스크래퍼들, 병렬 가능)
  Task 2.2~2.5 ────────→ Task 2.6 (Job Queue)

Phase 3
  Task 3.1 (API) ──→ Task 3.2 (SyncPanel) ──→ Task 3.3 (데이터 UI)

Phase 4
  Task 4.1 (배치) ──┐
  Task 4.2 (결산) ──┤──→ Task 4.3 (알림)
                    │
  Phase 2.6 필요 ──┘

Phase 5 (Phase 2 안정화 후)
  Task 5.1 (역분석) ──→ Task 5.2 (HTTP) ──→ Task 5.3 (안정화)
```

---

## 8. 환경변수 목록

### 스크래핑 워커 (.env)
```env
# Supabase
SUPABASE_URL=https://beahjntkmkfhpcbhfnrr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>

# 암호화
ENCRYPTION_KEY=<32-byte-hex-key>

# 워커 설정
WORKER_ID=worker-macmini-01
WORKER_POLL_INTERVAL_MS=5000
WORKER_HEARTBEAT_INTERVAL_MS=30000

# Playwright
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_TIMEOUT_MS=30000

# 배치 스케줄
DAILY_SYNC_CRON=0 7 * * *          # 매일 07:00 KST
MONTHLY_SETTLEMENT_CRON=0 8 1 * *   # 매월 1일 08:00 KST
CLINIC_INTERVAL_MINUTES=5            # 클리닉 간 간격

# 로깅
LOG_LEVEL=info
```

### Next.js 앱 (추가 환경변수)
```env
# 기존 환경변수 유지 + 추가
ENCRYPTION_KEY=<32-byte-hex-key>  # 워커와 동일한 키
```

---

## 9. 테스트 전략

| 단계 | 방법 | 범위 |
|------|------|------|
| 단위 테스트 | Vitest | 암호화, 파싱, 데이터 변환 |
| 통합 테스트 | Playwright Test | 로그인, 스크래핑 전체 흐름 |
| API 테스트 | Next.js 테스트 | API 엔드포인트 요청/응답 |
| E2E 테스트 | Playwright | 대시보드에서 동기화 → 데이터 표시 |
| 수동 테스트 | 브라우저 | 실제 홈택스 계정으로 최종 확인 |

**테스트 계정:** 실제 홈택스 테스트 사업자 계정 필요 (국세청 테스트 환경 또는 실제 계정)

---

**계획 작성 완료. 실행은 `/oh-my-claudecode:start-work hometax-scraping-system`으로 시작.**
