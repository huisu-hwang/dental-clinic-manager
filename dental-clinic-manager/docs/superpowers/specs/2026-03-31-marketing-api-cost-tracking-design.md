# 마케팅 API 비용 추적 시스템 설계

> 작성일: 2026-03-31
> 상태: 승인됨

---

## 1. 개요

마케팅 자동화 글 생성 시 발생하는 API 비용(Claude, Gemini)을 실시간으로 기록하고, 마스터 계정에서 글별/일별/주별/월별 비용을 조회할 수 있는 대시보드를 구축한다.

### 핵심 결정사항

- **비용 계산**: 실시간 토큰 기반 (API 응답의 usage 데이터 캡처)
- **기록 방식**: 인라인 기록 (각 API 호출 지점에서 즉시 DB INSERT)
- **통화**: USD + KRW 병기
- **환율**: 고정 환율 (마스터가 수동 설정)
- **상세 수준**: 중간형 (글 생성 조건 + 단계별 비용 breakdown + 일/주/월 집계)

---

## 2. 현재 API 호출 구조

글 1건 생성 시 발생하는 API 호출:

| 단계 | API | 모델 | 파일 | 비고 |
|------|-----|------|------|------|
| 텍스트 생성 | Anthropic | claude-sonnet-4-6 | content-generator.ts | max_tokens: 4096 |
| 텍스트 재생성 | Anthropic | claude-sonnet-4-6 | content-generator.ts | 글자수 부족 시 1회 |
| 블로그 이미지 생성 | Google | gemini-3.0-flash | image-generator.ts | 기본 3장, 최대 N장 |
| 이미지 파일명 생성 | Anthropic | claude-haiku | image-generator.ts | 이미지당 1회 |
| SNS 이미지 생성 | Google | gemini-3.0-flash | image-generator.ts | 인스타/페북/쓰레드 |
| SNS 텍스트 변환 | Anthropic | claude-sonnet-4-6 | platform-adapters/*.ts | 플랫폼별 |

---

## 3. 데이터베이스 설계

### 3-1. `marketing_api_usage` 테이블

모든 API 호출을 개별 row로 기록한다.

```sql
CREATE TABLE marketing_api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  post_id UUID,                                    -- content_calendar_items FK (nullable, 임시저장 전이면 null)
  generation_session_id UUID NOT NULL,             -- 한 번의 글 생성 요청을 묶는 세션 ID
  api_provider VARCHAR(20) NOT NULL,               -- 'anthropic' | 'google'
  model VARCHAR(50) NOT NULL,                      -- 'claude-sonnet-4-6', 'gemini-3.0-flash' 등
  call_type VARCHAR(30) NOT NULL,                  -- 'text_generation', 'text_retry', 'image_generation', 'filename_generation', 'platform_image', 'platform_text'
  input_tokens INTEGER DEFAULT 0,                  -- 입력 토큰 수
  output_tokens INTEGER DEFAULT 0,                 -- 출력 토큰 수
  total_tokens INTEGER DEFAULT 0,                  -- 합계
  cost_usd DECIMAL(10,6) DEFAULT 0,                -- 달러 비용
  generation_options JSONB,                        -- 글 생성 조건 (주제, 키워드, 어투, 이미지 수 등)
  success BOOLEAN DEFAULT TRUE,                    -- 성공 여부
  error_message TEXT,                              -- 실패 시 에러
  duration_ms INTEGER,                             -- API 응답 시간 (ms)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_api_usage_clinic_created ON marketing_api_usage(clinic_id, created_at DESC);
CREATE INDEX idx_api_usage_session ON marketing_api_usage(generation_session_id);
CREATE INDEX idx_api_usage_post ON marketing_api_usage(post_id) WHERE post_id IS NOT NULL;

-- RLS
ALTER TABLE marketing_api_usage ENABLE ROW LEVEL SECURITY;
```

### 3-2. `marketing_cost_settings` 테이블

모델별 단가 + 환율 설정. 마스터가 관리.

```sql
CREATE TABLE marketing_cost_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  model VARCHAR(50) NOT NULL,                      -- 모델명 또는 'exchange_rate'
  input_price_per_1m DECIMAL(10,4) DEFAULT 0,      -- 입력 100만 토큰당 USD
  output_price_per_1m DECIMAL(10,4) DEFAULT 0,     -- 출력 100만 토큰당 USD
  image_price_per_call DECIMAL(10,4) DEFAULT 0,    -- 이미지 1건당 USD (Gemini용)
  usd_to_krw DECIMAL(10,2) DEFAULT 1380.00,        -- 환율
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, model)
);

-- RLS
ALTER TABLE marketing_cost_settings ENABLE ROW LEVEL SECURITY;
```

**기본 단가 시드 데이터:**

| model | input_price_per_1m | output_price_per_1m | image_price_per_call |
|-------|--------------------|---------------------|----------------------|
| claude-sonnet-4-6 | 3.00 | 15.00 | 0 |
| claude-haiku-4-5 | 0.80 | 4.00 | 0 |
| gemini-3.0-flash | 0 | 0 | 0.04 |
| exchange_rate | 0 | 0 | 0 | (usd_to_krw만 사용) |

---

## 4. 백엔드 설계

### 4-1. `src/lib/marketing/api-usage-logger.ts` (신규)

API 사용량 기록 유틸리티.

```typescript
interface LogApiUsageParams {
  clinicId: string;
  postId?: string;
  generationSessionId: string;
  apiProvider: 'anthropic' | 'google';
  model: string;
  callType: 'text_generation' | 'text_retry' | 'image_generation' | 'filename_generation' | 'platform_image' | 'platform_text';
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  generationOptions?: Record<string, unknown>;
  success: boolean;
  errorMessage?: string;
  durationMs?: number;
}

// DB에서 단가 조회 → 비용 계산 → INSERT
async function logApiUsage(params: LogApiUsageParams): Promise<void>

// 단가표 기반 비용 계산
function calculateCost(model: string, inputTokens: number, outputTokens: number, settings: CostSettings): number
```

- `logApiUsage`는 fire-and-forget으로 호출 (await 없이, 글 생성 성능 영향 최소화)
- 단가 조회는 메모리 캐시 (5분 TTL)

### 4-2. 기존 파일 수정

**content-generator.ts:**
- `generateContent()` 내 Claude API 호출 후 `response.usage` 캡처
- `logApiUsage()` 호출 (text_generation / text_retry)
- `generationSessionId`를 파라미터로 받음

**image-generator.ts:**
- `generateBlogImage()` 내 Gemini 호출 후 로깅 (image_generation)
- `generateImageFileName()` 내 Haiku 호출 후 로깅 (filename_generation)
- `generatePlatformImage()` 내 로깅 (platform_image)

**generate/route.ts:**
- 글 생성 시작 시 `crypto.randomUUID()`로 세션 ID 발급
- 세션 ID + clinicId를 각 함수에 전달
- 생성 조건(options)을 generationOptions로 전달

### 4-3. API 라우트 (신규)

**`/api/marketing/costs`** — 비용 조회 API

- `GET /api/marketing/costs?period=day|week|month&date=YYYY-MM-DD`
  - 기간별 집계 데이터 반환
- `GET /api/marketing/costs/sessions?page=1&limit=20`
  - 세션(글)별 비용 목록 (생성 조건 포함)
- `GET /api/marketing/costs/sessions/:sessionId`
  - 특정 세션의 API 호출 상세 breakdown

**`/api/marketing/costs/settings`** — 단가 설정 API

- `GET` — 현재 단가 + 환율 조회
- `PUT` — 단가 / 환율 수정 (master_admin만)

---

## 5. 프론트엔드 설계

### 5-1. 페이지: `/master/marketing/costs`

마스터 계정 전용 페이지. 기존 마스터 페이지 네비게이션에 "API 비용" 메뉴 추가.

### 5-2. 구성 요소

**1) 요약 카드 (상단)**
- 오늘 총 비용 | 이번 주 총 비용 | 이번 달 총 비용
- 각 카드에 USD + KRW 병기
- 전일/전주/전월 대비 증감률 표시

**2) 기간별 비용 차트 (중앙)**
- 탭: 일별 / 주별 / 월별
- 막대 차트 (shadcn/ui 기반, 또는 간단한 CSS 차트)
- X축: 날짜, Y축: 비용(USD)
- 호버 시 KRW 환산 표시

**3) 글별 비용 테이블 (하단)**
- 컬럼: 날짜 | 주제 | 키워드 | 어투 | 이미지 수 | 포스트 타입 | 텍스트 비용 | 이미지 비용 | 총 비용(USD) | 총 비용(KRW)
- 행 클릭 → 확장하여 단계별 API 호출 breakdown 표시
- 페이지네이션 (20건/페이지)

**4) 단가 설정 (사이드 또는 별도 섹션)**
- 모델별 input/output 단가 편집
- 이미지 1건당 단가 편집
- USD→KRW 환율 편집
- 저장 버튼

### 5-3. 파일 구조

```
src/app/master/marketing/costs/
├── page.tsx                    -- 페이지 래퍼
├── CostDashboardContent.tsx    -- 메인 대시보드 컴포넌트
├── CostSummaryCards.tsx        -- 요약 카드
├── CostChart.tsx               -- 기간별 차트
├── CostTable.tsx               -- 글별 비용 테이블
└── CostSettings.tsx            -- 단가/환율 설정
```

---

## 6. 단가 계산 로직

```
Claude 비용 = (input_tokens / 1,000,000 × input_price_per_1m) + (output_tokens / 1,000,000 × output_price_per_1m)
Gemini 이미지 비용 = image_price_per_call (호출 1건당 고정)
KRW 환산 = USD × usd_to_krw
```

Gemini 이미지 API는 토큰 단위가 아닌 요청 단위 과금이므로, `image_price_per_call`로 처리한다. 다만 Gemini API 응답에 usage 데이터가 있으면 그것도 함께 기록한다 (input_tokens, output_tokens 컬럼에).

---

## 7. 범위 외 (향후 확장)

- 예산 한도 설정 및 알림
- 자동 환율 갱신
- 비용 기반 글 생성 최적화 제안
- CSV/엑셀 내보내기
