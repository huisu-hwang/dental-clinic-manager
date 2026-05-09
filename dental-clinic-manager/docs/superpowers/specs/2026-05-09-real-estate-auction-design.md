# 부동산 경매 투자 분석 기능 설계 (Real Estate Auction)

**작성일:** 2026-05-09
**상태:** 설계 확정 — 구현 계획(Plan) 단계로 이행 예정
**카테고리:** 투자 (Investment)
**메뉴 위치:** `/investment/auction`

---

## 1. 목표 (Goal)

전국 법원에 등록된 경매 물건의 핵심 투자 정보를 빠르게 파악할 수 있는 도구를 제공한다.
사용자의 1차 가치는 **"투자 수익률을 빠르게 판단"** 이며, 이를 위해 다음을 만족한다.

- 모든 물건 종류(아파트·오피스텔·빌라·상가·토지·공장·임야 등)를 커버
- 데이터 종류와 무관하게 항상 계산 가능한 **1차 객관 지표**를 제공
- 자동 시세 매칭이 가능한 물건은 **2차 시세 ROI**까지 자동 표시
- 사용자 입력으로 **3차 임대 시뮬레이션** 가능
- 권리분석은 룰 기반 1차 추출 + AI 코멘트(사용자 클릭 시) 보강

비목표(Non-Goals):
- 직접 입찰·전자입찰 자동화 (법원 대법원 시스템 외부 자동 입찰은 정책상 불가)
- 실시간 경매 진행 결과 중계 (다음 새벽 배치로 갱신)
- 지도 클러스터링 / 임장 노트 / 공동투자 메모 (Phase 2)

---

## 2. 범위 결정 사항 요약

| 결정 항목 | 채택 | 사유 |
|---|---|---|
| 데이터 소스 | 하이브리드 (자체 스크래핑 + 공공 OpenAPI) | 공공 OpenAPI만으로는 권리·임차인 등 핵심 정보 부재 |
| 대상 물건 | 전체 (아파트~토지·공장·임야) | 사용자 요구 |
| ROI 모델 | 3단계 다층화 (1차/2차/3차) | 종류별 정확도 차이를 명시적으로 노출 |
| 핵심 기능 | 표준 MVP + AI 권리분석 | 권리분석/낙찰가율/시뮬은 투자 결정 필수 |
| 스크래핑 주기 | 매일 1회 새벽 03:00 KST | 경매 도메인 변동 속도와 부합, 차단 위험 최소 |
| 시세 소스 | 국토부 실거래가 + 공시지가 OpenAPI | 합법·무료·종류별 모두 제공 |
| AI 호출 시점 | 사용자 "AI 분석" 버튼 클릭 시 + 24h 캐시 | 비용 통제, 의도된 호출만 발생 |
| 결제·구독 | 기존 투자 구독 게이트 재사용 | 별도 결제 없음 |

---

## 3. 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                  Mac mini M4 (스크래핑 워커)              │
│   - courtauction.go.kr (Playwright)                      │
│   - data.go.kr OpenAPI (실거래가 / 공시지가)              │
│   - 매일 03:00 KST cron                                  │
│   - PDF 파싱 + 시세 매칭 + 알림 INSERT                    │
└──────────────────────┬──────────────────────────────────┘
                       │ upsert
                       ▼
            ┌─────────────────────┐
            │  Supabase Postgres  │
            │  (테이블 7개)        │
            └──────────┬──────────┘
                       │ read-only
                       ▼
        ┌──────────────────────────────┐
        │  Next.js 15 (Vercel)         │
        │  - /investment/auction       │
        │  - /api/auction/*            │
        │  - Claude Haiku 4.5 (AI)     │
        └──────────────────────────────┘
```

**원칙:**

1. **워커와 앱 완전 분리** — 스크래핑 차단/오류가 사용자 화면에 직접 영향 없음.
2. **워커 위치 재사용** — 기존 `scraping-worker/` 디렉토리 산하 `auction/` 서브디렉토리로 추가. 홈택스 워커와 cron, 로깅, 헬스체크 인프라 공유.
3. **AI 호출은 앱 서버 책임** — 사용자 요청 컨텍스트(인증, 한도 체크)에서 처리.
4. **PDF 파싱은 워커에서 1차 룰 기반** — 정규식 파싱이 실패한 케이스는 raw_text 보존 → AI가 보충.

---

## 4. 데이터 모델

### 4-1. `auction_items` — 경매 물건 마스터

```sql
CREATE TABLE auction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 식별자 (전국 유일)
  case_number VARCHAR(32) NOT NULL,        -- "2026타경12345"
  item_number INTEGER NOT NULL,            -- 1물건/2물건...
  court_name VARCHAR(64) NOT NULL,
  court_code VARCHAR(8) NOT NULL,

  -- 분류 / 소재지
  property_type VARCHAR(32) NOT NULL,      -- apt|officetel|villa|house|commercial|land|factory|forest|...
  address_road TEXT,
  address_jibun TEXT,
  sido VARCHAR(16), sigungu VARCHAR(32), eupmyeondong VARCHAR(32),
  pnu VARCHAR(19),                         -- 필지고유번호 (시세 매칭 키)

  -- 면적·구조
  land_area_m2 NUMERIC(12,2),
  building_area_m2 NUMERIC(12,2),
  floor INT, total_floors INT,
  building_year INT,

  -- 가격 (1차 ROI 핵심)
  appraisal_price BIGINT NOT NULL,
  min_bid_price BIGINT NOT NULL,
  bid_deposit BIGINT,
  failure_count INT DEFAULT 0,
  discount_rate NUMERIC(5,2),              -- 감정가 대비 할인율 (%)

  -- 일정·상태
  next_auction_date DATE,
  status VARCHAR(16) NOT NULL,             -- active|pending_decision|sold|cancelled|postponed
  sold_price BIGINT,
  sold_at DATE,

  -- 원본 링크
  source_url TEXT,
  notice_pdf_url TEXT,
  appraisal_pdf_url TEXT,
  photos JSONB DEFAULT '[]'::jsonb,

  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (court_code, case_number, item_number)
);

CREATE INDEX idx_auction_items_status_date ON auction_items (status, next_auction_date);
CREATE INDEX idx_auction_items_region ON auction_items (sido, sigungu);
CREATE INDEX idx_auction_items_type_discount ON auction_items (property_type, discount_rate DESC);
CREATE INDEX idx_auction_items_pnu ON auction_items (pnu);
```

### 4-2. `auction_history` — 회차별 결과 이력

```sql
CREATE TABLE auction_history (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  round_no INT NOT NULL,                   -- 1=신건, 2=1차 유찰 후
  scheduled_date DATE NOT NULL,
  min_bid_price BIGINT NOT NULL,
  result VARCHAR(16),                      -- failed|sold|cancelled|postponed|pending
  sold_price BIGINT,
  bid_count INT,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, round_no)
);
```

### 4-3. `auction_market_prices` — 시세 매칭 캐시

```sql
CREATE TABLE auction_market_prices (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL,             -- molit_apt_trade|molit_officetel_trade|...
  matched_complex VARCHAR(128),
  median_price_3m BIGINT,
  trade_count_3m INT,
  median_price_12m BIGINT,
  last_trade_date DATE,
  match_confidence VARCHAR(8),             -- high|mid|low
  raw JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, source)
);
```

### 4-4. `auction_rights_analysis` — 권리분석 자동 추출

```sql
CREATE TABLE auction_rights_analysis (
  item_id UUID PRIMARY KEY REFERENCES auction_items(id) ON DELETE CASCADE,
  base_right_type VARCHAR(32),             -- 근저당|가압류|담보가등기 (말소기준)
  base_right_date DATE,
  has_senior_tenant BOOLEAN,
  tenant_count INT,
  total_deposit BIGINT,
  unsettled_taxes BIGINT,
  risk_flags JSONB DEFAULT '{}'::jsonb,
  parser_version VARCHAR(8),
  parse_status VARCHAR(16),                -- ok|partial|failed
  raw_text TEXT,                           -- AI 분석 입력으로 재사용
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4-5. `auction_ai_comments` — AI 코멘트 캐시

```sql
CREATE TABLE auction_ai_comments (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  prompt_version VARCHAR(8) NOT NULL,
  model VARCHAR(32) NOT NULL,              -- claude-haiku-4-5-20251001
  summary TEXT NOT NULL,
  risk_score INT,
  bullet_points JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, prompt_version)
);
```

### 4-6. `auction_user_favorites` — 관심물건

```sql
CREATE TABLE auction_user_favorites (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  memo TEXT,
  target_bid_price BIGINT,
  expected_extra_cost BIGINT,
  expected_monthly_rent BIGINT,
  alert_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);
```

### 4-7. `auction_user_filters` — 저장된 검색 (D-3 매칭 알림용)

```sql
CREATE TABLE auction_user_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  filter_json JSONB NOT NULL,
  alert_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 데이터 모델 핵심 원칙

- **단일 진실원천**: 사건번호+법원코드+물건번호로 전국 유일성 보장.
- **시세는 분리**: 국토부 OpenAPI 갱신 주기와 경매 데이터 분리 → 시세만 별도 재계산 가능.
- **AI 캐시는 prompt_version 키로 무효화**: 프롬프트 개선 시 자동 재생성.
- **권리분석 raw_text 보존**: 룰 파싱이 부분 성공하더라도 원문 보관해 AI 보충 가능.
- **이력 분리**: `auction_history`로 회차별 결과 누적 → 동일 단지 낙찰가율 통계의 기반.

---

## 5. ROI 3단계 계산 모델

### 1차 — 객관 지표 (모든 물건 공통, 자동)

| 지표 | 계산식 | 의미 |
|---|---|---|
| 할인율 | `(appraisal_price − min_bid_price) / appraisal_price × 100` | 1차 신호 |
| 유찰 횟수 | `failure_count` | 위험 또는 기회 |
| 회차 | `failure_count + 1` | 통상 회차당 20~30% 추가 하락 |
| D-day | `next_auction_date − today` | 매각기일까지 남은 일수 |
| 응찰보증금 | `min_bid_price × 0.1` (또는 명세서 표기) | 즉시 필요한 현금 |
| ㎡당 최저가 | `min_bid_price / building_area_m2` | 면적 정규화 비교 |

목록 카드 한 줄에 **할인율 / 유찰N / D-N / ㎡당가** 4개 노출. 정렬·필터 모두 1차 지표로 가능.

### 2차 — 시세 매칭 ROI (자동 매칭 가능 물건)

매칭 신뢰도 3단계:

| 신뢰도 | 조건 | 화면 표시 |
|---|---|---|
| **High** | PNU + 동·호수 정확 매칭, 같은 단지 3개월 거래 ≥ 3건 | 진하게 + 체크 아이콘 |
| **Mid** | 단지·평형 매칭은 되지만 거래량 적거나 6개월 이상 경과 | 회색 + 주의 아이콘 |
| **Low** | 좌표 기반 추정 (빌라·연립 다수) | "추정" 라벨 + 흐리게 |

```
예상 시세      = median_price_3m  (또는 12m fallback)
예상 매도차익  = 예상 시세 − (최저입찰가 + 취득세 + 등기비 + 명도/수리/체납)
시세 대비 할인 = (예상 시세 − 최저입찰가) / 예상 시세 × 100
단순 수익률    = 예상 매도차익 / (최저입찰가 + 부대비용) × 100
```

부대비용 자동 추정 (사용자 수정 가능):

- 취득세: `매수가 × 4.6%` (주거 1주택 기준; 다주택/상가/토지는 `property_type`별 룰 테이블)
- 등기·법무비: `매수가 × 0.7%` 추정
- 명도비: 거주 임차인 있을 시 200~500만원 디폴트
- 수리비: 사용자 입력 (디폴트 0)
- 체납 관리비/세금: 권리분석에서 추출된 값

토지·공장·임야는 시세 매칭 자체가 안 되므로 **2차 지표는 회색 처리 + "수동 시세 입력" 버튼** 만 노출.

### 3차 — 임대 수익 시뮬 (사용자 입력 트리거)

```
연간 순임대수익 = (월세 × 12) − (관리비 + 재산세 + 기타)
임대수익률      = 연간 순임대수익 / 총 투자비용 × 100
원금 회수기간   = 총 투자비용 / 연간 순임대수익 (년)
```

상세 페이지 "시뮬레이터" 탭에 **슬라이더 UI**로 응찰가·예상 월세·수리비를 즉시 조정 → 차트/숫자 실시간 반영. "관심물건 저장" 시 `auction_user_favorites`의 입력값으로 보존.

### AI 권리분석 코멘트 (사용자 클릭)

```
입력: rights_analysis.raw_text + auction_items 핵심 필드 + auction_history
모델: claude-haiku-4-5-20251001
출력: { summary, risk_score(0~100), bullet_points[] }
캐시: prompt_version 키 + 24h TTL
가드: 사용자당 일 50회 호출 한도
프롬프트 캐싱: 시스템 프롬프트 + 권리분석 룰 가이드는 cache_control 적용
```

### ROI 노출 매트릭스

| 위치 | 1차 | 2차 | 3차 | AI |
|---|---|---|---|---|
| 목록 카드 | ✅ | High일 때만 | — | — |
| 상세 헤더 | ✅ | ✅ | — | — |
| 시뮬레이터 탭 | — | ✅ | ✅ | — |
| 권리분석 탭 | — | — | — | ✅ (버튼) |

---

## 6. 라우팅·UI 구성

### 6-1. 사이드바 메뉴 추가

[src/app/investment/layout.tsx](../../src/app/investment/layout.tsx)의 `NAV_ITEMS`에 추가 (스마트머니 분석 다음, 자동매매 앞):

```ts
{ id: 'auction', label: '부동산 경매', icon: Gavel, href: '/investment/auction' }
```

### 6-2. 페이지 라우트

| 경로 | 설명 |
|---|---|
| `/investment/auction` | 목록 + 필터 (URL query string 양방향 동기화) |
| `/investment/auction/[itemId]` | 상세 (5개 탭) |
| `/investment/auction/favorites` | 관심물건 + 시뮬 비교 |

### 6-3. 목록 페이지

- 필터 칩: 지역(시도→시군구), 용도, 최소 할인율, 유찰 횟수 이상, D-day 이내, 면적 범위, 감정가 범위
- 정렬: 할인율↓(디폴트), D-day↑, 감정가, 유찰횟수
- 카드: 사진 썸네일, 용도/주소, 사건번호/법원, 감정가/최저가/할인율, 시세대비(High일 때만), 유찰N, D-day, ㎡당가, ⭐ 토글
- 페이지네이션: 무한 스크롤 30건 단위
- 데스크톱 2열 / 모바일 1열
- 저장된 필터: "💾 필터 저장" 버튼 → `auction_user_filters` INSERT

### 6-4. 상세 페이지 탭

| 탭 | 내용 |
|---|---|
| 개요 | 사진 갤러리, Kakao 정적 지도, 면적·층·연식, 감정가 vs 시세 비교 막대 |
| 시뮬레이터 | 응찰가/예상 월세/수리비 슬라이더 → 매도차익·임대수익률·회수기간 실시간 |
| 권리분석 | 자동 추출 정보 표 + 위험 플래그 + **🤖 AI 권리분석 보기** 버튼 |
| 이력·통계 | 회차별 가격 변동 표 + 동일 단지 최근 6개월 낙찰가율 차트 + 응찰자수 평균 |
| 첨부 | 매각물건명세서·감정평가서 PDF 외부 링크 (보안상 새 창) |

### 6-5. 관심물건 페이지

- 저장된 카드 리스트 + 저장된 시뮬 결과(목표 응찰가, 예상 수익률) 표시
- D-3 이내 매각기일 임박 물건 상단 핀 고정
- 표 형태로 토글 가능 (다중 비교)

### 6-6. 디자인 시스템 준수

- shadcn/ui: `Button`, `Card`, `Tabs`, `Sheet`(필터 드로어), `Slider`, `Badge`(신뢰도/위험)
- 색상: 기존 투자 카테고리 토큰 (`bg-at-surface`, `text-at-accent`) 그대로 사용
- 차트: `recharts` 사용 (시세 비교, 낙찰가율, 시뮬 결과)
- 아이콘: `lucide-react`의 `Gavel`

---

## 7. 권한·알림·외부 의존성

### 7-1. 권한

[src/types/permissions.ts](../../src/types/permissions.ts):

```ts
// Permission union 추가
| 'auction_view'
| 'auction_favorite'
| 'auction_ai'

// PERMISSION_GROUPS에 그룹 추가
{
  groupName: '부동산 경매',
  permissions: ['auction_view', 'auction_favorite', 'auction_ai']
}

// PERMISSION_DESCRIPTIONS
'auction_view': '부동산 경매 물건 조회',
'auction_favorite': '관심물건 저장 및 시뮬레이션',
'auction_ai': 'AI 권리분석 코멘트 생성',

// NEW_FEATURE_PREFIXES
'auction_'
```

[src/config/menuConfig.ts](../../src/config/menuConfig.ts):

```ts
{ id: 'auction', label: '부동산 경매', href: '/investment/auction', permissions: ['auction_view'] }
```

`npm run check:permissions` 통과 보장 (prebuild에 결합되어 있음).

기존 투자 구독 게이트(`/api/investment/subscription/status`)는 `/investment/*` 전체에 이미 적용되어 있어 별도 결제 게이트 추가 없음.

### 7-2. 알림

기존 `notifications` 테이블 + `notification_type` CHECK 제약에 추가:

```sql
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (..., 'auction_dday_3', 'auction_filter_match', 'auction_status_change'));
```

워커가 매일 새벽 03:00 작업 종료 시 일괄 INSERT.

### 7-3. 외부 의존성

| 항목 | 인증 | 한도 | 비용 |
|---|---|---|---|
| courtauction.go.kr (HTML/PDF) | 없음 (UA·throttle 0.5s) | 자체 제어 | 무료 |
| 국토부 실거래가 API (아파트/오피스텔/연립다세대/단독·다가구/상업업무/토지) | data.go.kr 인증키 | 일 1만 호출 | 무료 |
| 국토부 공시지가 API | data.go.kr 인증키 | 일 1만 호출 | 무료 |
| Kakao Map (정적) | KAKAO_REST_API_KEY | 일 30만 (무료) | 무료 |
| Claude Haiku 4.5 | ANTHROPIC_API_KEY | 사용자당 일 50회 | 건당 ~₩10 |

환경 변수 추가:

```env
DATA_GO_KR_API_KEY=...
KAKAO_REST_API_KEY=...   # 이미 있다면 재사용
```

---

## 8. 워커 구성

### 8-1. 디렉토리 구조

```
scraping-worker/
├── auction/                                  # 신규
│   ├── src/
│   │   ├── scrapers/
│   │   │   ├── courtAuctionListScraper.ts    # 목록 페이지 (지역·용도별)
│   │   │   ├── courtAuctionDetailScraper.ts  # 상세 페이지
│   │   │   └── pdfDownloader.ts              # 매각물건명세서·감정평가서
│   │   ├── parsers/
│   │   │   ├── noticeParser.ts               # 매각물건명세서 정규식 룰
│   │   │   └── rightsExtractor.ts            # 권리·임차인 추출
│   │   ├── matchers/
│   │   │   ├── molitTradeClient.ts           # 국토부 OpenAPI
│   │   │   └── marketPriceMatcher.ts         # PNU·평형 기반 매칭
│   │   ├── jobs/
│   │   │   ├── dailyScrape.ts                # 03:00 KST cron 진입점
│   │   │   ├── ddayAlerts.ts                 # 관심물건 D-3 알림 생성
│   │   │   └── filterMatchAlerts.ts          # 저장된 필터 매칭 알림
│   │   └── lib/
│   │       ├── supabase.ts
│   │       └── logger.ts
│   ├── package.json
│   └── tsconfig.json
└── (기존 홈택스 워커 디렉토리들)
```

### 8-2. 일일 배치 흐름

```
03:00 KST  목록 페이지 순회 (지역 × 용도 매트릭스)
03:30      상세 페이지 + PDF 다운로드 (신규 + 기일 변경 건만)
04:30      PDF 1차 룰 파싱 → auction_rights_analysis
05:00      국토부 OpenAPI로 시세 매칭 → auction_market_prices
05:30      기존 활성 물건 상태 갱신 (낙찰/취하/변경)
06:00      알림 생성 (D-3 / 필터 매칭 / 상태 변경)
06:30      헬스체크 ping → Slack/이메일
```

### 8-3. 견고성

- 스크래퍼 실패 시 retry 3회 + 지수 백오프
- 차단 감지(403/429) 시 즉시 일시 중단 + Slack 알림
- 수집 일관성: 트랜잭션 단위는 "1 사건번호 = 1 트랜잭션" → 부분 실패가 다른 물건에 영향 없음
- raw HTML/PDF는 S3 또는 로컬에 archive (감사·재처리 용도)

---

## 9. AI 권리분석 호출 정책

### 9-1. 엔드포인트

`POST /api/auction/ai-comment/[itemId]`

### 9-2. 흐름

```
1. 인증 체크 (auction_ai 권한 확인)
2. 일일 호출 한도 체크 (사용자당 50회/day)
3. auction_ai_comments에서 (item_id, prompt_version) 캐시 조회
   - 24h 이내 → 즉시 반환
   - 만료 → 다음 단계
4. auction_rights_analysis.raw_text + auction_items 핵심 필드 + auction_history 조회
5. Claude Haiku 4.5 호출 (cache_control 적용)
6. 응답 검증 (JSON 스키마)
7. auction_ai_comments에 INSERT
8. 응답
```

### 9-3. 프롬프트 구조 (cache_control)

```
[system prompt + 권리분석 룰 가이드]   ← cache_control: ephemeral
[input: 물건 정보 + raw_text]           ← 매번 다름
```

cache hit률을 높이기 위해 룰 가이드는 변경 시마다 `prompt_version` 증가.

---

## 10. Phase 분리 / 마일스톤

### Phase 1 (MVP) — 2주 목표

**Week 1 — 데이터 파이프라인**

1. 워커 디렉토리 구조 생성 + 환경변수 세팅
2. courtauction.go.kr 목록·상세 스크래퍼 (Playwright)
3. PDF 다운로드 + 1차 룰 파싱
4. 국토부 실거래가 OpenAPI 클라이언트 + 시세 매칭
5. Supabase 마이그레이션 (테이블 7개) — Supabase MCP로 직접 적용
6. 매일 03:00 cron 등록 + 헬스체크

**Week 2 — UI**

7. `/investment/auction` 목록 + 필터 (URL 동기화)
8. `/investment/auction/[itemId]` 상세 (5개 탭)
9. 시뮬레이터 슬라이더 + 실시간 ROI
10. `POST /api/auction/ai-comment/[itemId]` + Claude Haiku 4.5 + 캐시
11. 관심물건 + D-3 알림 cron
12. 권한 등록 + 사이드바 메뉴 추가
13. 빌드 → 로그인 → 골든패스 E2E → develop 푸시 → main PR/머지

### Phase 2 (현재 범위 외)

지도 클러스터링 뷰 / 임장 노트(메모·사진 첨부) / 공동투자 메모 / 동일 단지 가격 알림 / 토지 시세 추정 모델 / 실시간 경매 결과 알림

### Phase 1 완료 조건

1. `npm run build` 성공
2. 매일 새벽 워커가 신규 100건 이상 정상 수집 (3일 연속 모니터링)
3. 테스트 계정 로그인 → 목록 → 상세 → 관심 저장 → 시뮬레이터 → AI 분석까지 골든패스 통과
4. `npm run check:permissions` 통과
5. develop → main 머지 완료

---

## 11. 위험 / 가정

### 위험

| 위험 | 영향 | 완화책 |
|---|---|---|
| courtauction.go.kr 차단 | 데이터 갱신 중단 | UA 변경, throttle 0.5s, 차단 시 즉시 일시중단 + 알림 |
| 사이트 구조 변경 | 스크래퍼 깨짐 | 셀렉터 추상화, 일일 헬스체크에서 0건 수집 시 알림 |
| PDF 파싱 정확도 | 권리분석 오류 | 부분 실패 시 raw_text 보존, AI 보충, parser_version 기록 |
| 시세 매칭 오류 | 잘못된 ROI 표시 | match_confidence 명시 노출, Low는 "추정" 라벨 |
| Claude API 비용 폭증 | 운영비 부담 | 사용자당 일 50회 제한, 24h 캐시, prompt caching |
| 법적 리스크 | 약관/저작권 분쟁 | 공공 데이터만 사용, 시세는 공식 OpenAPI, 가공·재구성하여 표시 |

### 가정

- 기존 투자 구독을 가진 사용자는 부동산 경매도 같은 가치 묶음으로 본다 (별도 결제 없음).
- 사용자는 부동산 경매에 대한 기본적 이해(말소기준권리, 임차인 대항력 등)를 갖고 있다 — 따라서 핵심 단어에 툴팁만 제공, 별도 학습 콘텐츠는 미포함.
- 매일 신규 등록 + 갱신 합산 100~500건 수준의 처리량을 가정한다.
- AI 권리분석은 보조 자료이며, 최종 투자 판단의 책임은 사용자에게 있다 (UI에 명시적 면책 문구 노출).

---

## 12. 검증 시나리오

### 골든 패스

1. 테스트 계정(`whitedc0902@gmail.com`)으로 로그인
2. 사이드바 "부동산 경매" 클릭 → 목록 페이지 진입
3. 필터: 지역 "서울특별시" + 용도 "아파트" + 최소 할인율 30%
4. 첫 번째 카드 클릭 → 상세 진입
5. "개요" 탭에서 시세 비교 확인 (High 신뢰도 가정)
6. "시뮬레이터" 탭 → 응찰가 슬라이더 조작 → 수익률 변동 확인
7. "권리분석" 탭 → "🤖 AI 권리분석 보기" 클릭 → 응답 확인 (캐시 hit/miss 모두 검증)
8. ⭐ 관심물건 토글 → `/investment/auction/favorites` 진입 → 카드 노출 확인
9. 알림 cron 수동 실행 → D-3 알림 정상 INSERT 확인

### 부정 경로

- 권한 없는 사용자(`auction_view` 미부여) → 메뉴 비노출 + 직접 URL 접근 시 redirect
- AI 호출 한도 초과 → "오늘 한도 초과" 메시지
- 시세 매칭 실패 (토지) → 2차 지표는 "수동 입력" 버튼만 노출
- 워커 차단 시뮬레이션 → 차단 감지 → 알림 송신 + 이후 호출 일시 중단

---

## 13. 참고

- 데이터 소스 조사 결과: 한국 법원경매 OpenAPI는 사실상 부재(대법원 사법정보공유포털은 "추후 업데이트 예정"), 시중 데이터 사업자도 모두 자체 스크래핑 + 가공 모델. 따라서 본 설계의 하이브리드 접근이 시장 표준에 부합.
- 기존 인프라 재사용: [scraping-worker/](../../scraping-worker/) (Mac mini M4, 홈택스 스크래퍼와 cron·로깅·헬스체크 공유)
- 기존 디자인 시스템: [src/app/investment/layout.tsx](../../src/app/investment/layout.tsx)의 NAV_ITEMS 패턴, shadcn/ui 컴포넌트, recharts
- 기존 알림 시스템: `notifications` 테이블 + `notification_type` CHECK 제약 (확장 형태로 통합)
- 기존 권한 시스템: [src/types/permissions.ts](../../src/types/permissions.ts), `NEW_FEATURE_PREFIXES`로 자동 노출

---

**다음 단계:** writing-plans 스킬을 통한 구현 계획 작성 → 실제 코딩 착수.
