# 부동산 경매 투자 분석 기능 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 전국 법원경매 물건의 핵심 투자 정보(특히 ROI)를 빠르게 파악할 수 있는 도구를 투자 카테고리에 추가한다.

**Architecture:** Mac mini M4의 Playwright 스크래퍼가 매일 새벽 courtauction.go.kr 데이터를 수집해 Supabase에 적재하고, Next.js 15 앱은 그 데이터를 읽어 ROI 3단계 다층 모델(객관 / 시세 매칭 / 임대 시뮬)로 표시한다. AI 권리분석 코멘트는 사용자 클릭 시 Claude Haiku 4.5 호출 + 24h 캐시.

**Tech Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · shadcn/ui · Supabase Postgres · Playwright · @anthropic-ai/sdk · recharts · Vitest (단위 테스트)

**Spec:** [2026-05-09-real-estate-auction-design.md](../specs/2026-05-09-real-estate-auction-design.md)

---

## File Structure

### 신규 생성 (Next.js 앱)

| 경로 | 책임 |
|---|---|
| `supabase/migrations/2026XXXX_real_estate_auction.sql` | 7개 테이블 + 인덱스 + 알림 CHECK 확장 |
| `src/types/auction.ts` | 도메인 타입 (`AuctionItem`, `RoiBreakdown` 등) |
| `src/lib/auction/roiCalculator.ts` | 1·2·3차 ROI 순수 함수 (TDD 대상) |
| `src/lib/auction/roiCalculator.test.ts` | 단위 테스트 |
| `src/lib/auction/auctionService.ts` | DB 조회 헬퍼 |
| `src/app/api/auction/items/route.ts` | 목록 조회 API |
| `src/app/api/auction/items/[itemId]/route.ts` | 상세 조회 API |
| `src/app/api/auction/favorites/route.ts` | 즐겨찾기 토글 / 시뮬값 저장 |
| `src/app/api/auction/ai-comment/[itemId]/route.ts` | AI 권리분석 (Claude Haiku 4.5) |
| `src/app/investment/auction/page.tsx` | 목록 + 필터 |
| `src/app/investment/auction/[itemId]/page.tsx` | 상세 (5탭) |
| `src/app/investment/auction/favorites/page.tsx` | 관심물건 |
| `src/components/Investment/Auction/AuctionFilters.tsx` | 필터 칩/Sheet |
| `src/components/Investment/Auction/AuctionCard.tsx` | 목록 카드 |
| `src/components/Investment/Auction/AuctionDetailHeader.tsx` | 상세 헤더 |
| `src/components/Investment/Auction/tabs/OverviewTab.tsx` | 개요 탭 |
| `src/components/Investment/Auction/tabs/SimulatorTab.tsx` | 시뮬레이터 탭 (슬라이더) |
| `src/components/Investment/Auction/tabs/RightsTab.tsx` | 권리분석 탭 + AI 버튼 |
| `src/components/Investment/Auction/tabs/HistoryTab.tsx` | 회차/단지 통계 |
| `src/components/Investment/Auction/tabs/AttachmentsTab.tsx` | PDF 외부 링크 |

### 신규 생성 (스크래핑 워커)

| 경로 | 책임 |
|---|---|
| `scraping-worker/auction/package.json` | 워커 의존성 (playwright, @supabase/supabase-js, pdf-parse) |
| `scraping-worker/auction/tsconfig.json` | TS 설정 |
| `scraping-worker/auction/.env.example` | 환경변수 템플릿 |
| `scraping-worker/auction/src/lib/supabase.ts` | service role key 클라이언트 |
| `scraping-worker/auction/src/lib/logger.ts` | JSON 라인 로거 |
| `scraping-worker/auction/src/scrapers/courtAuctionListScraper.ts` | 목록 페이지 (지역×용도) |
| `scraping-worker/auction/src/scrapers/courtAuctionDetailScraper.ts` | 상세 페이지 |
| `scraping-worker/auction/src/scrapers/pdfDownloader.ts` | PDF 다운로드 + S3/local 보관 |
| `scraping-worker/auction/src/parsers/noticeParser.ts` | 매각물건명세서 정규식 룰 |
| `scraping-worker/auction/src/parsers/rightsExtractor.ts` | 권리·임차인 추출 |
| `scraping-worker/auction/src/matchers/molitTradeClient.ts` | 국토부 OpenAPI |
| `scraping-worker/auction/src/matchers/marketPriceMatcher.ts` | PNU·평형 기반 매칭 |
| `scraping-worker/auction/src/jobs/dailyScrape.ts` | cron 진입점 |
| `scraping-worker/auction/src/jobs/ddayAlerts.ts` | 관심물건 D-3 알림 |
| `scraping-worker/auction/src/jobs/filterMatchAlerts.ts` | 저장된 필터 매칭 알림 |
| `scraping-worker/auction/test/parsers/noticeParser.test.ts` | 파서 단위 테스트 |
| `scraping-worker/auction/test/matchers/marketPriceMatcher.test.ts` | 매칭 단위 테스트 |

### 수정

| 경로 | 변경 내용 |
|---|---|
| `src/types/permissions.ts` | `Permission` union, `DEFAULT_PERMISSIONS`, `NEW_FEATURE_PREFIXES`, `PERMISSION_GROUPS`, `PERMISSION_DESCRIPTIONS`에 `auction_*` 3개 추가 |
| `src/config/menuConfig.ts` | `MENU_CONFIG`에 `auction` 항목 추가 (`investment` 카테고리) |
| `src/app/investment/layout.tsx` | `NAV_ITEMS`에 부동산 경매 추가 |

---

## Task 흐름 요약

| # | Task | 의존성 |
|---|---|---|
| 1 | DB 마이그레이션 + 알림 CHECK 확장 | — |
| 2 | 권한·메뉴·사이드바 등록 | — |
| 3 | 도메인 타입 + ROI 계산기 (TDD) | — |
| 4 | 목록 API + 페이지 + 필터 | 1, 3 |
| 5 | 상세 API + 페이지 골격 + 개요 탭 | 1, 3 |
| 6 | 시뮬레이터 탭 | 5 |
| 7 | 권리분석 탭 + AI 코멘트 API | 5 |
| 8 | 이력·통계 탭 + 첨부 탭 | 5 |
| 9 | 즐겨찾기 API + 페이지 | 1, 4 |
| 10 | 워커 부트스트랩 (디렉토리 + lib) | 1 |
| 11 | 워커 - 목록 스크래퍼 | 10 |
| 12 | 워커 - 상세 + PDF 파싱 (TDD) | 10, 11 |
| 13 | 워커 - 국토부 시세 매칭 (TDD) | 10 |
| 14 | 워커 - dailyScrape + 알림 cron | 11, 12, 13 |
| 15 | 통합 검증 + develop 푸시 + main 머지 | All |

각 Task는 다음 절차를 공통으로 따른다:
- 자체 검증 (빌드/테스트/체크)
- 테스트 계정 로그인 후 브라우저 검증 (UI 작업의 경우)
- 단위 commit (한 Task = 한 commit 권장, 큰 Task는 sub-commit)

---

추가 Task 본문은 별도 섹션에서 자세한 step·code·command를 포함하여 정의한다.

---

## Task 1: DB 마이그레이션 (테이블 7개 + 알림 CHECK 확장)

**Files:**
- Create: `supabase/migrations/20260509_real_estate_auction.sql`
- Apply via: Supabase MCP (`mcp__supabase__apply_migration`, project `beahjntkmkfhpcbhfnrr`)

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- supabase/migrations/20260509_real_estate_auction.sql
-- 부동산 경매 투자 분석 기능 — 테이블 7개 + 알림 CHECK 확장

-- 1. auction_items
CREATE TABLE IF NOT EXISTS auction_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number VARCHAR(32) NOT NULL,
  item_number INTEGER NOT NULL,
  court_name VARCHAR(64) NOT NULL,
  court_code VARCHAR(8) NOT NULL,
  property_type VARCHAR(32) NOT NULL,
  address_road TEXT,
  address_jibun TEXT,
  sido VARCHAR(16),
  sigungu VARCHAR(32),
  eupmyeondong VARCHAR(32),
  pnu VARCHAR(19),
  land_area_m2 NUMERIC(12,2),
  building_area_m2 NUMERIC(12,2),
  floor INT,
  total_floors INT,
  building_year INT,
  appraisal_price BIGINT NOT NULL,
  min_bid_price BIGINT NOT NULL,
  bid_deposit BIGINT,
  failure_count INT DEFAULT 0,
  discount_rate NUMERIC(5,2),
  next_auction_date DATE,
  status VARCHAR(16) NOT NULL,
  sold_price BIGINT,
  sold_at DATE,
  source_url TEXT,
  notice_pdf_url TEXT,
  appraisal_pdf_url TEXT,
  photos JSONB DEFAULT '[]'::jsonb,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (court_code, case_number, item_number)
);

CREATE INDEX IF NOT EXISTS idx_auction_items_status_date ON auction_items (status, next_auction_date);
CREATE INDEX IF NOT EXISTS idx_auction_items_region ON auction_items (sido, sigungu);
CREATE INDEX IF NOT EXISTS idx_auction_items_type_discount ON auction_items (property_type, discount_rate DESC);
CREATE INDEX IF NOT EXISTS idx_auction_items_pnu ON auction_items (pnu);

-- 2. auction_history
CREATE TABLE IF NOT EXISTS auction_history (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  round_no INT NOT NULL,
  scheduled_date DATE NOT NULL,
  min_bid_price BIGINT NOT NULL,
  result VARCHAR(16),
  sold_price BIGINT,
  bid_count INT,
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, round_no)
);
CREATE INDEX IF NOT EXISTS idx_auction_history_item ON auction_history (item_id, round_no);

-- 3. auction_market_prices
CREATE TABLE IF NOT EXISTS auction_market_prices (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL,
  matched_complex VARCHAR(128),
  median_price_3m BIGINT,
  trade_count_3m INT,
  median_price_12m BIGINT,
  last_trade_date DATE,
  match_confidence VARCHAR(8),
  raw JSONB,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, source)
);

-- 4. auction_rights_analysis
CREATE TABLE IF NOT EXISTS auction_rights_analysis (
  item_id UUID PRIMARY KEY REFERENCES auction_items(id) ON DELETE CASCADE,
  base_right_type VARCHAR(32),
  base_right_date DATE,
  has_senior_tenant BOOLEAN,
  tenant_count INT,
  total_deposit BIGINT,
  unsettled_taxes BIGINT,
  risk_flags JSONB DEFAULT '{}'::jsonb,
  parser_version VARCHAR(8),
  parse_status VARCHAR(16),
  raw_text TEXT,
  parsed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. auction_ai_comments
CREATE TABLE IF NOT EXISTS auction_ai_comments (
  id BIGSERIAL PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES auction_items(id) ON DELETE CASCADE,
  prompt_version VARCHAR(8) NOT NULL,
  model VARCHAR(32) NOT NULL,
  summary TEXT NOT NULL,
  risk_score INT,
  bullet_points JSONB,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (item_id, prompt_version)
);
CREATE INDEX IF NOT EXISTS idx_auction_ai_comments_item ON auction_ai_comments (item_id, generated_at DESC);

-- 6. auction_user_favorites
CREATE TABLE IF NOT EXISTS auction_user_favorites (
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
CREATE INDEX IF NOT EXISTS idx_auction_user_favorites_user ON auction_user_favorites (user_id, created_at DESC);

-- 7. auction_user_filters
CREATE TABLE IF NOT EXISTS auction_user_filters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(64) NOT NULL,
  filter_json JSONB NOT NULL,
  alert_enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. notifications CHECK 제약 확장 (기존 제약명 추정 → 동적 처리)
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notifications DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- 새 CHECK 제약 (기존 type 값 + auction_* 3종)
-- NOTE: 기존 type 값 목록은 db_query로 확인 후 채울 것. 아래는 예시.
-- 실행 전 SELECT DISTINCT type FROM notifications; 로 기존 값 보존 필요.
ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    -- 기존 값 (확인 후 채울 자리)
    'system','sms','task_directive','task_checklist','recall',
    'monthly_report_ready','referral_thanks',
    -- 신규
    'auction_dday_3','auction_filter_match','auction_status_change'
  ));

-- 완료 메시지
DO $$ BEGIN RAISE NOTICE 'real_estate_auction migration applied'; END $$;
```

- [ ] **Step 2: 기존 notification type 값 확인**

```bash
# Supabase MCP 사용
mcp__supabase__execute_sql({
  project_id: 'beahjntkmkfhpcbhfnrr',
  query: 'SELECT DISTINCT type FROM notifications ORDER BY 1'
})
```

확인된 값들을 위 SQL의 `'system','sms',...` 부분에 빠짐없이 채워 넣을 것. 누락하면 INSERT 실패.

- [ ] **Step 3: Supabase MCP로 마이그레이션 적용**

```
mcp__supabase__apply_migration({
  project_id: 'beahjntkmkfhpcbhfnrr',
  name: 'real_estate_auction',
  query: <위 SQL 전체>
})
```

- [ ] **Step 4: 적용 검증**

```sql
-- mcp__supabase__execute_sql 로 실행
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name LIKE 'auction_%'
ORDER BY 1;
-- 7개 행이 반환되어야 함
```

기대 출력:
```
auction_ai_comments
auction_history
auction_items
auction_market_prices
auction_rights_analysis
auction_user_favorites
auction_user_filters
```

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/20260509_real_estate_auction.sql
git commit -m "feat(auction): DB 스키마 추가 — 경매 물건/이력/시세/권리/AI/즐겨찾기/필터"
```


---

## Task 2: 권한 등록 + 메뉴 등록 + 사이드바 추가

**Files:**
- Modify: `src/types/permissions.ts` (5곳)
- Modify: `src/config/menuConfig.ts` (1곳)
- Modify: `src/app/investment/layout.tsx` (2곳: import + NAV_ITEMS)

- [ ] **Step 1: `Permission` union에 3개 추가**

`src/types/permissions.ts:108` 부근 `'referral_points_adjust'  // 포인트 적립/차감` 다음 줄에 추가:

```ts
  // 부동산 경매 관리 권한
  | 'auction_view'             // 부동산 경매 물건 조회
  | 'auction_favorite'         // 관심물건 저장 및 시뮬레이션
  | 'auction_ai'               // AI 권리분석 코멘트 생성
```

- [ ] **Step 2: `DEFAULT_PERMISSIONS.owner`에 추가**

`src/types/permissions.ts:164` 의 `'referral_view', 'referral_manage', 'referral_sms_send', 'referral_points_adjust'` 다음에 콤마 추가하고 다음 줄에:

```ts
    // 부동산 경매 관리 (모든 권한)
    'auction_view', 'auction_favorite', 'auction_ai'
```

owner 외 다른 역할(vice_director/manager/team_leader/staff)에는 추가하지 않는다 — 투자 카테고리는 owner 전용 정책과 일관.

- [ ] **Step 3: `NEW_FEATURE_PREFIXES`에 추가**

`src/types/permissions.ts:298-312` 배열 마지막 항목(`'referral_'`) 다음 줄에 추가:

```ts
  'auction_',
```

- [ ] **Step 4: `PERMISSION_GROUPS`에 그룹 추가**

`src/types/permissions.ts` 의 `'소개환자 관리'` 그룹 다음, `'기타'` 그룹 앞에 삽입:

```ts
  '부동산 경매': [
    { key: 'auction_view', label: '부동산 경매 조회' },
    { key: 'auction_favorite', label: '관심물건 저장 및 시뮬레이션' },
    { key: 'auction_ai', label: 'AI 권리분석 코멘트' }
  ],
```

- [ ] **Step 5: `PERMISSION_DESCRIPTIONS`에 한글 설명 추가**

파일 하단의 `PERMISSION_DESCRIPTIONS` 객체 마지막에 추가 (마지막 항목 뒤에 콤마 보장):

```ts
  // 부동산 경매 관리 권한 설명
  'auction_view': '부동산 경매 물건 목록과 상세를 조회할 수 있습니다.',
  'auction_favorite': '관심물건을 저장하고 입찰 시뮬레이션을 사용할 수 있습니다.',
  'auction_ai': 'AI 권리분석 코멘트를 생성할 수 있습니다 (Claude Haiku 4.5 호출).',
```

- [ ] **Step 6: 메뉴 등록 (`MENU_CONFIG`)**

`src/config/menuConfig.ts` 의 투자 카테고리 항목(`id: 'investment'`) 다음에 삽입:

```ts
  {
    id: 'auction',
    label: '부동산 경매',
    icon: 'Gavel',
    route: '/investment/auction',
    permissions: ['auction_view'],
    categoryId: 'investment',
    order: 16.6,
    visible: true,
    ownerOnly: true,
    premiumFeature: true,
  },
```

- [ ] **Step 7: 투자 사이드바 NAV_ITEMS에 추가**

`src/app/investment/layout.tsx` import에 `Gavel` 추가:

```ts
import {
  TrendingUp,
  LayoutDashboard,
  Link2,
  Target,
  BarChart3,
  Briefcase,
  ArrowLeft,
  Menu,
  X,
  Loader2,
  Zap,
  GitCompare,
  Search,
  Brain,
  Users,
  Gavel,
} from 'lucide-react'
```

`NAV_ITEMS` 배열에서 `smart-money` 다음, `trading` 앞에 삽입 (이렇게 하면 "스마트머니 분석" → "부동산 경매" → "자동매매" 순):

```ts
  { id: 'smart-money', label: '스마트머니 분석', icon: Brain, href: '/investment/smart-money' },
  { id: 'auction', label: '부동산 경매', icon: Gavel, href: '/investment/auction' },
  { id: 'trading', label: '자동매매', icon: TrendingUp, href: '/investment/trading' },
```

- [ ] **Step 8: 권한 검증 스크립트 실행**

```bash
npm run check:permissions
```

기대: 통과. 실패 시 prebuild에서 차단되므로 즉시 누락된 항목 확인.

- [ ] **Step 9: 빌드 확인**

```bash
npm run build
```

기대: 성공 (페이지가 아직 없으므로 메뉴 클릭 시 404가 정상이지만 빌드 자체는 통과).

- [ ] **Step 10: 커밋**

```bash
git add src/types/permissions.ts src/config/menuConfig.ts src/app/investment/layout.tsx
git commit -m "feat(auction): 권한 3종 + 메뉴 + 투자 사이드바 등록"
```


---

## Task 3: 도메인 타입 + ROI 계산기 (TDD)

ROI 계산은 페이지·시뮬레이터·정렬·필터 곳곳에서 재사용되므로 순수 함수로 분리하고 단위 테스트를 먼저 작성한다.

**Files:**
- Create: `src/types/auction.ts`
- Create: `src/lib/auction/roiCalculator.ts`
- Create: `src/lib/auction/roiCalculator.test.ts`

- [ ] **Step 1: 도메인 타입 작성**

`src/types/auction.ts`:

```ts
export type PropertyType =
  | 'apt' | 'officetel' | 'villa' | 'house'
  | 'commercial' | 'land' | 'factory' | 'forest' | 'other'

export type AuctionStatus = 'active' | 'pending_decision' | 'sold' | 'cancelled' | 'postponed'

export type MatchConfidence = 'high' | 'mid' | 'low'

export interface AuctionItem {
  id: string
  case_number: string
  item_number: number
  court_name: string
  court_code: string
  property_type: PropertyType
  address_road: string | null
  address_jibun: string | null
  sido: string | null
  sigungu: string | null
  eupmyeondong: string | null
  pnu: string | null
  land_area_m2: number | null
  building_area_m2: number | null
  floor: number | null
  total_floors: number | null
  building_year: number | null
  appraisal_price: number
  min_bid_price: number
  bid_deposit: number | null
  failure_count: number
  discount_rate: number | null
  next_auction_date: string | null
  status: AuctionStatus
  sold_price: number | null
  sold_at: string | null
  source_url: string | null
  notice_pdf_url: string | null
  appraisal_pdf_url: string | null
  photos: string[]
  first_seen_at: string
  last_synced_at: string
}

export interface MarketPrice {
  source: string
  matched_complex: string | null
  median_price_3m: number | null
  trade_count_3m: number | null
  median_price_12m: number | null
  last_trade_date: string | null
  match_confidence: MatchConfidence
}

/** 1차 — 객관 지표 */
export interface RoiPrimary {
  discount_rate_pct: number          // (감정가-최저가)/감정가 × 100
  failure_count: number
  round_no: number                   // failure_count + 1
  d_day: number | null               // null = 매각기일 미정
  bid_deposit: number                // min_bid_price × 0.1
  price_per_m2: number | null        // 면적 0/null이면 null
}

/** 2차 — 시세 매칭 ROI (있는 경우) */
export interface RoiSecondary {
  expected_market_price: number
  expected_resale_profit: number
  market_discount_rate_pct: number
  simple_roi_pct: number
  match_confidence: MatchConfidence
  extra_costs: ExtraCosts
}

/** 3차 — 임대 시뮬 (사용자 입력) */
export interface RoiTertiary {
  total_investment: number
  annual_net_rent: number
  rental_yield_pct: number
  payback_years: number | null       // 0이면 null
}

export interface ExtraCosts {
  acquisition_tax: number
  registration_fee: number
  vacancy_cost: number
  repair_cost: number
  unpaid_dues: number
}

export interface SimulatorInput {
  bid_price: number
  monthly_rent: number
  monthly_management_cost: number
  annual_property_tax: number
  repair_cost: number
  unpaid_dues: number
  is_multi_owner: boolean
}
```

- [ ] **Step 2: 실패하는 테스트 작성 (1차 — discount_rate_pct)**

`src/lib/auction/roiCalculator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { calculatePrimary, calculateExtraCosts, calculateSecondary, calculateTertiary } from './roiCalculator'
import type { AuctionItem, MarketPrice, SimulatorInput } from '@/types/auction'

const baseItem: AuctionItem = {
  id: 'i1',
  case_number: '2026타경12345',
  item_number: 1,
  court_name: '서울중앙지방법원',
  court_code: '00',
  property_type: 'apt',
  address_road: null, address_jibun: null,
  sido: '서울특별시', sigungu: '강남구', eupmyeondong: '도곡동',
  pnu: null,
  land_area_m2: null, building_area_m2: 84,
  floor: 10, total_floors: 25, building_year: 2010,
  appraisal_price: 1_200_000_000,
  min_bid_price: 840_000_000,
  bid_deposit: null,
  failure_count: 1,
  discount_rate: null,
  next_auction_date: null,
  status: 'active',
  sold_price: null, sold_at: null,
  source_url: null, notice_pdf_url: null, appraisal_pdf_url: null,
  photos: [], first_seen_at: '', last_synced_at: ''
}

describe('calculatePrimary', () => {
  it('할인율은 (감정가-최저가)/감정가 × 100 으로 계산된다', () => {
    const r = calculatePrimary(baseItem, '2026-05-09')
    expect(r.discount_rate_pct).toBeCloseTo(30.0, 1)
  })

  it('회차는 failure_count + 1 이다', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').round_no).toBe(2)
  })

  it('D-day가 null이면 null을 반환한다', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').d_day).toBeNull()
  })

  it('D-day는 매각기일 - today (양수)', () => {
    const r = calculatePrimary({ ...baseItem, next_auction_date: '2026-05-16' }, '2026-05-09')
    expect(r.d_day).toBe(7)
  })

  it('보증금은 최저가의 10%', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').bid_deposit).toBe(84_000_000)
  })

  it('명세서 표기 보증금이 있으면 그것을 사용', () => {
    const r = calculatePrimary({ ...baseItem, bid_deposit: 100_000_000 }, '2026-05-09')
    expect(r.bid_deposit).toBe(100_000_000)
  })

  it('㎡당 최저가는 면적이 0이면 null', () => {
    const r = calculatePrimary({ ...baseItem, building_area_m2: 0 }, '2026-05-09')
    expect(r.price_per_m2).toBeNull()
  })

  it('㎡당 최저가는 최저가/면적', () => {
    expect(calculatePrimary(baseItem, '2026-05-09').price_per_m2).toBe(10_000_000)
  })
})

describe('calculateExtraCosts', () => {
  it('주거 1주택은 취득세 4.6%', () => {
    const c = calculateExtraCosts({ propertyType: 'apt', isMultiOwner: false, bidPrice: 1_000_000_000 })
    expect(c.acquisition_tax).toBe(46_000_000)
  })

  it('다주택은 취득세 12% (조정지역 가정)', () => {
    const c = calculateExtraCosts({ propertyType: 'apt', isMultiOwner: true, bidPrice: 1_000_000_000 })
    expect(c.acquisition_tax).toBe(120_000_000)
  })

  it('상가/오피스는 취득세 4.6%', () => {
    expect(calculateExtraCosts({ propertyType: 'commercial', isMultiOwner: false, bidPrice: 100_000_000 }).acquisition_tax).toBe(4_600_000)
  })

  it('토지는 취득세 4.6%', () => {
    expect(calculateExtraCosts({ propertyType: 'land', isMultiOwner: false, bidPrice: 100_000_000 }).acquisition_tax).toBe(4_600_000)
  })

  it('등기·법무비는 매수가의 0.7%', () => {
    expect(calculateExtraCosts({ propertyType: 'apt', isMultiOwner: false, bidPrice: 1_000_000_000 }).registration_fee).toBe(7_000_000)
  })
})

describe('calculateSecondary', () => {
  const market: MarketPrice = {
    source: 'molit_apt_trade',
    matched_complex: '도곡렉슬',
    median_price_3m: 1_080_000_000,
    trade_count_3m: 5,
    median_price_12m: 1_050_000_000,
    last_trade_date: '2026-04-15',
    match_confidence: 'high'
  }

  it('예상 시세는 median_price_3m을 우선 사용', () => {
    const s = calculateSecondary(baseItem, market, { isMultiOwner: false })
    expect(s.expected_market_price).toBe(1_080_000_000)
  })

  it('median_price_3m이 null이면 12m fallback', () => {
    const s = calculateSecondary(baseItem, { ...market, median_price_3m: null }, { isMultiOwner: false })
    expect(s.expected_market_price).toBe(1_050_000_000)
  })

  it('단순 수익률은 차익 / (입찰가+부대비용) × 100', () => {
    const s = calculateSecondary(baseItem, market, { isMultiOwner: false })
    // bid 840M + tax 38.64M + reg 5.88M = 884.52M; resale = 1080M - 884.52M = 195.48M
    // simple = 195.48M / 884.52M ≈ 22.10%
    expect(s.simple_roi_pct).toBeCloseTo(22.10, 0)
  })

  it('match_confidence를 그대로 노출', () => {
    const s = calculateSecondary(baseItem, { ...market, match_confidence: 'mid' }, { isMultiOwner: false })
    expect(s.match_confidence).toBe('mid')
  })
})

describe('calculateTertiary', () => {
  const input: SimulatorInput = {
    bid_price: 840_000_000,
    monthly_rent: 3_500_000,
    monthly_management_cost: 200_000,
    annual_property_tax: 4_000_000,
    repair_cost: 30_000_000,
    unpaid_dues: 0,
    is_multi_owner: false
  }

  it('연간 순임대수익 = (월세 - 관리비)*12 - 재산세', () => {
    const t = calculateTertiary(baseItem, input)
    // (3,500,000 - 200,000) × 12 - 4,000,000 = 35,600,000
    expect(t.annual_net_rent).toBe(35_600_000)
  })

  it('총 투자비용 = 입찰가 + 부대비용 + 수리비', () => {
    const t = calculateTertiary(baseItem, input)
    // 840M + tax 38.64M + reg 5.88M + repair 30M = 914.52M
    expect(t.total_investment).toBe(914_520_000)
  })

  it('회수기간 = 총 투자비용 / 연간 순임대수익', () => {
    const t = calculateTertiary(baseItem, input)
    // 914.52M / 35.6M ≈ 25.69
    expect(t.payback_years).toBeCloseTo(25.69, 1)
  })

  it('연간 순임대수익이 0 이하면 회수기간은 null', () => {
    const t = calculateTertiary(baseItem, { ...input, monthly_rent: 0 })
    expect(t.payback_years).toBeNull()
  })
})
```

- [ ] **Step 3: 테스트 실행 (실패 확인)**

```bash
npx vitest run src/lib/auction/roiCalculator.test.ts
```

기대: 모듈 미존재로 전체 실패.

- [ ] **Step 4: 최소 구현**

`src/lib/auction/roiCalculator.ts`:

```ts
import type {
  AuctionItem, MarketPrice, RoiPrimary, RoiSecondary, RoiTertiary,
  ExtraCosts, SimulatorInput, PropertyType
} from '@/types/auction'

export function calculatePrimary(item: AuctionItem, todayISO: string): RoiPrimary {
  const discount = (item.appraisal_price - item.min_bid_price) / item.appraisal_price * 100
  const round_no = item.failure_count + 1
  const d_day = item.next_auction_date
    ? Math.round((new Date(item.next_auction_date).getTime() - new Date(todayISO).getTime()) / 86_400_000)
    : null
  const bid_deposit = item.bid_deposit ?? Math.round(item.min_bid_price * 0.1)
  const price_per_m2 = item.building_area_m2 && item.building_area_m2 > 0
    ? Math.round(item.min_bid_price / item.building_area_m2)
    : null
  return {
    discount_rate_pct: Math.round(discount * 100) / 100,
    failure_count: item.failure_count,
    round_no,
    d_day,
    bid_deposit,
    price_per_m2,
  }
}

interface ExtraCostInput {
  propertyType: PropertyType
  isMultiOwner: boolean
  bidPrice: number
  vacancyCost?: number
  repairCost?: number
  unpaidDues?: number
}

const ACQUISITION_TAX_RATES: Record<PropertyType, { single: number; multi: number }> = {
  apt:        { single: 0.046, multi: 0.12 },
  officetel:  { single: 0.046, multi: 0.046 },
  villa:      { single: 0.046, multi: 0.12 },
  house:      { single: 0.046, multi: 0.12 },
  commercial: { single: 0.046, multi: 0.046 },
  land:       { single: 0.046, multi: 0.046 },
  factory:    { single: 0.046, multi: 0.046 },
  forest:     { single: 0.046, multi: 0.046 },
  other:      { single: 0.046, multi: 0.046 },
}

export function calculateExtraCosts(input: ExtraCostInput): ExtraCosts {
  const rate = ACQUISITION_TAX_RATES[input.propertyType]
  const taxRate = input.isMultiOwner ? rate.multi : rate.single
  return {
    acquisition_tax: Math.round(input.bidPrice * taxRate),
    registration_fee: Math.round(input.bidPrice * 0.007),
    vacancy_cost: input.vacancyCost ?? 0,
    repair_cost: input.repairCost ?? 0,
    unpaid_dues: input.unpaidDues ?? 0,
  }
}

export function calculateSecondary(
  item: AuctionItem,
  market: MarketPrice,
  opts: { isMultiOwner: boolean; vacancyCost?: number; repairCost?: number; unpaidDues?: number }
): RoiSecondary | null {
  const expected = market.median_price_3m ?? market.median_price_12m
  if (!expected) return null
  const extras = calculateExtraCosts({
    propertyType: item.property_type,
    isMultiOwner: opts.isMultiOwner,
    bidPrice: item.min_bid_price,
    vacancyCost: opts.vacancyCost,
    repairCost: opts.repairCost,
    unpaidDues: opts.unpaidDues,
  })
  const totalCost = item.min_bid_price + extras.acquisition_tax + extras.registration_fee + extras.vacancy_cost + extras.repair_cost + extras.unpaid_dues
  const profit = expected - totalCost
  const marketDiscount = (expected - item.min_bid_price) / expected * 100
  const simpleRoi = profit / totalCost * 100
  return {
    expected_market_price: expected,
    expected_resale_profit: profit,
    market_discount_rate_pct: Math.round(marketDiscount * 100) / 100,
    simple_roi_pct: Math.round(simpleRoi * 100) / 100,
    match_confidence: market.match_confidence,
    extra_costs: extras,
  }
}

export function calculateTertiary(item: AuctionItem, input: SimulatorInput): RoiTertiary {
  const extras = calculateExtraCosts({
    propertyType: item.property_type,
    isMultiOwner: input.is_multi_owner,
    bidPrice: input.bid_price,
    repairCost: input.repair_cost,
    unpaidDues: input.unpaid_dues,
  })
  const totalInvestment = input.bid_price + extras.acquisition_tax + extras.registration_fee + extras.repair_cost + extras.unpaid_dues
  const annualNetRent = (input.monthly_rent - input.monthly_management_cost) * 12 - input.annual_property_tax
  const rentalYield = totalInvestment > 0 ? annualNetRent / totalInvestment * 100 : 0
  const paybackYears = annualNetRent > 0 ? totalInvestment / annualNetRent : null
  return {
    total_investment: totalInvestment,
    annual_net_rent: annualNetRent,
    rental_yield_pct: Math.round(rentalYield * 100) / 100,
    payback_years: paybackYears !== null ? Math.round(paybackYears * 100) / 100 : null,
  }
}
```

- [ ] **Step 5: 테스트 재실행 (전체 통과 확인)**

```bash
npx vitest run src/lib/auction/roiCalculator.test.ts
```

기대: 모든 테스트 통과.

- [ ] **Step 6: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 7: 커밋**

```bash
git add src/types/auction.ts src/lib/auction/
git commit -m "feat(auction): 도메인 타입 + ROI 1·2·3차 계산기 (TDD)"
```


---

## Task 4: 목록 API + 페이지 + 필터

**Files:**
- Create: `src/lib/auction/auctionService.ts`
- Create: `src/app/api/auction/items/route.ts`
- Create: `src/app/investment/auction/page.tsx`
- Create: `src/components/Investment/Auction/AuctionFilters.tsx`
- Create: `src/components/Investment/Auction/AuctionCard.tsx`

- [ ] **Step 1: 서비스 헬퍼 작성**

`src/lib/auction/auctionService.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import type { AuctionItem, MarketPrice, PropertyType } from '@/types/auction'

export interface ListFilter {
  sido?: string
  sigungu?: string
  propertyType?: PropertyType
  minDiscountPct?: number
  minFailureCount?: number
  maxDDay?: number
  minArea?: number
  maxArea?: number
  minPrice?: number
  maxPrice?: number
  sort?: 'discount_desc' | 'd_day_asc' | 'price_asc' | 'failure_desc'
  cursor?: number
  limit?: number
}

export interface ListResult {
  items: Array<AuctionItem & { market: MarketPrice | null }>
  nextCursor: number | null
  total: number
}

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key)
}

export async function listAuctionItems(f: ListFilter): Promise<ListResult> {
  const supabase = getServerSupabase()
  const limit = Math.min(f.limit ?? 30, 100)
  const offset = f.cursor ?? 0

  let q = supabase
    .from('auction_items')
    .select('*, market:auction_market_prices(source, matched_complex, median_price_3m, trade_count_3m, median_price_12m, last_trade_date, match_confidence)', { count: 'exact' })
    .eq('status', 'active')
    .range(offset, offset + limit - 1)

  if (f.sido) q = q.eq('sido', f.sido)
  if (f.sigungu) q = q.eq('sigungu', f.sigungu)
  if (f.propertyType) q = q.eq('property_type', f.propertyType)
  if (f.minDiscountPct !== undefined) q = q.gte('discount_rate', f.minDiscountPct)
  if (f.minFailureCount !== undefined) q = q.gte('failure_count', f.minFailureCount)
  if (f.minArea !== undefined) q = q.gte('building_area_m2', f.minArea)
  if (f.maxArea !== undefined) q = q.lte('building_area_m2', f.maxArea)
  if (f.minPrice !== undefined) q = q.gte('min_bid_price', f.minPrice)
  if (f.maxPrice !== undefined) q = q.lte('min_bid_price', f.maxPrice)
  if (f.maxDDay !== undefined) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + f.maxDDay)
    q = q.lte('next_auction_date', cutoff.toISOString().slice(0, 10))
  }

  switch (f.sort ?? 'discount_desc') {
    case 'discount_desc': q = q.order('discount_rate', { ascending: false, nullsFirst: false }); break
    case 'd_day_asc':     q = q.order('next_auction_date', { ascending: true, nullsFirst: false }); break
    case 'price_asc':     q = q.order('min_bid_price', { ascending: true }); break
    case 'failure_desc':  q = q.order('failure_count', { ascending: false }); break
  }

  const { data, error, count } = await q
  if (error) throw new Error(error.message)

  const rows = (data ?? []).map(r => {
    const m = Array.isArray(r.market) ? r.market[0] : r.market
    return { ...r, market: m ?? null } as AuctionItem & { market: MarketPrice | null }
  })

  const nextCursor = rows.length === limit ? offset + limit : null
  return { items: rows, nextCursor, total: count ?? 0 }
}
```

- [ ] **Step 2: 목록 API 작성**

`src/app/api/auction/items/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { listAuctionItems } from '@/lib/auction/auctionService'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const result = await listAuctionItems({
    sido: sp.get('sido') ?? undefined,
    sigungu: sp.get('sigungu') ?? undefined,
    propertyType: (sp.get('propertyType') ?? undefined) as any,
    minDiscountPct: numOrUndef(sp.get('minDiscountPct')),
    minFailureCount: numOrUndef(sp.get('minFailureCount')),
    maxDDay: numOrUndef(sp.get('maxDDay')),
    minArea: numOrUndef(sp.get('minArea')),
    maxArea: numOrUndef(sp.get('maxArea')),
    minPrice: numOrUndef(sp.get('minPrice')),
    maxPrice: numOrUndef(sp.get('maxPrice')),
    sort: (sp.get('sort') ?? undefined) as any,
    cursor: numOrUndef(sp.get('cursor')),
    limit: numOrUndef(sp.get('limit')),
  })

  return NextResponse.json(result)
}

function numOrUndef(v: string | null): number | undefined {
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
```

(`createServerClient` 헬퍼는 기존 코드베이스의 supabase server util을 사용. 이름이 다르면 grep 후 교체.)

- [ ] **Step 3: 카드 컴포넌트**

`src/components/Investment/Auction/AuctionCard.tsx`:

```tsx
'use client'
import Link from 'next/link'
import { Star } from 'lucide-react'
import type { AuctionItem, MarketPrice } from '@/types/auction'
import { calculatePrimary } from '@/lib/auction/roiCalculator'

interface Props {
  item: AuctionItem & { market: MarketPrice | null }
  isFavorite: boolean
  onToggleFavorite: (itemId: string) => void
}

const PROPERTY_LABEL: Record<string, string> = {
  apt: '아파트', officetel: '오피스텔', villa: '빌라', house: '단독주택',
  commercial: '상가', land: '토지', factory: '공장', forest: '임야', other: '기타'
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function AuctionCard({ item, isFavorite, onToggleFavorite }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const primary = calculatePrimary(item, today)
  const m = item.market

  return (
    <Link
      href={`/investment/auction/${item.id}`}
      className="block bg-at-surface border border-at-border rounded-2xl p-4 hover:bg-at-surface-hover transition-colors"
    >
      <div className="flex justify-between items-start mb-2">
        <div className="text-sm text-at-text-secondary">
          {PROPERTY_LABEL[item.property_type] ?? '기타'} · {item.sido} {item.sigungu} {item.eupmyeondong}
          {item.building_area_m2 ? ` · ${item.building_area_m2}㎡` : ''}
        </div>
        <button
          onClick={(e) => { e.preventDefault(); onToggleFavorite(item.id) }}
          aria-label="관심물건 토글"
          className="p-1.5 rounded-lg hover:bg-at-accent-light"
        >
          <Star className={`w-4 h-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-at-text-secondary'}`} />
        </button>
      </div>

      <div className="text-xs text-at-text-secondary mb-3">
        {item.case_number} · {item.court_name}
      </div>

      <div className="grid grid-cols-2 gap-y-1 text-sm">
        <div>감정가</div>
        <div className="text-right">{fmt(item.appraisal_price)}원</div>
        <div>최저가</div>
        <div className="text-right font-medium">{fmt(item.min_bid_price)}원</div>
        <div>할인율</div>
        <div className="text-right text-emerald-600">-{primary.discount_rate_pct.toFixed(1)}%</div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap text-xs">
        {m?.match_confidence === 'high' && m.median_price_3m && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
            시세 대비 -{Math.round((m.median_price_3m - item.min_bid_price) / m.median_price_3m * 100)}%
          </span>
        )}
        <span className="px-2 py-0.5 rounded-full bg-at-surface-alt">유찰 {primary.failure_count}회</span>
        {primary.d_day !== null && (
          <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">D-{primary.d_day}</span>
        )}
        {primary.price_per_m2 && (
          <span className="px-2 py-0.5 rounded-full bg-at-surface-alt">㎡당 {fmt(primary.price_per_m2)}원</span>
        )}
      </div>
    </Link>
  )
}
```

- [ ] **Step 4: 필터 컴포넌트**

`src/components/Investment/Auction/AuctionFilters.tsx`:

```tsx
'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const PROPERTY_OPTS: Array<{ value: string; label: string }> = [
  { value: '', label: '전체 용도' },
  { value: 'apt', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'villa', label: '빌라' },
  { value: 'house', label: '단독주택' },
  { value: 'commercial', label: '상가' },
  { value: 'land', label: '토지' },
  { value: 'factory', label: '공장' },
  { value: 'forest', label: '임야' },
]

const SIDO_OPTS = ['', '서울특별시', '경기도', '인천광역시', '부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도']

const DISCOUNT_OPTS = [0, 10, 20, 30, 40, 50]
const FAILURE_OPTS = [0, 1, 2, 3]
const DDAY_OPTS = [0, 7, 14, 30]
const SORT_OPTS = [
  { value: 'discount_desc', label: '할인율 ↓' },
  { value: 'd_day_asc',     label: 'D-day ↑' },
  { value: 'price_asc',     label: '최저가 ↑' },
  { value: 'failure_desc',  label: '유찰 ↓' },
]

export function AuctionFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value); else next.delete(key)
    next.delete('cursor')
    router.replace(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
      <select className="select-base" value={sp.get('sido') ?? ''} onChange={e => update('sido', e.target.value)}>
        {SIDO_OPTS.map(s => <option key={s} value={s}>{s || '전체 지역'}</option>)}
      </select>
      <select className="select-base" value={sp.get('propertyType') ?? ''} onChange={e => update('propertyType', e.target.value)}>
        {PROPERTY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <select className="select-base" value={sp.get('minDiscountPct') ?? ''} onChange={e => update('minDiscountPct', e.target.value)}>
        <option value="">할인율 무관</option>
        {DISCOUNT_OPTS.map(d => <option key={d} value={d}>{d}% 이상</option>)}
      </select>
      <select className="select-base" value={sp.get('minFailureCount') ?? ''} onChange={e => update('minFailureCount', e.target.value)}>
        <option value="">유찰 무관</option>
        {FAILURE_OPTS.map(d => <option key={d} value={d}>{d}회 이상</option>)}
      </select>
      <select className="select-base" value={sp.get('maxDDay') ?? ''} onChange={e => update('maxDDay', e.target.value)}>
        <option value="">기일 무관</option>
        {DDAY_OPTS.map(d => <option key={d} value={d}>{d === 0 ? '오늘' : `D-${d} 이내`}</option>)}
      </select>

      <div className="flex-1" />

      <label className="text-sm text-at-text-secondary">정렬</label>
      <select className="select-base" value={sp.get('sort') ?? 'discount_desc'} onChange={e => update('sort', e.target.value)}>
        {SORT_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  )
}
```

`select-base` 클래스는 프로젝트 기존 `globals.css` 또는 Tailwind 유틸리티를 활용 — 없으면 기본 input 스타일 추가:

```css
/* src/app/globals.css 끝부분에 (이미 있다면 생략) */
.select-base { @apply px-3 py-1.5 text-sm bg-at-surface border border-at-border rounded-lg; }
```

- [ ] **Step 5: 목록 페이지 (서버 컴포넌트 + 클라이언트 인터랙션)**

`src/app/investment/auction/page.tsx`:

```tsx
'use client'
import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { AuctionFilters } from '@/components/Investment/Auction/AuctionFilters'
import { AuctionCard } from '@/components/Investment/Auction/AuctionCard'
import type { AuctionItem, MarketPrice } from '@/types/auction'

type Row = AuctionItem & { market: MarketPrice | null }

export default function AuctionListPage() {
  const sp = useSearchParams()
  const [items, setItems] = useState<Row[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState<number | null>(0)

  const load = useCallback(async (c: number | null) => {
    if (c === null) return
    setLoading(true)
    const params = new URLSearchParams(sp.toString())
    params.set('cursor', String(c))
    const r = await fetch(`/api/auction/items?${params}`)
    const j = await r.json()
    setItems(prev => c === 0 ? j.items : [...prev, ...j.items])
    setTotal(j.total)
    setCursor(j.nextCursor)
    setLoading(false)
  }, [sp])

  useEffect(() => { load(0) }, [load])

  useEffect(() => {
    fetch('/api/auction/favorites').then(r => r.json()).then(j => {
      setFavorites(new Set((j.items ?? []).map((x: { item_id: string }) => x.item_id)))
    }).catch(() => {})
  }, [])

  const onToggleFavorite = async (itemId: string) => {
    const isFav = favorites.has(itemId)
    setFavorites(prev => {
      const next = new Set(prev)
      isFav ? next.delete(itemId) : next.add(itemId)
      return next
    })
    await fetch('/api/auction/favorites', {
      method: isFav ? 'DELETE' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId })
    })
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">부동산 경매 ({new Intl.NumberFormat('ko-KR').format(total)}건)</h1>
      </div>

      <AuctionFilters />

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map(item => (
            <AuctionCard
              key={item.id}
              item={item}
              isFavorite={favorites.has(item.id)}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}

      {cursor !== null && !loading && items.length > 0 && (
        <div className="text-center mt-6">
          <button
            onClick={() => load(cursor)}
            className="px-4 py-2 rounded-xl bg-at-surface hover:bg-at-surface-hover border border-at-border"
          >
            더 보기
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: 빌드 확인**

```bash
npm run build
```

기대: 성공. (favorites API는 다음 Task에서 구현되므로 일시적으로 404가 나올 수 있지만, fetch가 실패해도 페이지는 정상 렌더링되어야 함 — `.catch(() => {})` 처리됨.)

- [ ] **Step 7: 브라우저 검증 (테스트 데이터 한 건 INSERT 후)**

```sql
-- mcp__supabase__execute_sql 로 실행 — 검증용 더미 데이터
INSERT INTO auction_items (case_number, item_number, court_name, court_code, property_type, sido, sigungu, eupmyeondong, building_area_m2, appraisal_price, min_bid_price, failure_count, discount_rate, next_auction_date, status)
VALUES
  ('2026타경00001', 1, '서울중앙지방법원', '00', 'apt', '서울특별시', '강남구', '도곡동', 84.5, 1200000000, 840000000, 1, 30.0, CURRENT_DATE + 7, 'active'),
  ('2026타경00002', 1, '의정부지방법원',   '01', 'land', '경기도',     '양평군', '용문면',  null, 240000000, 156800000, 2, 34.7, CURRENT_DATE + 14, 'active'),
  ('2026타경00003', 1, '서울동부지방법원', '02', 'commercial', '서울특별시', '송파구', '잠실동', 65.2, 800000000, 640000000, 1, 20.0, CURRENT_DATE + 3, 'active');
```

```bash
npm run dev
```

브라우저에서 http://localhost:3000 → `whitedc0902@gmail.com` 로그인 → `/investment/auction` 진입 → 카드 3건 노출, 필터(지역/용도/할인율) 변경 시 URL과 결과 동기화 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/auction/auctionService.ts src/app/api/auction/ src/app/investment/auction/page.tsx src/components/Investment/Auction/
git commit -m "feat(auction): 목록 API + 필터/정렬 + 카드 UI"
```


---

## Task 5: 상세 API + 페이지 골격 + 개요 탭

**Files:**
- Create: `src/app/api/auction/items/[itemId]/route.ts`
- Create: `src/app/investment/auction/[itemId]/page.tsx`
- Create: `src/components/Investment/Auction/AuctionDetailHeader.tsx`
- Create: `src/components/Investment/Auction/tabs/OverviewTab.tsx`

- [ ] **Step 1: 상세 API 작성**

`src/app/api/auction/items/[itemId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getServerSupabase } from '@/lib/auction/auctionService'

export const runtime = 'nodejs'

interface Ctx { params: Promise<{ itemId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { itemId } = await ctx.params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sb = getServerSupabase()
  const [item, market, rights, history, ai] = await Promise.all([
    sb.from('auction_items').select('*').eq('id', itemId).single(),
    sb.from('auction_market_prices').select('*').eq('item_id', itemId),
    sb.from('auction_rights_analysis').select('*').eq('item_id', itemId).maybeSingle(),
    sb.from('auction_history').select('*').eq('item_id', itemId).order('round_no', { ascending: true }),
    sb.from('auction_ai_comments').select('*').eq('item_id', itemId).order('generated_at', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (item.error || !item.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    item: item.data,
    market: market.data?.[0] ?? null,
    rights: rights.data ?? null,
    history: history.data ?? [],
    ai: ai.data ?? null,
  })
}
```

- [ ] **Step 2: 상세 헤더 컴포넌트**

`src/components/Investment/Auction/AuctionDetailHeader.tsx`:

```tsx
'use client'
import type { AuctionItem, MarketPrice } from '@/types/auction'
import { calculatePrimary, calculateSecondary } from '@/lib/auction/roiCalculator'

interface Props {
  item: AuctionItem
  market: MarketPrice | null
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function AuctionDetailHeader({ item, market }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const p = calculatePrimary(item, today)
  const s = market ? calculateSecondary(item, market, { isMultiOwner: false }) : null

  return (
    <div className="bg-at-surface rounded-2xl p-6 border border-at-border mb-4">
      <div className="text-sm text-at-text-secondary mb-1">
        {item.case_number} · {item.court_name}
      </div>
      <h1 className="text-xl font-bold mb-4">
        {item.sido} {item.sigungu} {item.eupmyeondong}
      </h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Field label="감정가" value={`${fmt(item.appraisal_price)}원`} />
        <Field label="최저입찰가" value={`${fmt(item.min_bid_price)}원`} highlight />
        <Field label="할인율" value={`-${p.discount_rate_pct.toFixed(1)}%`} accent="emerald" />
        {s && (
          <Field label="시세 대비" value={`-${s.market_discount_rate_pct.toFixed(1)}%`} accent="blue" />
        )}
        <Field label="유찰" value={`${p.failure_count}회 (${p.round_no}차)`} />
        <Field label="매각기일" value={item.next_auction_date ?? '미정'} />
        {p.d_day !== null && <Field label="D-day" value={`D-${p.d_day}`} accent="amber" />}
        <Field label="입찰보증금" value={`${fmt(p.bid_deposit)}원`} />
      </div>
    </div>
  )
}

function Field({ label, value, highlight, accent }: { label: string; value: string; highlight?: boolean; accent?: 'emerald'|'blue'|'amber' }) {
  const colorCls = accent === 'emerald' ? 'text-emerald-600'
                : accent === 'blue'    ? 'text-blue-600'
                : accent === 'amber'   ? 'text-amber-600'
                : 'text-at-text'
  return (
    <div>
      <div className="text-xs text-at-text-secondary">{label}</div>
      <div className={`text-base ${highlight ? 'font-bold' : 'font-medium'} ${colorCls}`}>{value}</div>
    </div>
  )
}
```

- [ ] **Step 3: 개요 탭**

`src/components/Investment/Auction/tabs/OverviewTab.tsx`:

```tsx
'use client'
import type { AuctionItem, MarketPrice } from '@/types/auction'

interface Props {
  item: AuctionItem
  market: MarketPrice | null
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

const PROPERTY_LABEL: Record<string, string> = {
  apt: '아파트', officetel: '오피스텔', villa: '빌라', house: '단독주택',
  commercial: '상가', land: '토지', factory: '공장', forest: '임야', other: '기타'
}

export function OverviewTab({ item, market }: Props) {
  const ratio = market?.median_price_3m
    ? Math.round(item.min_bid_price / market.median_price_3m * 100)
    : null

  return (
    <div className="space-y-6">
      {/* 기본 정보 표 */}
      <section className="bg-at-surface rounded-2xl p-5 border border-at-border">
        <h3 className="font-semibold mb-3">물건 정보</h3>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <Dt>용도</Dt><Dd>{PROPERTY_LABEL[item.property_type] ?? '기타'}</Dd>
          <Dt>주소(도로명)</Dt><Dd>{item.address_road ?? '-'}</Dd>
          <Dt>주소(지번)</Dt><Dd>{item.address_jibun ?? '-'}</Dd>
          <Dt>대지면적</Dt><Dd>{item.land_area_m2 ? `${item.land_area_m2}㎡` : '-'}</Dd>
          <Dt>건물면적</Dt><Dd>{item.building_area_m2 ? `${item.building_area_m2}㎡` : '-'}</Dd>
          <Dt>층</Dt><Dd>{item.floor ?? '-'} / {item.total_floors ?? '-'}층</Dd>
          <Dt>준공년도</Dt><Dd>{item.building_year ?? '-'}</Dd>
        </dl>
      </section>

      {/* 시세 비교 */}
      <section className="bg-at-surface rounded-2xl p-5 border border-at-border">
        <h3 className="font-semibold mb-3">시세 비교</h3>
        {market ? (
          <div className="space-y-2">
            <Bar label="감정가" value={item.appraisal_price} max={Math.max(item.appraisal_price, market.median_price_3m ?? 0)} />
            <Bar label="시세 (3개월 중위)" value={market.median_price_3m ?? 0} max={Math.max(item.appraisal_price, market.median_price_3m ?? 0)} accent="blue" />
            <Bar label="최저입찰가" value={item.min_bid_price} max={Math.max(item.appraisal_price, market.median_price_3m ?? 0)} accent="emerald" />
            {ratio !== null && (
              <p className="text-sm text-at-text-secondary mt-3">
                최저입찰가는 시세의 <strong>{ratio}%</strong> 수준입니다.
                매칭 신뢰도: <strong>{market.match_confidence}</strong> ({market.matched_complex ?? '-'}, 거래 {market.trade_count_3m ?? 0}건)
              </p>
            )}
          </div>
        ) : (
          <p className="text-sm text-at-text-secondary">
            이 물건은 자동 시세 매칭이 불가능합니다 (토지/공장 등). 시뮬레이터 탭에서 직접 시세를 입력해 수익률을 계산해 보세요.
          </p>
        )}
      </section>

      {/* 사진 갤러리 */}
      {item.photos.length > 0 && (
        <section className="bg-at-surface rounded-2xl p-5 border border-at-border">
          <h3 className="font-semibold mb-3">사진</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {item.photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={`사진 ${i+1}`} className="rounded-lg w-full h-40 object-cover" />
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-at-text-secondary px-1">
        ※ 본 정보는 투자 판단의 보조 자료이며, 최종 판단의 책임은 사용자에게 있습니다.
      </p>
    </div>
  )
}

const Dt = (p: { children: React.ReactNode }) => <dt className="text-at-text-secondary">{p.children}</dt>
const Dd = (p: { children: React.ReactNode }) => <dd className="font-medium">{p.children}</dd>

function Bar({ label, value, max, accent }: { label: string; value: number; max: number; accent?: 'blue'|'emerald' }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0
  const color = accent === 'emerald' ? 'bg-emerald-500'
              : accent === 'blue' ? 'bg-blue-500'
              : 'bg-at-text'
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span>{label}</span>
        <span>{fmt(value)}원</span>
      </div>
      <div className="h-3 rounded-full bg-at-surface-alt overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 상세 페이지 + 탭 골격 (다른 탭은 placeholder, Task 6~8에서 채움)**

`src/app/investment/auction/[itemId]/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { use } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { AuctionDetailHeader } from '@/components/Investment/Auction/AuctionDetailHeader'
import { OverviewTab } from '@/components/Investment/Auction/tabs/OverviewTab'
import type { AuctionItem, MarketPrice } from '@/types/auction'

interface DetailResponse {
  item: AuctionItem
  market: MarketPrice | null
  rights: any | null
  history: any[]
  ai: any | null
}

const TABS = [
  { id: 'overview', label: '개요' },
  { id: 'simulator', label: '시뮬레이터' },
  { id: 'rights', label: '권리분석' },
  { id: 'history', label: '이력·통계' },
  { id: 'attachments', label: '첨부' },
] as const

type TabId = typeof TABS[number]['id']

export default function AuctionDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = use(params)
  const router = useRouter()
  const [data, setData] = useState<DetailResponse | null>(null)
  const [tab, setTab] = useState<TabId>('overview')

  useEffect(() => {
    fetch(`/api/auction/items/${itemId}`).then(r => r.json()).then(setData).catch(() => setData(null))
  }, [itemId])

  if (!data) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-at-accent" /></div>

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => router.back()} className="flex items-center gap-1 text-sm text-at-text-secondary mb-3">
        <ArrowLeft className="w-4 h-4" /> 뒤로
      </button>

      <AuctionDetailHeader item={data.item} market={data.market} />

      <div className="flex gap-1 border-b border-at-border mb-4 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-at-accent text-at-accent' : 'border-transparent text-at-text-secondary hover:text-at-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'overview'    && <OverviewTab item={data.item} market={data.market} />}
        {tab === 'simulator'   && <div className="text-at-text-secondary text-sm py-8 text-center">시뮬레이터 탭 (Task 6에서 구현)</div>}
        {tab === 'rights'      && <div className="text-at-text-secondary text-sm py-8 text-center">권리분석 탭 (Task 7에서 구현)</div>}
        {tab === 'history'     && <div className="text-at-text-secondary text-sm py-8 text-center">이력·통계 탭 (Task 8에서 구현)</div>}
        {tab === 'attachments' && <div className="text-at-text-secondary text-sm py-8 text-center">첨부 탭 (Task 8에서 구현)</div>}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 6: 브라우저 검증**

dev 서버 실행 후 `/investment/auction` → 카드 클릭 → 상세 페이지 진입 → 헤더/개요 탭 정상 노출 확인. 탭 전환 시 placeholder 정상 표시 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/app/api/auction/items/\[itemId\] src/app/investment/auction/\[itemId\] src/components/Investment/Auction/
git commit -m "feat(auction): 상세 페이지 골격 + 개요 탭 + 헤더"
```


---

## Task 6: 시뮬레이터 탭

**Files:**
- Create: `src/components/Investment/Auction/tabs/SimulatorTab.tsx`
- Modify: `src/app/investment/auction/[itemId]/page.tsx` (placeholder 교체)

- [ ] **Step 1: 시뮬레이터 컴포넌트**

`src/components/Investment/Auction/tabs/SimulatorTab.tsx`:

```tsx
'use client'
import { useState, useMemo } from 'react'
import type { AuctionItem, MarketPrice, SimulatorInput } from '@/types/auction'
import { calculateSecondary, calculateTertiary } from '@/lib/auction/roiCalculator'

interface Props {
  item: AuctionItem
  market: MarketPrice | null
  initialInput?: Partial<SimulatorInput>
  onSave?: (input: SimulatorInput) => void
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function SimulatorTab({ item, market, initialInput, onSave }: Props) {
  const [input, setInput] = useState<SimulatorInput>({
    bid_price: initialInput?.bid_price ?? item.min_bid_price,
    monthly_rent: initialInput?.monthly_rent ?? estimateInitialRent(item, market),
    monthly_management_cost: initialInput?.monthly_management_cost ?? 200_000,
    annual_property_tax: initialInput?.annual_property_tax ?? 0,
    repair_cost: initialInput?.repair_cost ?? 0,
    unpaid_dues: initialInput?.unpaid_dues ?? 0,
    is_multi_owner: initialInput?.is_multi_owner ?? false,
  })

  const tertiary = useMemo(() => calculateTertiary(item, input), [item, input])
  const secondary = useMemo(() => {
    if (!market) return null
    return calculateSecondary(item, market, {
      isMultiOwner: input.is_multi_owner,
      repairCost: input.repair_cost,
      unpaidDues: input.unpaid_dues,
    })
  }, [item, market, input])

  const set = <K extends keyof SimulatorInput>(k: K, v: SimulatorInput[K]) => setInput(p => ({ ...p, [k]: v }))

  const min = item.min_bid_price
  const max = Math.round(item.appraisal_price * 1.1)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* 입력 패널 */}
      <div className="bg-at-surface rounded-2xl p-5 border border-at-border space-y-5">
        <h3 className="font-semibold">입찰 시뮬레이션 입력</h3>

        <Slider
          label="응찰가"
          value={input.bid_price}
          min={min}
          max={max}
          step={100_000}
          format={(n) => `${fmt(n)}원`}
          onChange={(v) => set('bid_price', v)}
        />

        <Slider
          label="예상 월세"
          value={input.monthly_rent}
          min={0}
          max={20_000_000}
          step={50_000}
          format={(n) => `${fmt(n)}원/월`}
          onChange={(v) => set('monthly_rent', v)}
        />

        <Slider
          label="월 관리비"
          value={input.monthly_management_cost}
          min={0}
          max={2_000_000}
          step={10_000}
          format={(n) => `${fmt(n)}원/월`}
          onChange={(v) => set('monthly_management_cost', v)}
        />

        <Slider
          label="연 재산세"
          value={input.annual_property_tax}
          min={0}
          max={50_000_000}
          step={100_000}
          format={(n) => `${fmt(n)}원/년`}
          onChange={(v) => set('annual_property_tax', v)}
        />

        <Slider
          label="수리비"
          value={input.repair_cost}
          min={0}
          max={200_000_000}
          step={1_000_000}
          format={(n) => `${fmt(n)}원`}
          onChange={(v) => set('repair_cost', v)}
        />

        <Slider
          label="체납 관리비/세금"
          value={input.unpaid_dues}
          min={0}
          max={50_000_000}
          step={100_000}
          format={(n) => `${fmt(n)}원`}
          onChange={(v) => set('unpaid_dues', v)}
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={input.is_multi_owner}
            onChange={(e) => set('is_multi_owner', e.target.checked)}
          />
          다주택자 (취득세 12% 적용)
        </label>

        {onSave && (
          <button
            onClick={() => onSave(input)}
            className="w-full py-2 rounded-xl bg-at-accent text-white font-medium"
          >
            관심물건에 저장
          </button>
        )}
      </div>

      {/* 결과 패널 */}
      <div className="space-y-4">
        {secondary && (
          <div className="bg-at-surface rounded-2xl p-5 border border-at-border">
            <h3 className="font-semibold mb-3">매도 시뮬 (시세 기반)</h3>
            <Result label="예상 시세" value={`${fmt(secondary.expected_market_price)}원`} />
            <Result label="예상 매도차익" value={`${fmt(secondary.expected_resale_profit)}원`} accent={secondary.expected_resale_profit > 0 ? 'emerald' : 'rose'} />
            <Result label="단순 수익률" value={`${secondary.simple_roi_pct.toFixed(2)}%`} accent={secondary.simple_roi_pct > 0 ? 'emerald' : 'rose'} />
            <p className="text-xs text-at-text-secondary mt-2">시세 매칭 신뢰도: {secondary.match_confidence}</p>
          </div>
        )}

        <div className="bg-at-surface rounded-2xl p-5 border border-at-border">
          <h3 className="font-semibold mb-3">임대 시뮬</h3>
          <Result label="총 투자비용" value={`${fmt(tertiary.total_investment)}원`} />
          <Result label="연 순임대수익" value={`${fmt(tertiary.annual_net_rent)}원`} />
          <Result label="임대수익률" value={`${tertiary.rental_yield_pct.toFixed(2)}%`} accent={tertiary.rental_yield_pct > 0 ? 'emerald' : 'rose'} />
          <Result label="원금 회수기간" value={tertiary.payback_years === null ? '계산 불가' : `${tertiary.payback_years.toFixed(1)}년`} />
        </div>
      </div>
    </div>
  )
}

function estimateInitialRent(item: AuctionItem, market: MarketPrice | null): number {
  // 시세의 0.4% 정도를 월세로 가정 (정밀하지 않음 — 사용자 슬라이더로 조정)
  const base = market?.median_price_3m ?? item.appraisal_price
  return Math.round(base * 0.004 / 50_000) * 50_000
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (n: number) => string
  onChange: (v: number) => void
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-sm tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  )
}

function Result({ label, value, accent }: { label: string; value: string; accent?: 'emerald'|'rose' }) {
  const cls = accent === 'emerald' ? 'text-emerald-600 font-semibold'
            : accent === 'rose' ? 'text-rose-600 font-semibold'
            : 'font-medium'
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-at-border last:border-b-0">
      <span className="text-sm text-at-text-secondary">{label}</span>
      <span className={`text-base tabular-nums ${cls}`}>{value}</span>
    </div>
  )
}
```

- [ ] **Step 2: 상세 페이지에 시뮬레이터 탭 연결 + 즐겨찾기 저장 콜백**

`src/app/investment/auction/[itemId]/page.tsx` 의 import에 추가:

```ts
import { SimulatorTab } from '@/components/Investment/Auction/tabs/SimulatorTab'
import type { SimulatorInput } from '@/types/auction'
```

탭 영역의 `simulator` placeholder를 다음으로 교체:

```tsx
{tab === 'simulator' && (
  <SimulatorTab
    item={data.item}
    market={data.market}
    onSave={async (input: SimulatorInput) => {
      await fetch('/api/auction/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemId: data.item.id,
          target_bid_price: input.bid_price,
          expected_extra_cost: input.repair_cost + input.unpaid_dues,
          expected_monthly_rent: input.monthly_rent,
        }),
      })
      alert('관심물건에 저장되었습니다.')
    }}
  />
)}
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 4: 브라우저 검증**

상세 페이지 → "시뮬레이터" 탭 → 응찰가/월세 슬라이더 조작 → 우측 결과(매도/임대 시뮬) 실시간 갱신 확인. "관심물건에 저장" 버튼 클릭 → alert 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/components/Investment/Auction/tabs/SimulatorTab.tsx src/app/investment/auction/\[itemId\]/page.tsx
git commit -m "feat(auction): 시뮬레이터 탭 (슬라이더 + 실시간 ROI + 저장)"
```


---

## Task 7: 권리분석 탭 + AI 코멘트 API (Claude Haiku 4.5)

**Files:**
- Create: `src/lib/auction/aiPrompt.ts`
- Create: `src/app/api/auction/ai-comment/[itemId]/route.ts`
- Create: `src/components/Investment/Auction/tabs/RightsTab.tsx`
- Modify: `src/app/investment/auction/[itemId]/page.tsx` (placeholder 교체)

- [ ] **Step 1: 환경변수 확인**

```bash
grep -E "ANTHROPIC_API_KEY" .env.local || echo "KEY MISSING"
```

키가 없다면 `.env.local`에 추가:

```
ANTHROPIC_API_KEY=sk-ant-...
```

- [ ] **Step 2: SDK 설치 확인**

```bash
npm ls @anthropic-ai/sdk
```

없으면:

```bash
npm install @anthropic-ai/sdk
```

- [ ] **Step 3: 프롬프트 모듈 작성**

`src/lib/auction/aiPrompt.ts`:

```ts
export const AI_PROMPT_VERSION = 'v1'

export const AI_SYSTEM_PROMPT = `당신은 한국 부동산 경매 권리분석 전문가입니다. 매각물건명세서의 원문 텍스트와 메타데이터를 받아 다음을 JSON으로 출력하세요.

분석 원칙:
- 말소기준권리 식별: 가장 빠른 (근)저당, 가압류, 담보가등기, 경매개시결정 등기 중 최선순위 = 말소기준
- 임차인 대항력 판단: 전입신고일 + 인도 + 확정일자가 말소기준 이전이면 대항력 있음 (낙찰자 인수)
- 인수 위험: 대항력 임차인 보증금, 체납 관리비/세금, 유치권 등
- 위험 점수(0~100): 0=안전, 100=치명적

출력 JSON 스키마:
{
  "summary": "한 문단(3~5줄) 요약",
  "risk_score": 0~100 정수,
  "bullet_points": ["짧은 위험/특이사항 문장", ...]
}

판단이 어려운 부분은 "확인 필요"로 표시. 추측은 금지.`

export interface AiInput {
  caseNumber: string
  courtName: string
  propertyType: string
  appraisalPrice: number
  minBidPrice: number
  failureCount: number
  rawNoticeText: string | null
  baseRightType: string | null
  baseRightDate: string | null
  hasSeniorTenant: boolean | null
  totalDeposit: number | null
}

export function buildUserPrompt(input: AiInput): string {
  return `사건번호: ${input.caseNumber}
법원: ${input.courtName}
용도: ${input.propertyType}
감정가: ${input.appraisalPrice.toLocaleString('ko-KR')}원
최저입찰가: ${input.minBidPrice.toLocaleString('ko-KR')}원
유찰: ${input.failureCount}회
말소기준권리(파서 추정): ${input.baseRightType ?? '미확인'} (${input.baseRightDate ?? '-'})
대항력 임차인 존재(파서 추정): ${input.hasSeniorTenant === null ? '미확인' : input.hasSeniorTenant ? '있음' : '없음'}
임차보증금 합계(파서 추정): ${input.totalDeposit?.toLocaleString('ko-KR') ?? '-'}원

매각물건명세서 원문:
"""
${input.rawNoticeText ?? '(파싱된 원문 없음)'}
"""`
}
```

- [ ] **Step 4: AI 코멘트 API 작성 (사용자당 일 50회 한도)**

`src/app/api/auction/ai-comment/[itemId]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'
import { getServerSupabase } from '@/lib/auction/auctionService'
import { AI_PROMPT_VERSION, AI_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/auction/aiPrompt'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5-20251001'
const DAILY_LIMIT = 50
const CACHE_TTL_HOURS = 24

interface Ctx { params: Promise<{ itemId: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { itemId } = await ctx.params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sb = getServerSupabase()

  // 캐시 확인
  const cached = await sb
    .from('auction_ai_comments')
    .select('*')
    .eq('item_id', itemId)
    .eq('prompt_version', AI_PROMPT_VERSION)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached.data) {
    const ageHours = (Date.now() - new Date(cached.data.generated_at).getTime()) / 3_600_000
    if (ageHours < CACHE_TTL_HOURS) {
      return NextResponse.json({ ...cached.data, cached: true })
    }
  }

  // 일일 한도 체크
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  const { count } = await sb
    .from('auction_ai_comments')
    .select('id', { count: 'exact', head: true })
    .gte('generated_at', since.toISOString())
    .filter('id', 'in', `(select id from auction_ai_comments where item_id in (select item_id from auction_user_favorites where user_id = '${user.id}'))`)
  // ↑ 사용자별 호출 카운트는 별도 테이블이 깔끔하지만 MVP에서는 단순 헤더 메모리 카운터 또는 추후 별도 테이블 도입 권장
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json({ error: 'daily_limit_exceeded' }, { status: 429 })
  }

  // 입력 데이터 조회
  const item = await sb.from('auction_items').select('*').eq('id', itemId).single()
  if (!item.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const rights = await sb.from('auction_rights_analysis').select('*').eq('item_id', itemId).maybeSingle()

  // Claude 호출 (system은 cache_control로 캐싱)
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const userPrompt = buildUserPrompt({
    caseNumber: item.data.case_number,
    courtName: item.data.court_name,
    propertyType: item.data.property_type,
    appraisalPrice: item.data.appraisal_price,
    minBidPrice: item.data.min_bid_price,
    failureCount: item.data.failure_count,
    rawNoticeText: rights.data?.raw_text ?? null,
    baseRightType: rights.data?.base_right_type ?? null,
    baseRightDate: rights.data?.base_right_date ?? null,
    hasSeniorTenant: rights.data?.has_senior_tenant ?? null,
    totalDeposit: rights.data?.total_deposit ?? null,
  })

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [{
      type: 'text',
      text: AI_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    }],
    messages: [{ role: 'user', content: userPrompt }],
  })

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  let parsed: { summary: string; risk_score: number; bullet_points: string[] }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no json')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'ai_invalid_response', raw: text }, { status: 502 })
  }

  // 캐시 저장
  const { data: saved, error: saveErr } = await sb
    .from('auction_ai_comments')
    .upsert({
      item_id: itemId,
      prompt_version: AI_PROMPT_VERSION,
      model: MODEL,
      summary: parsed.summary,
      risk_score: parsed.risk_score,
      bullet_points: parsed.bullet_points,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'item_id,prompt_version' })
    .select()
    .single()
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })

  return NextResponse.json({ ...saved, cached: false })
}
```

- [ ] **Step 5: 권리분석 탭**

`src/components/Investment/Auction/tabs/RightsTab.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

interface Rights {
  base_right_type: string | null
  base_right_date: string | null
  has_senior_tenant: boolean | null
  tenant_count: number | null
  total_deposit: number | null
  unsettled_taxes: number | null
  risk_flags: Record<string, boolean>
  parse_status: string | null
}

interface AiComment {
  summary: string
  risk_score: number | null
  bullet_points: string[] | null
  generated_at: string
  cached?: boolean
}

interface Props {
  itemId: string
  rights: Rights | null
  initialAi: AiComment | null
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function RightsTab({ itemId, rights, initialAi }: Props) {
  const [ai, setAi] = useState<AiComment | null>(initialAi)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const callAi = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch(`/api/auction/ai-comment/${itemId}`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) {
        setErr(j.error === 'daily_limit_exceeded' ? '오늘의 AI 분석 한도(50회)를 초과했습니다.' : `오류: ${j.error}`)
      } else {
        setAi(j)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="bg-at-surface rounded-2xl p-5 border border-at-border">
        <h3 className="font-semibold mb-3">자동 추출 권리분석</h3>
        {rights ? (
          <dl className="grid grid-cols-2 gap-y-2 text-sm">
            <Dt>말소기준권리</Dt>
            <Dd>{rights.base_right_type ?? '미확인'} {rights.base_right_date && `(${rights.base_right_date})`}</Dd>
            <Dt>대항력 임차인</Dt>
            <Dd className={rights.has_senior_tenant ? 'text-rose-600 font-semibold' : ''}>
              {rights.has_senior_tenant === null ? '미확인' : rights.has_senior_tenant ? '있음 (인수 위험)' : '없음'}
            </Dd>
            <Dt>임차인 수</Dt>
            <Dd>{rights.tenant_count ?? '-'}명</Dd>
            <Dt>임차보증금 합계</Dt>
            <Dd>{fmt(rights.total_deposit)}원</Dd>
            <Dt>체납 추정</Dt>
            <Dd>{fmt(rights.unsettled_taxes)}원</Dd>
            <Dt>파싱 상태</Dt>
            <Dd>{rights.parse_status ?? '-'}</Dd>
          </dl>
        ) : (
          <p className="text-sm text-at-text-secondary">권리분석 데이터가 아직 수집되지 않았습니다.</p>
        )}
      </section>

      <section className="bg-at-surface rounded-2xl p-5 border border-at-border">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">AI 권리분석 코멘트</h3>
          <button
            onClick={callAi}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-at-accent-light text-at-accent text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {ai ? '재생성' : 'AI 분석 실행'}
          </button>
        </div>

        {err && <p className="text-sm text-rose-600 mb-2">{err}</p>}

        {ai ? (
          <div className="space-y-3">
            {ai.risk_score !== null && (
              <div className="flex items-center gap-2">
                <span className="text-sm">위험도</span>
                <div className="flex-1 h-2 bg-at-surface-alt rounded-full overflow-hidden">
                  <div
                    className={`h-full ${ai.risk_score >= 70 ? 'bg-rose-500' : ai.risk_score >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${ai.risk_score}%` }}
                  />
                </div>
                <span className="text-sm font-semibold tabular-nums">{ai.risk_score}/100</span>
              </div>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-line">{ai.summary}</p>
            {ai.bullet_points && ai.bullet_points.length > 0 && (
              <ul className="text-sm space-y-1 list-disc list-inside text-at-text-secondary">
                {ai.bullet_points.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            <p className="text-xs text-at-text-secondary">
              생성: {new Date(ai.generated_at).toLocaleString('ko-KR')} {ai.cached && '(캐시)'}
            </p>
          </div>
        ) : (
          <p className="text-sm text-at-text-secondary">버튼을 눌러 AI 권리분석을 받아보세요. 결과는 24시간 캐싱됩니다.</p>
        )}

        <p className="text-xs text-at-text-secondary mt-4">
          ※ AI 코멘트는 보조 자료입니다. 최종 투자 판단의 책임은 사용자에게 있으며, 등기부등본 원본을 반드시 확인하세요.
        </p>
      </section>
    </div>
  )
}

const Dt = (p: { children: React.ReactNode }) => <dt className="text-at-text-secondary">{p.children}</dt>
const Dd = (p: { children: React.ReactNode; className?: string }) => <dd className={`font-medium ${p.className ?? ''}`}>{p.children}</dd>
```

- [ ] **Step 6: 상세 페이지 권리분석 탭 연결**

`src/app/investment/auction/[itemId]/page.tsx`에 import 추가:

```ts
import { RightsTab } from '@/components/Investment/Auction/tabs/RightsTab'
```

`rights` placeholder 교체:

```tsx
{tab === 'rights' && (
  <RightsTab itemId={data.item.id} rights={data.rights} initialAi={data.ai} />
)}
```

- [ ] **Step 7: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 8: 브라우저 검증 (실제 AI 호출 1회)**

먼저 더미 권리분석 데이터 INSERT:

```sql
INSERT INTO auction_rights_analysis (item_id, base_right_type, base_right_date, has_senior_tenant, tenant_count, total_deposit, unsettled_taxes, risk_flags, parser_version, parse_status, raw_text)
VALUES (
  (SELECT id FROM auction_items WHERE case_number='2026타경00001'),
  '근저당', '2024-03-15', false, 0, 0, 0,
  '{}'::jsonb,
  'v1', 'ok',
  '매각물건명세서 (예시) — 임차인 없음, 근저당 1순위 5억원, 체납 관리비 없음.'
);
```

브라우저에서 상세 → "권리분석" 탭 → 자동 추출 정보 표 확인 → "AI 분석 실행" 클릭 → 응답 확인 (10~20초 소요) → 다시 클릭 → "캐시" 라벨이 붙은 채 즉시 응답 확인.

- [ ] **Step 9: 커밋**

```bash
git add src/lib/auction/aiPrompt.ts src/app/api/auction/ai-comment src/components/Investment/Auction/tabs/RightsTab.tsx src/app/investment/auction/\[itemId\]/page.tsx
git commit -m "feat(auction): AI 권리분석 (Claude Haiku 4.5 + 24h 캐시) + 권리분석 탭"
```


---

## Task 8: 이력·통계 탭 + 첨부 탭

**Files:**
- Create: `src/components/Investment/Auction/tabs/HistoryTab.tsx`
- Create: `src/components/Investment/Auction/tabs/AttachmentsTab.tsx`
- Create: `src/app/api/auction/items/[itemId]/complex-stats/route.ts`
- Modify: `src/app/investment/auction/[itemId]/page.tsx`

- [ ] **Step 1: 동일 단지 통계 API**

`src/app/api/auction/items/[itemId]/complex-stats/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getServerSupabase } from '@/lib/auction/auctionService'

export const runtime = 'nodejs'

interface Ctx { params: Promise<{ itemId: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { itemId } = await ctx.params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sb = getServerSupabase()
  const item = await sb.from('auction_items').select('sido, sigungu, eupmyeondong, property_type').eq('id', itemId).single()
  if (!item.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 같은 동·용도의 최근 6개월 sold 이력
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const { data, error } = await sb
    .from('auction_history')
    .select('sold_price, bid_count, recorded_at, items:auction_items!inner(sido, sigungu, eupmyeondong, property_type, appraisal_price)')
    .eq('result', 'sold')
    .gte('recorded_at', sixMonthsAgo.toISOString())
    .filter('items.sido', 'eq', item.data.sido)
    .filter('items.sigungu', 'eq', item.data.sigungu)
    .filter('items.eupmyeondong', 'eq', item.data.eupmyeondong)
    .filter('items.property_type', 'eq', item.data.property_type)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ratios = (data ?? [])
    .map((r: any) => {
      const it = Array.isArray(r.items) ? r.items[0] : r.items
      if (!r.sold_price || !it?.appraisal_price) return null
      return r.sold_price / it.appraisal_price * 100
    })
    .filter((v): v is number => v !== null)

  const avg = ratios.length > 0 ? ratios.reduce((s, v) => s + v, 0) / ratios.length : null
  const avgBidCount = (data ?? []).filter((r: any) => r.bid_count).map((r: any) => r.bid_count).reduce((s: number, v: number, _i: number, arr: number[]) => s + v / arr.length, 0)

  return NextResponse.json({
    sample_count: ratios.length,
    avg_sold_to_appraisal_pct: avg ? Math.round(avg * 10) / 10 : null,
    avg_bid_count: ratios.length > 0 ? Math.round(avgBidCount * 10) / 10 : null,
  })
}
```

- [ ] **Step 2: 이력·통계 탭**

`src/components/Investment/Auction/tabs/HistoryTab.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface HistoryRow {
  round_no: number
  scheduled_date: string
  min_bid_price: number
  result: string | null
  sold_price: number | null
  bid_count: number | null
}

interface ComplexStats {
  sample_count: number
  avg_sold_to_appraisal_pct: number | null
  avg_bid_count: number | null
}

interface Props {
  itemId: string
  history: HistoryRow[]
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function HistoryTab({ itemId, history }: Props) {
  const [stats, setStats] = useState<ComplexStats | null>(null)
  useEffect(() => {
    fetch(`/api/auction/items/${itemId}/complex-stats`).then(r => r.json()).then(setStats).catch(() => {})
  }, [itemId])

  const chartData = history.map(h => ({
    회차: `${h.round_no}차`,
    최저가: Math.round(h.min_bid_price / 10_000),
  }))

  const RESULT_LABEL: Record<string, string> = {
    failed: '유찰', sold: '낙찰', cancelled: '취소', postponed: '변경', pending: '예정'
  }

  return (
    <div className="space-y-4">
      <section className="bg-at-surface rounded-2xl p-5 border border-at-border">
        <h3 className="font-semibold mb-3">회차별 변동</h3>
        {history.length === 0 ? (
          <p className="text-sm text-at-text-secondary">이력이 없습니다.</p>
        ) : (
          <>
            <div className="h-48 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="회차" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${(v/10_000).toFixed(0)}억`} />
                  <Tooltip formatter={(v: number) => `${fmt(v * 10_000)}원`} />
                  <Line type="monotone" dataKey="최저가" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <table className="w-full text-sm">
              <thead className="text-at-text-secondary text-left">
                <tr>
                  <th className="py-1">회차</th>
                  <th>예정일</th>
                  <th className="text-right">최저가</th>
                  <th>결과</th>
                  <th className="text-right">낙찰가</th>
                  <th className="text-right">응찰자</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.round_no} className="border-t border-at-border">
                    <td className="py-2">{h.round_no}차</td>
                    <td>{h.scheduled_date}</td>
                    <td className="text-right tabular-nums">{fmt(h.min_bid_price)}원</td>
                    <td>{h.result ? RESULT_LABEL[h.result] ?? h.result : '-'}</td>
                    <td className="text-right tabular-nums">{fmt(h.sold_price)}원</td>
                    <td className="text-right tabular-nums">{h.bid_count ?? '-'}명</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="bg-at-surface rounded-2xl p-5 border border-at-border">
        <h3 className="font-semibold mb-3">동일 동·용도 낙찰 통계 (최근 6개월)</h3>
        {!stats ? (
          <p className="text-sm text-at-text-secondary">로딩 중...</p>
        ) : stats.sample_count === 0 ? (
          <p className="text-sm text-at-text-secondary">이 동·용도의 최근 낙찰 이력이 없습니다.</p>
        ) : (
          <dl className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-at-text-secondary">표본</dt>
              <dd className="text-lg font-semibold">{stats.sample_count}건</dd>
            </div>
            <div>
              <dt className="text-at-text-secondary">평균 낙찰가율</dt>
              <dd className="text-lg font-semibold">{stats.avg_sold_to_appraisal_pct?.toFixed(1) ?? '-'}%</dd>
            </div>
            <div>
              <dt className="text-at-text-secondary">평균 응찰자</dt>
              <dd className="text-lg font-semibold">{stats.avg_bid_count?.toFixed(1) ?? '-'}명</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 3: 첨부 탭**

`src/components/Investment/Auction/tabs/AttachmentsTab.tsx`:

```tsx
'use client'
import { ExternalLink, FileText } from 'lucide-react'
import type { AuctionItem } from '@/types/auction'

interface Props { item: AuctionItem }

export function AttachmentsTab({ item }: Props) {
  const items = [
    { label: '매각물건명세서', url: item.notice_pdf_url },
    { label: '감정평가서', url: item.appraisal_pdf_url },
    { label: '법원경매정보 원문', url: item.source_url },
  ].filter(x => x.url)

  if (items.length === 0) {
    return <p className="text-sm text-at-text-secondary py-8 text-center">첨부된 자료가 없습니다.</p>
  }

  return (
    <div className="bg-at-surface rounded-2xl p-5 border border-at-border space-y-2">
      {items.map((it) => (
        <a
          key={it.label}
          href={it.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-at-surface-hover"
        >
          <FileText className="w-5 h-5 text-at-accent" />
          <span className="flex-1 text-sm font-medium">{it.label}</span>
          <ExternalLink className="w-4 h-4 text-at-text-secondary" />
        </a>
      ))}
      <p className="text-xs text-at-text-secondary mt-3">※ 외부 링크는 새 창으로 열립니다.</p>
    </div>
  )
}
```

- [ ] **Step 4: 상세 페이지 탭 연결**

`src/app/investment/auction/[itemId]/page.tsx` import 추가:

```ts
import { HistoryTab } from '@/components/Investment/Auction/tabs/HistoryTab'
import { AttachmentsTab } from '@/components/Investment/Auction/tabs/AttachmentsTab'
```

placeholder 교체:

```tsx
{tab === 'history'     && <HistoryTab itemId={data.item.id} history={data.history} />}
{tab === 'attachments' && <AttachmentsTab item={data.item} />}
```

- [ ] **Step 5: 빌드 + 브라우저 검증**

```bash
npm run build
```

더미 history INSERT:

```sql
INSERT INTO auction_history (item_id, round_no, scheduled_date, min_bid_price, result)
SELECT id, 1, CURRENT_DATE - 30, 1200000000, 'failed' FROM auction_items WHERE case_number='2026타경00001';
INSERT INTO auction_history (item_id, round_no, scheduled_date, min_bid_price, result)
SELECT id, 2, CURRENT_DATE + 7, 840000000, 'pending' FROM auction_items WHERE case_number='2026타경00001';
```

이력·통계 탭 진입 → 차트 + 표 정상 → "동일 단지 통계"는 표본 0이면 안내 메시지.

- [ ] **Step 6: 커밋**

```bash
git add src/components/Investment/Auction/tabs/ src/app/api/auction/items/\[itemId\]/complex-stats src/app/investment/auction/\[itemId\]/page.tsx
git commit -m "feat(auction): 이력·통계 탭 + 첨부 탭 + 동일 단지 낙찰가율 API"
```

---

## Task 9: 즐겨찾기 API + 관심물건 페이지

**Files:**
- Create: `src/app/api/auction/favorites/route.ts`
- Create: `src/app/investment/auction/favorites/page.tsx`

- [ ] **Step 1: 즐겨찾기 API**

`src/app/api/auction/favorites/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { getServerSupabase } from '@/lib/auction/auctionService'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('auction_user_favorites')
    .select('*, item:auction_items(*), market:auction_items!inner(market_prices:auction_market_prices(*))')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { itemId, target_bid_price, expected_extra_cost, expected_monthly_rent, memo } = body
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const sb = getServerSupabase()
  const { error } = await sb
    .from('auction_user_favorites')
    .upsert({
      user_id: user.id,
      item_id: itemId,
      target_bid_price: target_bid_price ?? null,
      expected_extra_cost: expected_extra_cost ?? null,
      expected_monthly_rent: expected_monthly_rent ?? null,
      memo: memo ?? null,
    }, { onConflict: 'user_id,item_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  const { itemId } = body
  if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })

  const sb = getServerSupabase()
  const { error } = await sb
    .from('auction_user_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('item_id', itemId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 관심물건 페이지**

`src/app/investment/auction/favorites/page.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Pin } from 'lucide-react'
import type { AuctionItem } from '@/types/auction'
import { calculatePrimary } from '@/lib/auction/roiCalculator'

interface Row {
  user_id: string
  item_id: string
  target_bid_price: number | null
  expected_monthly_rent: number | null
  expected_extra_cost: number | null
  memo: string | null
  created_at: string
  item: AuctionItem
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export default function FavoritesPage() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    fetch('/api/auction/favorites').then(r => r.json()).then(j => setRows(j.items)).catch(() => setRows([]))
  }, [])

  if (!rows) return <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-at-accent" /></div>

  const today = new Date().toISOString().slice(0, 10)
  const withDday = rows.map(r => {
    const p = r.item ? calculatePrimary(r.item, today) : null
    return { ...r, dDay: p?.d_day ?? null }
  })
  const pinned = withDday.filter(r => r.dDay !== null && r.dDay <= 3)
  const others = withDday.filter(r => !pinned.includes(r))

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-xl font-bold mb-4">관심물건 ({rows.length}건)</h1>

      {pinned.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-amber-700 mb-2 flex items-center gap-1">
            <Pin className="w-4 h-4" /> 매각기일 임박 (D-3 이내)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {pinned.map(r => <FavCard key={r.item_id} row={r} />)}
          </div>
        </section>
      )}

      {others.length > 0 ? (
        <section>
          <h2 className="text-sm font-semibold text-at-text-secondary mb-2">전체 관심물건</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {others.map(r => <FavCard key={r.item_id} row={r} />)}
          </div>
        </section>
      ) : pinned.length === 0 ? (
        <p className="text-center text-at-text-secondary py-16">관심물건이 없습니다. 목록에서 ⭐로 추가하세요.</p>
      ) : null}
    </div>
  )
}

function FavCard({ row }: { row: Row & { dDay: number | null } }) {
  return (
    <Link href={`/investment/auction/${row.item_id}`} className="block bg-at-surface rounded-2xl p-4 border border-at-border hover:bg-at-surface-hover">
      <div className="text-sm text-at-text-secondary mb-1">
        {row.item.sido} {row.item.sigungu} {row.item.eupmyeondong}
      </div>
      <div className="text-xs text-at-text-secondary mb-3">{row.item.case_number}</div>
      <div className="grid grid-cols-2 gap-y-1 text-sm">
        <div>최저가</div><div className="text-right tabular-nums">{fmt(row.item.min_bid_price)}원</div>
        {row.target_bid_price && <>
          <div>목표 응찰가</div><div className="text-right tabular-nums">{fmt(row.target_bid_price)}원</div>
        </>}
        {row.expected_monthly_rent && <>
          <div>예상 월세</div><div className="text-right tabular-nums">{fmt(row.expected_monthly_rent)}원</div>
        </>}
        {row.dDay !== null && <>
          <div>D-day</div><div className={`text-right ${row.dDay <= 3 ? 'text-rose-600 font-semibold' : ''}`}>D-{row.dDay}</div>
        </>}
      </div>
    </Link>
  )
}
```

- [ ] **Step 3: 사이드바에 관심물건 메뉴 추가 (선택)**

`/investment/auction/favorites` 는 직접 URL로 접근하거나 목록 페이지에 링크 추가. NAV_ITEMS에는 추가하지 않고, 목록 페이지 상단에 "⭐ 관심물건" 링크 한 줄 추가:

`src/app/investment/auction/page.tsx` 헤더 영역 수정:

```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="text-xl font-bold">부동산 경매 ({new Intl.NumberFormat('ko-KR').format(total)}건)</h1>
  <Link href="/investment/auction/favorites" className="text-sm text-at-accent hover:underline">⭐ 관심물건</Link>
</div>
```

상단에 `import Link from 'next/link'` 추가 필요.

- [ ] **Step 4: 빌드 + 브라우저 검증**

```bash
npm run build
```

목록에서 ⭐ 토글 → "⭐ 관심물건" 링크 클릭 → favorites 페이지 진입 → 카드 노출 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/auction/favorites src/app/investment/auction
git commit -m "feat(auction): 관심물건 API + favorites 페이지 + D-3 임박 핀"
```


---

## Task 10: 워커 부트스트랩 (디렉토리 + lib)

워커는 Mac mini M4의 cron으로 매일 새벽 03:00 KST에 실행된다. 기존 `scraping-worker/` 디렉토리에 `auction/` 서브를 추가한다.

**Files:**
- Create: `scraping-worker/auction/package.json`
- Create: `scraping-worker/auction/tsconfig.json`
- Create: `scraping-worker/auction/.env.example`
- Create: `scraping-worker/auction/.gitignore`
- Create: `scraping-worker/auction/src/lib/supabase.ts`
- Create: `scraping-worker/auction/src/lib/logger.ts`
- Create: `scraping-worker/auction/src/lib/types.ts`

- [ ] **Step 1: 디렉토리 생성 + package.json**

```bash
mkdir -p scraping-worker/auction/src/{scrapers,parsers,matchers,jobs,lib}
mkdir -p scraping-worker/auction/test
```

`scraping-worker/auction/package.json`:

```json
{
  "name": "auction-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start:daily": "node dist/jobs/dailyScrape.js",
    "start:dday": "node dist/jobs/ddayAlerts.js",
    "start:filter": "node dist/jobs/filterMatchAlerts.js",
    "test": "vitest run",
    "dev:daily": "tsx src/jobs/dailyScrape.ts"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.49.0",
    "playwright": "^1.49.0",
    "pdf-parse": "^1.1.1",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^22.0.0",
    "@types/pdf-parse": "^1.1.4"
  }
}
```

- [ ] **Step 2: tsconfig**

`scraping-worker/auction/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: 환경변수 템플릿 + .gitignore**

`scraping-worker/auction/.env.example`:

```env
SUPABASE_URL=https://beahjntkmkfhpcbhfnrr.supabase.co
SUPABASE_SERVICE_ROLE_KEY=

DATA_GO_KR_API_KEY=

PLAYWRIGHT_HEADLESS=true
SCRAPE_THROTTLE_MS=500
SCRAPE_MAX_LIST_PAGES=20

PDF_STORAGE_DIR=./pdf-cache
LOG_DIR=./logs

# Slack/이메일 알림 (선택)
SLACK_WEBHOOK_URL=
```

`scraping-worker/auction/.gitignore`:

```
node_modules
dist
.env
.env.local
pdf-cache
logs
```

- [ ] **Step 4: Supabase 클라이언트**

`scraping-worker/auction/src/lib/supabase.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing')

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
})
```

- [ ] **Step 5: 로거**

`scraping-worker/auction/src/lib/logger.ts`:

```ts
import { mkdirSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import 'dotenv/config'

const dir = process.env.LOG_DIR ?? './logs'
mkdirSync(dir, { recursive: true })

type Level = 'info' | 'warn' | 'error' | 'debug'

function fileForToday(): string {
  const today = new Date().toISOString().slice(0, 10)
  return join(dir, `auction-${today}.log`)
}

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...meta }) + '\n'
  process.stdout.write(line)
  appendFileSync(fileForToday(), line)
}

export const log = {
  info:  (m: string, meta?: Record<string, unknown>) => emit('info', m, meta),
  warn:  (m: string, meta?: Record<string, unknown>) => emit('warn', m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit('error', m, meta),
  debug: (m: string, meta?: Record<string, unknown>) => process.env.DEBUG && emit('debug', m, meta),
}
```

- [ ] **Step 6: 공통 타입**

`scraping-worker/auction/src/lib/types.ts`:

```ts
export type PropertyType =
  | 'apt' | 'officetel' | 'villa' | 'house'
  | 'commercial' | 'land' | 'factory' | 'forest' | 'other'

export interface ScrapedListItem {
  caseNumber: string
  itemNumber: number
  courtName: string
  courtCode: string
  propertyType: PropertyType
  sido: string | null
  sigungu: string | null
  eupmyeondong: string | null
  appraisalPrice: number
  minBidPrice: number
  failureCount: number
  nextAuctionDate: string | null
  sourceUrl: string
}

export interface ScrapedDetail extends ScrapedListItem {
  addressRoad: string | null
  addressJibun: string | null
  pnu: string | null
  landAreaM2: number | null
  buildingAreaM2: number | null
  floor: number | null
  totalFloors: number | null
  buildingYear: number | null
  bidDeposit: number | null
  noticePdfUrl: string | null
  appraisalPdfUrl: string | null
  photos: string[]
  status: 'active' | 'pending_decision' | 'sold' | 'cancelled' | 'postponed'
  soldPrice: number | null
  soldAt: string | null
}
```

- [ ] **Step 7: 의존성 설치**

```bash
cd scraping-worker/auction
npm install
npx playwright install chromium
```

- [ ] **Step 8: 빌드 확인**

```bash
npm run build
```

기대: dist 디렉토리에 컴파일 산출물 생성. 에러 없음.

- [ ] **Step 9: 커밋**

```bash
cd ../..  # 루트로 이동
git add scraping-worker/auction/
git commit -m "feat(auction-worker): 디렉토리 부트스트랩 (lib + 타입 + tsconfig)"
```


---

## Task 11: 워커 — 목록 스크래퍼

courtauction.go.kr의 목록 페이지를 지역×용도 매트릭스로 순회한다. 사이트 구조가 복잡하고 자주 변경되므로 셀렉터는 abstract 함수로 분리한다.

**Files:**
- Create: `scraping-worker/auction/src/scrapers/courtAuctionListScraper.ts`

- [ ] **Step 1: 스크래퍼 작성**

`scraping-worker/auction/src/scrapers/courtAuctionListScraper.ts`:

```ts
import { chromium, Browser, Page } from 'playwright'
import { log } from '../lib/logger.js'
import type { ScrapedListItem, PropertyType } from '../lib/types.js'

const BASE_URL = 'https://www.courtauction.go.kr'
const LIST_PATH = '/RetrieveRealEstMulDetailList.laf'  // 정확 경로는 사이트 구조 확인 시 조정
const THROTTLE_MS = Number(process.env.SCRAPE_THROTTLE_MS ?? 500)
const MAX_PAGES = Number(process.env.SCRAPE_MAX_LIST_PAGES ?? 20)

const PROPERTY_CODE_MAP: Record<PropertyType, string> = {
  apt:        '00031',
  officetel:  '00032',
  villa:      '00033',
  house:      '00034',
  commercial: '00041',
  land:       '00050',
  factory:    '00060',
  forest:     '00080',
  other:      '00090',
}

const SIDO_LIST = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도',
  '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
]

export async function scrapeAllLists(): Promise<ScrapedListItem[]> {
  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' })
  const all: ScrapedListItem[] = []
  try {
    for (const sido of SIDO_LIST) {
      for (const propType of Object.keys(PROPERTY_CODE_MAP) as PropertyType[]) {
        try {
          const items = await scrapeOneCategory(browser, sido, propType)
          all.push(...items)
          log.info('list_category_done', { sido, propType, count: items.length })
        } catch (e) {
          log.error('list_category_failed', { sido, propType, error: String(e) })
        }
        await sleep(THROTTLE_MS)
      }
    }
  } finally {
    await browser.close()
  }
  log.info('list_scrape_total', { count: all.length })
  return all
}

async function scrapeOneCategory(browser: Browser, sido: string, propType: PropertyType): Promise<ScrapedListItem[]> {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; AuctionAggregator/1.0; +contact)',
    locale: 'ko-KR',
  })
  const page = await ctx.newPage()
  const results: ScrapedListItem[] = []
  try {
    await page.goto(`${BASE_URL}${LIST_PATH}`, { waitUntil: 'networkidle' })
    // 검색 폼 입력 (사이트 구조 변경 시 셀렉터 조정 필요)
    await selectSido(page, sido)
    await selectPropertyType(page, PROPERTY_CODE_MAP[propType])
    await page.click('button.btn-search, input[type=submit][value=검색]')
    await page.waitForLoadState('networkidle')

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const rows = await extractRowsFromCurrentPage(page, sido, propType)
      if (rows.length === 0) break
      results.push(...rows)

      const hasNext = await goToNextPage(page, pageNo + 1)
      if (!hasNext) break
      await sleep(THROTTLE_MS)
    }
  } finally {
    await ctx.close()
  }
  return results
}

async function selectSido(page: Page, sido: string) {
  // 사이트 구조에 따라 select 또는 dropdown
  await page.selectOption('select[name=sido], #idSido', { label: sido }).catch(async () => {
    await page.click('#sidoBtn, .sido-btn')
    await page.click(`text="${sido}"`)
  })
}

async function selectPropertyType(page: Page, code: string) {
  await page.selectOption('select[name=mulCateLcd], #idJpKindLcd', { value: code }).catch(() => {
    /* 폼 구조에 따라 폴백 */
  })
}

async function extractRowsFromCurrentPage(page: Page, sido: string, propType: PropertyType): Promise<ScrapedListItem[]> {
  return await page.$$eval('table.Ltbl_list tbody tr, table.tbl_list tbody tr', (rows, ctx) => {
    const out: any[] = []
    for (const tr of rows) {
      const tds = tr.querySelectorAll('td')
      if (tds.length < 5) continue
      const link = tr.querySelector('a[href*=Detail]')
      if (!link) continue
      const href = (link as HTMLAnchorElement).getAttribute('href') ?? ''
      // 사이트마다 컬럼 위치는 다를 수 있어, 정규식으로 핵심 정보 추출
      const text = tr.textContent ?? ''
      const caseNumber = (text.match(/\d{4}타경\d+/) ?? [''])[0]
      const itemNumber = Number((text.match(/물건\s*(\d+)/) ?? ['', '1'])[1])
      const appraisal = Number((text.match(/감정가[^\d]*([\d,]+)/) ?? ['', '0'])[1].replace(/,/g, ''))
      const minBid = Number((text.match(/최저가[^\d]*([\d,]+)/) ?? ['', '0'])[1].replace(/,/g, ''))
      const failure = Number((text.match(/유찰\s*(\d+)/) ?? ['', '0'])[1])
      const date = (text.match(/\d{4}[.\-/]\d{2}[.\-/]\d{2}/) ?? [''])[0].replace(/[./]/g, '-')
      out.push({
        caseNumber, itemNumber,
        courtName: (text.match(/[가-힣]+법원/) ?? [''])[0],
        courtCode: '',
        propertyType: ctx.propType,
        sido: ctx.sido,
        sigungu: null,
        eupmyeondong: null,
        appraisalPrice: appraisal,
        minBidPrice: minBid,
        failureCount: failure,
        nextAuctionDate: date || null,
        sourceUrl: `${ctx.base}${href.startsWith('/') ? '' : '/'}${href}`,
      })
    }
    return out
  }, { sido, propType, base: BASE_URL })
}

async function goToNextPage(page: Page, nextNo: number): Promise<boolean> {
  const link = await page.$(`a[onclick*="goPage(${nextNo})"], a[href*="page=${nextNo}"]`)
  if (!link) return false
  await link.click()
  await page.waitForLoadState('networkidle')
  return true
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
```

> **NOTE:** 위 셀렉터는 일반적 패턴으로 작성됨. 첫 실행 시 실제 사이트 DOM과 비교하여 셀렉터 조정 필요. courtauction.go.kr는 frame/table 구조가 복잡하고 페이지마다 form post 방식이 달라, 실제로는 추가 디버깅이 필요할 수 있다. 실제 운영 시 0건 수집되면 셀렉터 우선 점검.

- [ ] **Step 2: 단순 실행 검증 (한 카테고리만 dry run)**

`scraping-worker/auction/src/jobs/dryListRun.ts` (임시 검증용):

```ts
import { chromium } from 'playwright'
import { log } from '../lib/logger.js'

async function main() {
  const browser = await chromium.launch({ headless: false })
  const page = await browser.newPage()
  await page.goto('https://www.courtauction.go.kr', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'home.png' })
  log.info('dry_run_done')
  await browser.close()
}
main().catch(e => { log.error('dry_run_failed', { error: String(e) }); process.exit(1) })
```

```bash
cd scraping-worker/auction
npx tsx src/jobs/dryListRun.ts
```

기대: home.png 생성. 페이지 접근 가능 확인. (이후 dryListRun.ts는 삭제 또는 .gitignore 처리)

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 4: 커밋**

```bash
cd ../..
git add scraping-worker/auction/src/scrapers/courtAuctionListScraper.ts
git commit -m "feat(auction-worker): courtauction.go.kr 목록 스크래퍼 (Playwright)"
```

> **운영 주의:** courtauction.go.kr 정책상 자동 수집은 회색 영역. throttle 0.5초, UA 명시, 차단 응답(403/429) 시 즉시 중단하도록 dailyScrape.ts에서 가드를 둘 것 (Task 14).


---

## Task 12: 워커 — 상세 + PDF 다운로드 + 권리분석 파싱 (TDD)

**Files:**
- Create: `scraping-worker/auction/src/scrapers/courtAuctionDetailScraper.ts`
- Create: `scraping-worker/auction/src/scrapers/pdfDownloader.ts`
- Create: `scraping-worker/auction/src/parsers/noticeParser.ts`
- Create: `scraping-worker/auction/src/parsers/rightsExtractor.ts`
- Create: `scraping-worker/auction/test/parsers/noticeParser.test.ts`

- [ ] **Step 1: 상세 스크래퍼**

`scraping-worker/auction/src/scrapers/courtAuctionDetailScraper.ts`:

```ts
import { chromium, Page } from 'playwright'
import { log } from '../lib/logger.js'
import type { ScrapedDetail, ScrapedListItem } from '../lib/types.js'

const THROTTLE_MS = Number(process.env.SCRAPE_THROTTLE_MS ?? 500)

export async function scrapeDetails(items: ScrapedListItem[]): Promise<ScrapedDetail[]> {
  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; AuctionAggregator/1.0; +contact)',
    locale: 'ko-KR',
  })
  const out: ScrapedDetail[] = []
  try {
    for (const item of items) {
      try {
        const page = await ctx.newPage()
        await page.goto(item.sourceUrl, { waitUntil: 'networkidle' })
        const detail = await extractDetail(page, item)
        out.push(detail)
        await page.close()
      } catch (e) {
        log.warn('detail_failed', { caseNumber: item.caseNumber, error: String(e) })
      }
      await sleep(THROTTLE_MS)
    }
  } finally {
    await browser.close()
  }
  log.info('detail_scrape_total', { count: out.length })
  return out
}

async function extractDetail(page: Page, listItem: ScrapedListItem): Promise<ScrapedDetail> {
  const detail = await page.evaluate(() => {
    const text = document.body.innerText ?? ''
    const grab = (re: RegExp) => (text.match(re) ?? ['', null])[1]
    const num = (s: string | null) => s ? Number(s.replace(/[^0-9.\-]/g, '')) : null

    const photos = Array.from(document.querySelectorAll<HTMLImageElement>('img[src*=photo], img[src*=picture]'))
      .map(img => img.src)
      .filter(s => !!s)

    const noticePdf = (document.querySelector<HTMLAnchorElement>('a[href*=명세서], a[href*=noticeFile]') as HTMLAnchorElement | null)?.href ?? null
    const apprPdf   = (document.querySelector<HTMLAnchorElement>('a[href*=감정], a[href*=appraisalFile]') as HTMLAnchorElement | null)?.href ?? null

    return {
      addressRoad:   grab(/도로명\s*주소[:\s]*([^\n]+)/),
      addressJibun:  grab(/지번\s*주소[:\s]*([^\n]+)/),
      pnu:           grab(/(\d{19})/),
      landAreaM2:    num(grab(/대지면적[:\s]*([\d,.]+)/)),
      buildingAreaM2:num(grab(/건물면적[:\s]*([\d,.]+)/)),
      floor:         num(grab(/(\d+)\s*층/)),
      totalFloors:   num(grab(/지상\s*(\d+)층/)),
      buildingYear:  num(grab(/(\d{4})\s*년\s*준공/)),
      bidDeposit:    num(grab(/입찰보증금[:\s]*([\d,]+)/)),
      noticePdfUrl:  noticePdf,
      appraisalPdfUrl: apprPdf,
      photos,
    }
  })

  return {
    ...listItem,
    addressRoad: detail.addressRoad,
    addressJibun: detail.addressJibun,
    pnu: detail.pnu,
    landAreaM2: detail.landAreaM2,
    buildingAreaM2: detail.buildingAreaM2,
    floor: detail.floor,
    totalFloors: detail.totalFloors,
    buildingYear: detail.buildingYear,
    bidDeposit: detail.bidDeposit,
    noticePdfUrl: detail.noticePdfUrl,
    appraisalPdfUrl: detail.appraisalPdfUrl,
    photos: detail.photos,
    status: 'active',
    soldPrice: null,
    soldAt: null,
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
```

- [ ] **Step 2: PDF 다운로더**

`scraping-worker/auction/src/scrapers/pdfDownloader.ts`:

```ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { log } from '../lib/logger.js'

const DIR = process.env.PDF_STORAGE_DIR ?? './pdf-cache'
mkdirSync(DIR, { recursive: true })

export async function downloadPdf(url: string, key: string): Promise<string | null> {
  const localPath = join(DIR, `${key}.pdf`)
  if (existsSync(localPath)) return localPath
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AuctionAggregator/1.0)' },
    })
    if (!res.ok) {
      log.warn('pdf_download_failed', { url, status: res.status })
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    writeFileSync(localPath, buf)
    return localPath
  } catch (e) {
    log.warn('pdf_download_error', { url, error: String(e) })
    return null
  }
}
```

- [ ] **Step 3: 매각물건명세서 파서 (TDD — 실패 테스트 먼저)**

`scraping-worker/auction/test/parsers/noticeParser.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseNoticeText } from '../../src/parsers/noticeParser.js'

describe('parseNoticeText', () => {
  it('말소기준권리: 가장 빠른 근저당의 날짜 추출', () => {
    const txt = `
1. 등기부 기재 권리
근저당권   김** 2024.03.15  100,000,000원
가압류     박** 2024.06.20   50,000,000원
근저당권   이** 2025.01.10   30,000,000원
`
    const r = parseNoticeText(txt)
    expect(r.baseRightType).toBe('근저당')
    expect(r.baseRightDate).toBe('2024-03-15')
  })

  it('대항력 임차인: 전입신고 + 확정일자가 말소기준 이전이면 true', () => {
    const txt = `
근저당권 2024.06.15 김** 100,000,000원

임차인 현황
임차인  보증금        전입일       확정일자
홍길동  120,000,000  2023.05.10   2023.05.10
`
    const r = parseNoticeText(txt)
    expect(r.hasSeniorTenant).toBe(true)
    expect(r.tenantCount).toBe(1)
    expect(r.totalDeposit).toBe(120_000_000)
  })

  it('대항력 임차인 없음: 전입일이 말소기준 이후', () => {
    const txt = `
근저당권 2020.06.15 김** 100,000,000원

임차인 현황
임차인  보증금        전입일       확정일자
홍길동  120,000,000  2024.05.10   2024.05.10
`
    const r = parseNoticeText(txt)
    expect(r.hasSeniorTenant).toBe(false)
  })

  it('임차인 정보 없음: tenantCount=0, hasSeniorTenant=false', () => {
    const txt = `근저당권 2024.06.15 100,000,000원\n임차인 없음`
    const r = parseNoticeText(txt)
    expect(r.tenantCount).toBe(0)
    expect(r.hasSeniorTenant).toBe(false)
  })

  it('파싱 불가시 parse_status=failed', () => {
    const r = parseNoticeText('')
    expect(r.parseStatus).toBe('failed')
  })
})
```

- [ ] **Step 4: 테스트 실패 확인**

```bash
cd scraping-worker/auction
npx vitest run test/parsers/noticeParser.test.ts
```

- [ ] **Step 5: 파서 구현**

`scraping-worker/auction/src/parsers/noticeParser.ts`:

```ts
export interface ParsedNotice {
  baseRightType: string | null
  baseRightDate: string | null  // ISO yyyy-mm-dd
  hasSeniorTenant: boolean
  tenantCount: number
  totalDeposit: number
  unsettledTaxes: number
  riskFlags: Record<string, boolean>
  parseStatus: 'ok' | 'partial' | 'failed'
}

const BASE_RIGHT_KEYWORDS = [
  { keyword: '근저당권', label: '근저당' },
  { keyword: '저당권',   label: '저당' },
  { keyword: '담보가등기', label: '담보가등기' },
  { keyword: '가압류',    label: '가압류' },
  { keyword: '경매개시결정', label: '경매개시결정' },
]

const DATE_RE = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/

export function parseNoticeText(text: string): ParsedNotice {
  if (!text || text.trim().length < 10) {
    return failResult()
  }

  // 1) 말소기준권리: 가장 빠른 날짜를 가진 매칭 키워드
  let baseRightType: string | null = null
  let baseRightDate: string | null = null

  for (const line of text.split('\n')) {
    for (const k of BASE_RIGHT_KEYWORDS) {
      if (line.includes(k.keyword)) {
        const m = line.match(DATE_RE)
        if (!m) continue
        const iso = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
        if (!baseRightDate || iso < baseRightDate) {
          baseRightDate = iso
          baseRightType = k.label
        }
      }
    }
  }

  // 2) 임차인 현황
  let tenantCount = 0
  let totalDeposit = 0
  let hasSeniorTenant = false

  // 임차인 블록 추출
  const tenantBlock = text.split(/임차인\s*현황|임차인\s*정보/i)[1] ?? ''
  if (tenantBlock && !text.includes('임차인 없음')) {
    const lines = tenantBlock.split('\n').filter(l => l.match(DATE_RE))
    for (const line of lines) {
      const dateMatch = line.match(DATE_RE)
      if (!dateMatch) continue
      const iso = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`
      const depositMatch = line.match(/([\d,]{6,})/)
      const deposit = depositMatch ? Number(depositMatch[1].replace(/,/g,'')) : 0
      tenantCount++
      totalDeposit += deposit
      if (baseRightDate && iso < baseRightDate) {
        hasSeniorTenant = true
      }
    }
  }

  const status: ParsedNotice['parseStatus'] = baseRightDate ? 'ok' : 'partial'

  return {
    baseRightType,
    baseRightDate,
    hasSeniorTenant,
    tenantCount,
    totalDeposit,
    unsettledTaxes: 0,
    riskFlags: {
      senior_tenant: hasSeniorTenant,
      no_base_right: !baseRightDate,
    },
    parseStatus: status,
  }
}

function failResult(): ParsedNotice {
  return {
    baseRightType: null,
    baseRightDate: null,
    hasSeniorTenant: false,
    tenantCount: 0,
    totalDeposit: 0,
    unsettledTaxes: 0,
    riskFlags: {},
    parseStatus: 'failed',
  }
}
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
npx vitest run test/parsers/noticeParser.test.ts
```

기대: 모든 테스트 통과.

- [ ] **Step 7: PDF → 텍스트 → 파서 결합 (rightsExtractor)**

`scraping-worker/auction/src/parsers/rightsExtractor.ts`:

```ts
import pdfParse from 'pdf-parse'
import { readFileSync } from 'node:fs'
import { parseNoticeText, type ParsedNotice } from './noticeParser.js'
import { log } from '../lib/logger.js'

export const PARSER_VERSION = 'v1'

export interface ExtractResult extends ParsedNotice {
  rawText: string | null
  parserVersion: string
}

export async function extractRightsFromPdf(pdfPath: string): Promise<ExtractResult> {
  try {
    const buf = readFileSync(pdfPath)
    const parsed = await pdfParse(buf)
    const text = parsed.text ?? ''
    const rights = parseNoticeText(text)
    return { ...rights, rawText: text, parserVersion: PARSER_VERSION }
  } catch (e) {
    log.warn('pdf_parse_failed', { pdfPath, error: String(e) })
    return {
      ...failResult(),
      rawText: null,
      parserVersion: PARSER_VERSION,
    }
  }
}

function failResult(): ParsedNotice {
  return {
    baseRightType: null,
    baseRightDate: null,
    hasSeniorTenant: false,
    tenantCount: 0,
    totalDeposit: 0,
    unsettledTaxes: 0,
    riskFlags: {},
    parseStatus: 'failed',
  }
}
```

- [ ] **Step 8: 빌드 + 테스트 일괄 실행**

```bash
npm run test
npm run build
```

- [ ] **Step 9: 커밋**

```bash
cd ../..
git add scraping-worker/auction/src/scrapers/courtAuctionDetailScraper.ts scraping-worker/auction/src/scrapers/pdfDownloader.ts scraping-worker/auction/src/parsers/ scraping-worker/auction/test/
git commit -m "feat(auction-worker): 상세 스크래퍼 + PDF 다운로더 + 권리분석 파서 (TDD)"
```


---

## Task 13: 워커 — 국토부 시세 매칭 (TDD)

국토부 실거래가 OpenAPI는 부동산 종류별로 5종 정도 (아파트/오피스텔/연립다세대/단독·다가구/상업업무용/토지). 본 Task는 아파트·오피스텔·연립다세대 3종에 집중하고 나머지는 후속.

**Files:**
- Create: `scraping-worker/auction/src/matchers/molitTradeClient.ts`
- Create: `scraping-worker/auction/src/matchers/marketPriceMatcher.ts`
- Create: `scraping-worker/auction/test/matchers/marketPriceMatcher.test.ts`

- [ ] **Step 1: 국토부 OpenAPI 클라이언트**

`scraping-worker/auction/src/matchers/molitTradeClient.ts`:

```ts
import 'dotenv/config'
import { log } from '../lib/logger.js'

const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) log.warn('DATA_GO_KR_API_KEY missing')

export interface MolitTrade {
  dealAmount: number       // 만원 단위 (API 응답)
  dealYear: number
  dealMonth: number
  dealDay: number
  apartmentName: string | null
  area: number             // ㎡
  jibun: string | null
  floor: number | null
}

const ENDPOINTS = {
  apt:       'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev',
  officetel: 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcOffiTrade',
  villa:     'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcRHTrade',
}

export type MolitKind = keyof typeof ENDPOINTS

export async function fetchTrades(kind: MolitKind, lawdCd: string, dealYearMonth: string): Promise<MolitTrade[]> {
  const url = `${ENDPOINTS[kind]}?serviceKey=${encodeURIComponent(KEY ?? '')}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYearMonth}&numOfRows=1000`
  const res = await fetch(url)
  if (!res.ok) {
    log.warn('molit_api_failed', { kind, lawdCd, dealYearMonth, status: res.status })
    return []
  }
  const xml = await res.text()
  return parseXmlTrades(xml)
}

function parseXmlTrades(xml: string): MolitTrade[] {
  const items: MolitTrade[] = []
  const itemBlocks = xml.split('<item>').slice(1)
  for (const block of itemBlocks) {
    const end = block.indexOf('</item>')
    if (end < 0) continue
    const body = block.slice(0, end)
    const get = (tag: string) => {
      const m = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
      return m ? m[1].trim() : null
    }
    const dealAmountStr = (get('거래금액') ?? get('dealAmount') ?? '').replace(/,/g, '')
    const yyyy = Number(get('년') ?? get('dealYear'))
    const mm   = Number(get('월') ?? get('dealMonth'))
    const dd   = Number(get('일') ?? get('dealDay'))
    const area = Number(get('전용면적') ?? get('excluUseAr'))
    if (!yyyy || !mm || !area) continue
    items.push({
      dealAmount: Number(dealAmountStr),
      dealYear: yyyy,
      dealMonth: mm,
      dealDay: dd,
      apartmentName: get('아파트') ?? get('연립다세대') ?? get('오피스텔'),
      area,
      jibun: get('지번'),
      floor: Number(get('층') ?? '0') || null,
    })
  }
  return items
}
```

- [ ] **Step 2: 매칭기 — 실패 테스트 먼저**

`scraping-worker/auction/test/matchers/marketPriceMatcher.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { matchMarketPrice } from '../../src/matchers/marketPriceMatcher.js'
import type { MolitTrade } from '../../src/matchers/molitTradeClient.js'

const trades: MolitTrade[] = [
  { dealAmount: 110000, dealYear: 2026, dealMonth: 4, dealDay: 10, apartmentName: '도곡렉슬', area: 84.5, jibun: '512', floor: 10 },
  { dealAmount: 108000, dealYear: 2026, dealMonth: 3, dealDay: 5,  apartmentName: '도곡렉슬', area: 84.5, jibun: '512', floor: 11 },
  { dealAmount: 105000, dealYear: 2026, dealMonth: 2, dealDay: 1,  apartmentName: '도곡렉슬', area: 84.5, jibun: '512', floor: 12 },
]

describe('matchMarketPrice', () => {
  it('단지명 + 면적이 일치하는 거래만 사용한다', () => {
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 84.5 }, trades, '2026-05-09')
    expect(r.median_price_3m).toBe(108_000 * 10_000) // 만원→원
    expect(r.trade_count_3m).toBe(3)
    expect(r.match_confidence).toBe('high')
  })

  it('거래수가 1~2건이면 mid', () => {
    const t = [trades[0]]
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 84.5 }, t, '2026-05-09')
    expect(r.match_confidence).toBe('mid')
  })

  it('거래수가 0이면 12개월로 fallback (있으면)', () => {
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 84.5 }, [], '2026-05-09')
    expect(r.median_price_3m).toBeNull()
    expect(r.median_price_12m).toBeNull()
    expect(r.match_confidence).toBe('low')
  })

  it('단지명 매칭 안되면 모두 null', () => {
    const r = matchMarketPrice({ complexName: '없는단지', areaM2: 84.5 }, trades, '2026-05-09')
    expect(r.median_price_3m).toBeNull()
    expect(r.matched_complex).toBeNull()
  })

  it('면적 ±5% 이내 매칭 허용', () => {
    const r = matchMarketPrice({ complexName: '도곡렉슬', areaM2: 86.0 }, trades, '2026-05-09')
    expect(r.trade_count_3m).toBe(3)
  })
})
```

- [ ] **Step 3: 테스트 실패 확인**

```bash
cd scraping-worker/auction
npx vitest run test/matchers/marketPriceMatcher.test.ts
```

- [ ] **Step 4: 매칭기 구현**

`scraping-worker/auction/src/matchers/marketPriceMatcher.ts`:

```ts
import type { MolitTrade } from './molitTradeClient.js'

export interface MatchInput {
  complexName: string | null
  areaM2: number | null
}

export interface MatchResult {
  matched_complex: string | null
  median_price_3m: number | null
  trade_count_3m: number
  median_price_12m: number | null
  last_trade_date: string | null
  match_confidence: 'high' | 'mid' | 'low'
}

export function matchMarketPrice(
  input: MatchInput,
  trades: MolitTrade[],
  todayISO: string
): MatchResult {
  if (!input.complexName || !input.areaM2 || trades.length === 0) {
    return emptyResult()
  }

  const today = new Date(todayISO)
  const cutoff3m = new Date(today); cutoff3m.setMonth(cutoff3m.getMonth() - 3)
  const cutoff12m = new Date(today); cutoff12m.setMonth(cutoff12m.getMonth() - 12)

  const sameComplex = trades.filter(t =>
    t.apartmentName && normalize(t.apartmentName) === normalize(input.complexName!)
  )
  if (sameComplex.length === 0) return emptyResult()

  const matchedComplex = sameComplex[0].apartmentName

  const sameArea = sameComplex.filter(t => Math.abs(t.area - input.areaM2!) / input.areaM2! <= 0.05)
  if (sameArea.length === 0) return { ...emptyResult(), matched_complex: matchedComplex }

  const within3m = sameArea.filter(t => tradeDate(t) >= cutoff3m)
  const within12m = sameArea.filter(t => tradeDate(t) >= cutoff12m)

  const median3m = median(within3m.map(t => t.dealAmount * 10_000))
  const median12m = median(within12m.map(t => t.dealAmount * 10_000))

  const sortedDesc = [...sameArea].sort((a, b) => tradeDate(b).getTime() - tradeDate(a).getTime())
  const lastTrade = sortedDesc[0] ? toIso(tradeDate(sortedDesc[0])) : null

  let confidence: MatchResult['match_confidence'] = 'low'
  if (within3m.length >= 3) confidence = 'high'
  else if (within3m.length >= 1) confidence = 'mid'

  return {
    matched_complex: matchedComplex,
    median_price_3m: within3m.length > 0 ? median3m : null,
    trade_count_3m: within3m.length,
    median_price_12m: within12m.length > 0 ? median12m : null,
    last_trade_date: lastTrade,
    match_confidence: confidence,
  }
}

function emptyResult(): MatchResult {
  return {
    matched_complex: null,
    median_price_3m: null,
    trade_count_3m: 0,
    median_price_12m: null,
    last_trade_date: null,
    match_confidence: 'low',
  }
}

function normalize(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase()
}

function tradeDate(t: MolitTrade): Date {
  return new Date(t.dealYear, t.dealMonth - 1, t.dealDay || 1)
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
npx vitest run test/matchers/marketPriceMatcher.test.ts
```

기대: 모든 테스트 통과.

- [ ] **Step 6: 빌드**

```bash
npm run build
```

- [ ] **Step 7: 커밋**

```bash
cd ../..
git add scraping-worker/auction/src/matchers/ scraping-worker/auction/test/matchers/
git commit -m "feat(auction-worker): 국토부 OpenAPI 클라이언트 + 시세 매칭기 (TDD)"
```


---

## Task 14: 워커 — dailyScrape 메인 + 알림 cron

**Files:**
- Create: `scraping-worker/auction/src/jobs/dailyScrape.ts`
- Create: `scraping-worker/auction/src/jobs/ddayAlerts.ts`
- Create: `scraping-worker/auction/src/jobs/filterMatchAlerts.ts`
- Create: `scraping-worker/auction/scripts/install-cron.sh`

- [ ] **Step 1: dailyScrape.ts (메인 진입점)**

`scraping-worker/auction/src/jobs/dailyScrape.ts`:

```ts
import 'dotenv/config'
import { scrapeAllLists } from '../scrapers/courtAuctionListScraper.js'
import { scrapeDetails } from '../scrapers/courtAuctionDetailScraper.js'
import { downloadPdf } from '../scrapers/pdfDownloader.js'
import { extractRightsFromPdf } from '../parsers/rightsExtractor.js'
import { fetchTrades, type MolitKind } from '../matchers/molitTradeClient.js'
import { matchMarketPrice } from '../matchers/marketPriceMatcher.js'
import { supabase } from '../lib/supabase.js'
import { log } from '../lib/logger.js'
import { runDdayAlerts } from './ddayAlerts.js'
import { runFilterMatchAlerts } from './filterMatchAlerts.js'

const KIND_MAP: Record<string, MolitKind | null> = {
  apt: 'apt', officetel: 'officetel', villa: 'villa',
  house: null, commercial: null, land: null, factory: null, forest: null, other: null,
}

async function main() {
  const startedAt = new Date()
  log.info('daily_scrape_start', { startedAt: startedAt.toISOString() })

  // 1. 목록 수집
  const listItems = await scrapeAllLists()
  if (listItems.length === 0) {
    log.error('daily_scrape_zero_items')
    await notifyOps('경매 데이터 0건 — 사이트 차단/구조변경 의심')
    process.exit(1)
  }

  // 2. 상세 수집 (신규/변경된 것만 우선; MVP에서는 전부)
  const details = await scrapeDetails(listItems)

  // 3. upsert
  for (const d of details) {
    const discount = (d.appraisalPrice - d.minBidPrice) / d.appraisalPrice * 100
    const { data: itemRow, error } = await supabase
      .from('auction_items')
      .upsert({
        case_number: d.caseNumber,
        item_number: d.itemNumber,
        court_name: d.courtName,
        court_code: d.courtCode || '00',
        property_type: d.propertyType,
        address_road: d.addressRoad,
        address_jibun: d.addressJibun,
        sido: d.sido,
        sigungu: d.sigungu,
        eupmyeondong: d.eupmyeondong,
        pnu: d.pnu,
        land_area_m2: d.landAreaM2,
        building_area_m2: d.buildingAreaM2,
        floor: d.floor,
        total_floors: d.totalFloors,
        building_year: d.buildingYear,
        appraisal_price: d.appraisalPrice,
        min_bid_price: d.minBidPrice,
        bid_deposit: d.bidDeposit,
        failure_count: d.failureCount,
        discount_rate: Math.round(discount * 100) / 100,
        next_auction_date: d.nextAuctionDate,
        status: d.status,
        sold_price: d.soldPrice,
        sold_at: d.soldAt,
        source_url: d.sourceUrl,
        notice_pdf_url: d.noticePdfUrl,
        appraisal_pdf_url: d.appraisalPdfUrl,
        photos: d.photos,
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'court_code,case_number,item_number' })
      .select('id')
      .single()
    if (error || !itemRow) { log.warn('upsert_failed', { caseNumber: d.caseNumber, error: error?.message }); continue }
    const itemId = itemRow.id

    // 4. PDF + 권리분석
    if (d.noticePdfUrl) {
      const pdfPath = await downloadPdf(d.noticePdfUrl, `${d.courtCode || '00'}-${d.caseNumber}-${d.itemNumber}-notice`)
      if (pdfPath) {
        const rights = await extractRightsFromPdf(pdfPath)
        await supabase.from('auction_rights_analysis').upsert({
          item_id: itemId,
          base_right_type: rights.baseRightType,
          base_right_date: rights.baseRightDate,
          has_senior_tenant: rights.hasSeniorTenant,
          tenant_count: rights.tenantCount,
          total_deposit: rights.totalDeposit,
          unsettled_taxes: rights.unsettledTaxes,
          risk_flags: rights.riskFlags,
          parser_version: rights.parserVersion,
          parse_status: rights.parseStatus,
          raw_text: rights.rawText,
          parsed_at: new Date().toISOString(),
        }, { onConflict: 'item_id' })
      }
    }

    // 5. 시세 매칭 (지원 종류만)
    const kind = KIND_MAP[d.propertyType]
    if (kind && d.sigungu && d.buildingAreaM2) {
      const lawdCd = await resolveLawdCd(d.sido, d.sigungu)
      if (lawdCd) {
        const ym1 = ymOffset(0)
        const ym2 = ymOffset(-1)
        const ym3 = ymOffset(-2)
        const trades = [
          ...await fetchTrades(kind, lawdCd, ym1),
          ...await fetchTrades(kind, lawdCd, ym2),
          ...await fetchTrades(kind, lawdCd, ym3),
        ]
        const result = matchMarketPrice(
          { complexName: d.addressJibun?.split(' ').slice(-1)[0] ?? null, areaM2: d.buildingAreaM2 },
          trades,
          new Date().toISOString().slice(0, 10)
        )
        await supabase.from('auction_market_prices').upsert({
          item_id: itemId,
          source: `molit_${kind}_trade`,
          matched_complex: result.matched_complex,
          median_price_3m: result.median_price_3m,
          trade_count_3m: result.trade_count_3m,
          median_price_12m: result.median_price_12m,
          last_trade_date: result.last_trade_date,
          match_confidence: result.match_confidence,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'item_id,source' })
      }
    }
  }

  // 6. 알림 cron 일괄 실행
  await runDdayAlerts()
  await runFilterMatchAlerts()

  const elapsed = Date.now() - startedAt.getTime()
  log.info('daily_scrape_done', { elapsedMs: elapsed, itemsProcessed: details.length })
}

function ymOffset(months: number): string {
  const d = new Date(); d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 시군구 → LAWD_CD (5자리) 매핑 — 별도 테이블 또는 정적 맵 필요
async function resolveLawdCd(_sido: string | null, _sigungu: string | null): Promise<string | null> {
  // MVP: 미구현 — 정적 매핑 테이블 추후 추가. 미구현 시 시세 매칭 스킵.
  return null
}

async function notifyOps(message: string) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return
  await fetch(url, { method: 'POST', body: JSON.stringify({ text: `[auction-worker] ${message}` }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
}

main().catch(e => {
  log.error('daily_scrape_uncaught', { error: String(e) })
  notifyOps(`치명적 오류: ${e}`)
  process.exit(1)
})
```

> **NOTE:** `resolveLawdCd`는 시세 매칭의 핵심이지만 MVP에서는 미구현 placeholder로 둔다. 후속 작업에서 정적 매핑 테이블(예: `data/lawd_cd_map.json`) 또는 행정안전부 OpenAPI 추가 필요. MVP에서는 시세 매칭 데이터 0건이지만 다른 모든 기능은 정상 작동한다.

- [ ] **Step 2: D-3 알림 job**

`scraping-worker/auction/src/jobs/ddayAlerts.ts`:

```ts
import { supabase } from '../lib/supabase.js'
import { log } from '../lib/logger.js'

export async function runDdayAlerts() {
  const today = new Date()
  const target = new Date(today); target.setDate(today.getDate() + 3)
  const todayStr = today.toISOString().slice(0, 10)
  const targetStr = target.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('auction_user_favorites')
    .select('user_id, item_id, item:auction_items(case_number, sido, sigungu, eupmyeondong, next_auction_date)')
    .eq('alert_enabled', true)
    .gte('item.next_auction_date', todayStr)
    .lte('item.next_auction_date', targetStr)
  if (error) { log.error('dday_alert_query_failed', { error: error.message }); return }

  let count = 0
  for (const r of data ?? []) {
    const item = Array.isArray(r.item) ? r.item[0] : r.item
    if (!item) continue
    await supabase.from('notifications').insert({
      user_id: r.user_id,
      type: 'auction_dday_3',
      title: `매각기일 임박: ${item.case_number}`,
      body: `${item.sido} ${item.sigungu} ${item.eupmyeondong} — ${item.next_auction_date} 매각기일`,
      url: `/investment/auction/${r.item_id}`,
    })
    count++
  }
  log.info('dday_alerts_sent', { count })
}
```

- [ ] **Step 3: 필터 매칭 알림 job**

`scraping-worker/auction/src/jobs/filterMatchAlerts.ts`:

```ts
import { supabase } from '../lib/supabase.js'
import { log } from '../lib/logger.js'

interface FilterRow {
  id: string
  user_id: string
  name: string
  filter_json: Record<string, any>
}

export async function runFilterMatchAlerts() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const sinceStr = today.toISOString()

  const { data: filters } = await supabase
    .from('auction_user_filters')
    .select('id, user_id, name, filter_json')
    .eq('alert_enabled', true)
  if (!filters) return

  let totalCount = 0
  for (const f of filters as FilterRow[]) {
    let q = supabase.from('auction_items').select('id, case_number', { count: 'exact', head: false }).gte('first_seen_at', sinceStr)
    const j = f.filter_json
    if (j.sido)            q = q.eq('sido', j.sido)
    if (j.propertyType)    q = q.eq('property_type', j.propertyType)
    if (j.minDiscountPct)  q = q.gte('discount_rate', j.minDiscountPct)
    if (j.minFailureCount) q = q.gte('failure_count', j.minFailureCount)

    const { data, count } = await q.limit(20)
    if (!count || count === 0) continue

    await supabase.from('notifications').insert({
      user_id: f.user_id,
      type: 'auction_filter_match',
      title: `'${f.name}' 필터에 신규 ${count}건`,
      body: `${(data ?? []).map(d => d.case_number).slice(0, 3).join(', ')}${count > 3 ? ' 외' : ''}`,
      url: `/investment/auction`,
    })
    totalCount += count
  }
  log.info('filter_match_alerts_sent', { count: totalCount })
}
```

- [ ] **Step 4: cron 설치 스크립트 (Mac mini M4)**

`scraping-worker/auction/scripts/install-cron.sh`:

```bash
#!/usr/bin/env bash
# Mac mini M4에서 매일 새벽 03:00 KST 실행

set -e
WORKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_DIR="${WORKER_DIR}/logs"
mkdir -p "${LOG_DIR}"

CRON_LINE="0 3 * * * cd ${WORKER_DIR} && /usr/local/bin/node dist/jobs/dailyScrape.js >> ${LOG_DIR}/cron.log 2>&1"

# 기존 cron에서 동일 라인 제거 후 추가
( crontab -l 2>/dev/null | grep -v 'dailyScrape.js' ; echo "${CRON_LINE}" ) | crontab -

echo "Installed cron:"
crontab -l | grep dailyScrape
```

```bash
chmod +x scraping-worker/auction/scripts/install-cron.sh
```

- [ ] **Step 5: 빌드 + 단위 테스트 일괄**

```bash
cd scraping-worker/auction
npm run build
npm run test
```

기대: 모든 테스트 통과, dist 빌드 성공.

- [ ] **Step 6: 통합 검증 (소규모, 한 카테고리만)**

`scraping-worker/auction/.env`에 실제 키 채우고:

```bash
# 한 카테고리만 테스트하기 위해 임시로 SIDO_LIST/PROPERTY_CODE_MAP를 1건씩으로 줄여서
SCRAPE_MAX_LIST_PAGES=2 npx tsx src/jobs/dailyScrape.ts
```

기대 로그 라인:
- `list_category_done` 1건 이상
- `detail_scrape_total` 1건 이상
- `daily_scrape_done` (elapsedMs 기록)

문제 발생 시:
- 0건 수집 → 셀렉터 점검 (Task 11 NOTE 참조)
- 권한 오류 → SUPABASE_SERVICE_ROLE_KEY 확인
- 차단 응답 → User-Agent / throttle 늘림

- [ ] **Step 7: cron 등록 (실제 운영 머신에서만)**

```bash
./scripts/install-cron.sh
```

- [ ] **Step 8: 커밋**

```bash
cd ../..
git add scraping-worker/auction/src/jobs/ scraping-worker/auction/scripts/
git commit -m "feat(auction-worker): dailyScrape 메인 + D-3/필터 매칭 알림 + cron 스크립트"
```


---

## Task 15: 통합 검증 + develop 푸시 + main 머지

전체 작업이 끝난 후 골든패스를 마지막으로 검증하고 develop → main 머지까지 완료한다.

**Files:** (변경 없음, 검증 + git 작업만)

- [ ] **Step 1: 전체 빌드**

```bash
npm run build
```

기대: 컴파일/타입 에러 없음.

- [ ] **Step 2: 권한 체크**

```bash
npm run check:permissions
```

기대: 통과 (실패 시 누락된 권한 키 보충).

- [ ] **Step 3: 단위 테스트 (앱 + 워커)**

```bash
npx vitest run src/lib/auction/roiCalculator.test.ts
cd scraping-worker/auction && npm run test && cd ../..
```

기대: 모든 테스트 통과.

- [ ] **Step 4: 더미 데이터 정리 (선택)**

검증용 더미 데이터 제거:

```sql
-- mcp__supabase__execute_sql
DELETE FROM auction_items WHERE case_number IN ('2026타경00001','2026타경00002','2026타경00003');
```

(실제 워커가 운영 데이터를 적재했다면 스킵.)

- [ ] **Step 5: 골든패스 E2E 수동 시나리오**

dev 서버 실행:

```bash
npm run dev
```

브라우저에서:
1. 테스트 계정(`whitedc0902@gmail.com` / `ghkdgmltn81!`)으로 로그인
2. `/dashboard` → 사이드바 "주식 자동 매매" → 투자 카테고리 진입
3. 사이드바 "부동산 경매" 클릭 → `/investment/auction` 진입
4. 필터: 지역 "서울특별시" + 용도 "아파트" + 최소 할인율 30%
5. 첫 번째 카드 클릭 → 상세 진입
6. "개요" 탭 — 시세 비교/물건 정보 확인
7. "시뮬레이터" 탭 — 응찰가 슬라이더 조작 → 결과 실시간 갱신 확인
8. 시뮬레이터에서 "관심물건에 저장" 클릭 → alert 확인
9. "권리분석" 탭 — 자동 추출 정보 확인 → "AI 분석 실행" 클릭 → 응답 확인 (10~20초) → 다시 클릭 → "캐시" 라벨 확인
10. "이력·통계" 탭 — 회차 차트 + 동일 단지 통계 확인
11. "첨부" 탭 — PDF 외부 링크 클릭 가능 확인
12. 뒤로 → 목록 우상단 "⭐ 관심물건" 클릭 → favorites 페이지 → 저장한 카드 노출 확인
13. 콘솔에 에러 없음 확인 (개발자 도구 Console 탭)

체크 통과 시 다음 단계.

- [ ] **Step 6: develop 푸시**

```bash
git status
git diff --stat HEAD~5..HEAD
git log --oneline -10
```

```bash
git push origin develop
```

푸시 실패 시 (rebase 필요):

```bash
git pull --rebase origin develop && git push origin develop
```

- [ ] **Step 7: main으로 PR 생성 및 머지**

```bash
gh pr create --base main --head develop --title "feat(auction): 부동산 경매 투자 분석 도구 (MVP)" --body "$(cat <<'EOF'
## Summary
- 투자 카테고리에 부동산 경매 메뉴 추가
- 전국 법원경매 물건의 ROI 3단계 다층 모델(객관/시세/임대 시뮬) 표시
- AI 권리분석 코멘트 (Claude Haiku 4.5 + 24h 캐시)
- Mac mini M4 워커가 매일 새벽 courtauction.go.kr 스크래핑 + 국토부 OpenAPI로 시세 매칭
- 관심물건 저장 + D-3 알림 + 저장된 필터 매칭 알림

## Test plan
- [x] npm run build 성공
- [x] npm run check:permissions 통과
- [x] roiCalculator 단위 테스트 통과
- [x] noticeParser, marketPriceMatcher 단위 테스트 통과
- [x] 골든패스 수동 시나리오 통과 (목록 → 상세 5탭 → AI 분석 → 관심물건)

## Spec / Plan
- Spec: docs/superpowers/specs/2026-05-09-real-estate-auction-design.md
- Plan: docs/superpowers/plans/2026-05-09-real-estate-auction.md
EOF
)"
```

```bash
# PR 머지 (squash 권장, 기존 워크플로우 따름)
PR_NUMBER=$(gh pr list --head develop --base main --json number --jq '.[0].number')
gh pr merge $PR_NUMBER --merge --delete-branch=false
```

- [ ] **Step 8: WORK_LOG.md 업데이트**

`.claude/WORK_LOG.md` 상단에 추가:

```markdown
## 2026-05-09 [기능 개발] 부동산 경매 투자 분석 도구 (MVP)

**키워드:** #investment #auction #real-estate #ai-analysis #scraping-worker

### 📋 작업 내용
- 투자 카테고리에 `/investment/auction` 추가 (목록/상세/관심물건)
- ROI 3단계 다층 모델: 1차(객관) / 2차(시세) / 3차(임대 시뮬)
- AI 권리분석 코멘트 — Claude Haiku 4.5 + 24h 캐시 + 사용자당 일 50회 한도
- Mac mini M4 워커: 매일 03:00 KST courtauction.go.kr 스크래핑 + 국토부 OpenAPI 시세 매칭
- 관심물건 D-3 알림, 저장된 필터 신규 매칭 알림

### ✅ 검증
- 빌드 / 권한 체크 / 단위 테스트 통과
- 골든패스 수동 시나리오 통과
- develop → main 머지 완료
```

```bash
git add .claude/WORK_LOG.md
git commit -m "docs(work-log): 부동산 경매 MVP 완료 기록"
git push origin develop
```

- [ ] **Step 9: 후속 모니터링 (3일)**

매일 다음 확인:
- Mac mini M4 cron 실행 여부 (`logs/cron.log`)
- `daily_scrape_done` 로그 라인 + `itemsProcessed` 수치 확인
- `auction_items.first_seen_at >= today` 가 100건 이상 추가되는지 (`SELECT COUNT(*) FROM auction_items WHERE first_seen_at::date = CURRENT_DATE`)
- 차단/오류 로그 없는지

문제 발생 시 셀렉터/throttle/UA 조정 → 다음 새벽까지 수정 → 재실행.

---

## Self-Review

### Spec coverage 체크

| Spec 섹션 | 매칭 Task |
|---|---|
| §3 아키텍처 (Mac mini 워커 + Vercel 앱 분리) | Task 10, 14 |
| §4-1~7 데이터 모델 (테이블 7개) | Task 1 |
| §4-8 알림 CHECK 확장 | Task 1 |
| §5 ROI 1차 객관 | Task 3 (calculatePrimary 테스트) |
| §5 ROI 2차 시세 | Task 3 (calculateSecondary), Task 13 (시세 매칭) |
| §5 ROI 3차 임대 시뮬 | Task 3 (calculateTertiary), Task 6 (UI) |
| §5 AI 권리분석 코멘트 | Task 7 |
| §6-1 사이드바 메뉴 | Task 2 |
| §6-2 라우트 3개 | Task 4, 5, 9 |
| §6-3 목록 페이지 | Task 4 |
| §6-4 상세 5탭 | Task 5, 6, 7, 8 |
| §6-5 관심물건 페이지 | Task 9 |
| §7-1 권한 등록 | Task 2 |
| §7-2 알림 통합 | Task 1, 14 |
| §7-3 외부 의존성 | Task 7 (Anthropic), Task 13 (국토부), Task 14 (Slack) |
| §8 워커 구성 | Task 10~14 |
| §9 AI 호출 정책 | Task 7 |
| §10 Phase 1 마일스톤 | Task 흐름 1~15에 매핑 |
| §12 골든 패스 | Task 15 Step 5 |

### 미해결/주의 사항

- **`resolveLawdCd` placeholder (Task 14)**: MVP에서는 시세 매칭이 0건일 수 있음 → 후속 작업으로 행정안전부 OpenAPI 매핑 추가 필요. 골든패스에서 시세 비교가 비어 보이면 정상.
- **AI 일일 한도 카운트의 정확도 (Task 7)**: 현재 구현은 사용자별 카운트가 부정확 (auction_user_favorites 조인). 정확한 카운트가 필요하면 별도 `auction_ai_usage` 테이블 추가 권장. MVP는 비용 가드만 보장.
- **courtauction.go.kr 셀렉터 (Task 11)**: 일반적 패턴으로 작성됨. 첫 실행 시 0건 수집 발생 가능 — 이는 코드 버그가 아닌 사이트별 DOM 차이이므로 dryListRun으로 진단 후 셀렉터 수정.
- **PDF 파싱 정확도**: 정규식 룰만으로는 명세서 다양한 양식을 다 못 잡음. parse_status='partial' 케이스가 다수일 수 있고, 그 경우 AI 분석으로 보완하도록 설계됨 (Task 7).
- **테스트 데이터 더미**: Task 4·5·7·8 검증 단계에서 INSERT한 더미는 Task 15 Step 4에서 정리.

