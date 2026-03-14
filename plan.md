# 덴트웹 데이터베이스 연동 구현 계획

## 현재 상태 분석

- **리콜 관리**: Supabase 테이블 기반, 환자를 수동 입력 또는 CSV/Excel 파일 업로드로 등록
- **덴트웹 DB**: MS SQL Server Express, `c:\DENTWEBDB` (원내 Windows PC 서버)
- **웹 대시보드**: Next.js 15 + Supabase (Vercel 배포)
- **기존 계획(2026-02-20)**: 브릿지 에이전트 아키텍처 수립 완료, 구현 미착수

## 아키텍처

```
[덴트웹 SQL Server] ←읽기전용→ [브릿지 에이전트(Node.js)] →HTTPS→ [Supabase API] → [웹 대시보드]
   (원내 PC)                      (원내 PC에서 실행)            (클라우드)         (브라우저)
```

핵심: 원내 PC에서 실행되는 브릿지 에이전트가 덴트웹 DB를 주기적으로 읽어 Supabase에 동기화

---

## 1단계: Supabase 동기화 테이블 설계 및 생성

### 1-1. `dentweb_sync_config` 테이블
```sql
CREATE TABLE dentweb_sync_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  is_active BOOLEAN DEFAULT false,
  sync_interval_seconds INTEGER DEFAULT 300,  -- 5분 기본
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT,  -- 'success' | 'error'
  last_sync_error TEXT,
  last_sync_patient_count INTEGER,
  agent_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 1-2. `dentweb_patients` 테이블 (덴트웹 원본 데이터 저장)
```sql
CREATE TABLE dentweb_patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  dentweb_patient_id TEXT NOT NULL,       -- 덴트웹 내부 환자 ID
  chart_number TEXT,                       -- 차트번호
  patient_name TEXT NOT NULL,
  phone_number TEXT,
  birth_date DATE,
  gender TEXT,
  last_visit_date DATE,                    -- 최종 내원일
  last_treatment_type TEXT,                -- 최종 치료 내용
  next_appointment_date DATE,              -- 다음 예약일
  registration_date DATE,                  -- 초진일
  is_active BOOLEAN DEFAULT true,          -- 활성 환자 여부
  raw_data JSONB,                          -- 덴트웹 원본 데이터 전체 (디버깅/확장용)
  synced_at TIMESTAMPTZ DEFAULT NOW(),     -- 마지막 동기화 시점
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, dentweb_patient_id)
);
```

### 1-3. `dentweb_sync_logs` 테이블 (동기화 이력)
```sql
CREATE TABLE dentweb_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL,
  sync_type TEXT NOT NULL,    -- 'full' | 'incremental'
  status TEXT NOT NULL,        -- 'started' | 'success' | 'error'
  total_records INTEGER,
  new_records INTEGER,
  updated_records INTEGER,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);
```

---

## 2단계: 데이터 수신 API 엔드포인트

### 2-1. `POST /api/dentweb/sync` - 환자 데이터 동기화 수신
- 브릿지 에이전트가 호출하는 메인 엔드포인트
- 인증: clinic별 API 키 기반 (Supabase service role 또는 전용 API 키)
- 요청 body: 환자 배열 (upsert 방식)
- 응답: 동기화 결과 (신규/수정/에러 건수)

### 2-2. `GET /api/dentweb/status` - 동기화 상태 조회
- 마지막 동기화 시점, 상태, 환자 수 반환
- 대시보드 UI에서 연동 상태 표시용

### 2-3. `POST /api/dentweb/sync-config` - 동기화 설정 저장
- 동기화 활성/비활성, 주기 설정 등

---

## 3단계: 브릿지 에이전트 (Node.js 독립 프로그램)

### 3-1. 프로젝트 구조
```
dentweb-bridge-agent/
├── package.json
├── .env.example          -- DB 접속 정보, API 키 등
├── src/
│   ├── index.ts          -- 메인 엔트리 (스케줄러)
│   ├── config.ts         -- 환경변수 및 설정 로드
│   ├── dentweb-db.ts     -- MS SQL Server 연결 및 쿼리
│   ├── sync-service.ts   -- 동기화 로직 (비교, 변환, 전송)
│   ├── api-client.ts     -- Supabase API 호출 클라이언트
│   └── logger.ts         -- 로깅
├── scripts/
│   ├── install-service.bat  -- Windows 서비스 등록 스크립트
│   └── test-connection.ts   -- DB 연결 테스트
└── README.md
```

### 3-2. 핵심 기능
- **MS SQL Server 연결**: `mssql` (tedious) 패키지 사용, 읽기 전용 접속
- **주기적 동기화**: node-cron 또는 setInterval로 5분 간격 실행
- **증분 동기화**: 마지막 동기화 이후 변경된 환자만 추출 (updated_at 기반)
- **데이터 변환**: 덴트웹 컬럼명 → 우리 시스템 필드명 매핑
- **API 전송**: HTTPS로 `/api/dentweb/sync` 엔드포인트에 배치 전송
- **에러 처리**: 재시도 로직, 연결 끊김 시 자동 재연결
- **Windows 서비스**: `node-windows` 패키지로 Windows 서비스 등록 (PC 시작 시 자동 실행)

### 3-3. 덴트웹 DB 쿼리 (2단계에서 실제 스키마 확인 후 확정)
```ts
// 예상 쿼리 (실제 테이블/컬럼명은 SSMS로 확인 후 수정)
const PATIENT_QUERY = `
  SELECT
    PatientID, ChartNo, PatientName,
    PhoneNumber, BirthDate, Gender,
    LastVisitDate, LastTreatment
  FROM Patients
  WHERE UpdatedAt > @lastSyncDate
`;
```

---

## 4단계: 리콜 관리 UI에 덴트웹 연동 통합

### 4-1. 리콜 환자 등록 시 덴트웹 환자 검색/선택
- 기존: 수동 입력 or 파일 업로드
- 추가: "덴트웹에서 가져오기" 버튼
  - 차트번호, 이름, 전화번호로 `dentweb_patients` 테이블 검색
  - 최종 내원일 기준 필터 (예: 6개월 이상 미내원 환자)
  - 선택한 환자를 `recall_patients`에 일괄 등록

### 4-2. 자동 리콜 대상 추출
- 덴트웹 동기화 데이터 기반으로 리콜 대상 자동 추천
- 조건: 최종 내원일이 N개월 이상인 환자
- 기존 리콜 환자와 중복 체크 (차트번호 or 전화번호 매칭)

### 4-3. 동기화 상태 대시보드
- RecallSettings에 "덴트웹 연동" 섹션 추가
- 마지막 동기화 시간, 상태(정상/오류), 동기화된 환자 수 표시
- 동기화 설정 (주기, 활성/비활성)

### 4-4. 환자 정보 자동 업데이트
- 리콜 환자의 최종 내원일이 덴트웹과 자동 동기화
- 내원 확인되면 리콜 상태 자동 변경 가능

---

## 5단계: 보안 및 법적 고려사항

- **읽기 전용 계정**: 덴트웹 DB에 SELECT 권한만 가진 전용 계정 생성
- **전송 암호화**: 브릿지 → Supabase 간 HTTPS 필수
- **API 인증**: 클리닉별 API 키로 브릿지 에이전트 인증
- **데이터 최소화**: 진료 내용 제외, 행정 데이터(이름, 연락처, 내원일)만 동기화
- **접근 로그**: 모든 동기화 이력을 `dentweb_sync_logs`에 기록
- **환자 동의**: 개인정보보호법에 따른 동의 절차 안내 문서

---

## 구현 순서 (이번 작업 범위: 1단계 + 2단계 + 3단계 코드 + 4단계)

| 순서 | 작업 | 설명 |
|------|------|------|
| 1 | Supabase 마이그레이션 | dentweb_sync_config, dentweb_patients, dentweb_sync_logs 테이블 생성 |
| 2 | 데이터 수신 API | `/api/dentweb/sync`, `/api/dentweb/status`, `/api/dentweb/sync-config` |
| 3 | 브릿지 에이전트 코드 | dentweb-bridge-agent/ 디렉토리에 Node.js 프로젝트 생성 |
| 4 | 리콜 UI 통합 | "덴트웹에서 가져오기" 기능, 동기화 상태 표시, 자동 리콜 대상 추출 |
| 5 | Mock 데이터 테스트 | 실제 DB 없이 Mock 데이터로 전체 흐름 검증 |
| 6 | 빌드 & 테스트 | npm run build 통과, 기능 테스트 |

> **참고**: 2단계(원내 서버 PC 작업 - SSMS 설치, 실제 DB 스키마 확인, 읽기전용 계정 생성)는 원내 PC에서 별도 진행
