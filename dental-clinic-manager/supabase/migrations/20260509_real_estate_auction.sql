-- 부동산 경매 투자 분석 기능 — 테이블 7개
-- Spec: docs/superpowers/specs/2026-05-09-real-estate-auction-design.md
-- Plan: docs/superpowers/plans/2026-05-09-real-estate-auction.md (Task 1)
--
-- NOTE: notifications.type CHECK 제약 확장은 spec에 있었으나 기존 DB에 CHECK 제약이 없어
--       (제약 추가가 기존 INSERT 깨질 위험) 이번 마이그레이션에서는 제외. 신규 type 값
--       (auction_dday_3 / auction_filter_match / auction_status_change)은 코드 레벨에서만 사용.

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
