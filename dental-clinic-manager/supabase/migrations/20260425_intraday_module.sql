-- supabase/migrations/20260425_intraday_module.sql
-- 단타(Day Trading) 모듈 - 분봉 데이터 캐시 + 전략 mode 컬럼
-- ============================================
-- 적용 대상:
-- 1) intraday_price_cache 테이블 신설 (1m/5m/15m 분봉 OHLCV 캐시)
-- 2) investment_strategies.mode 컬럼 추가 ('swing' | 'daytrading')
-- 3) RLS: 인증 사용자 read, service_role write
-- ============================================

-- ============================================
-- 1) 분봉 캐시 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS intraday_price_cache (
  ticker TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR', 'US')),
  timeframe TEXT NOT NULL CHECK (timeframe IN ('1m', '5m', '15m')),
  datetime TIMESTAMPTZ NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, market, timeframe, datetime)
);

COMMENT ON TABLE intraday_price_cache IS '분봉(1m/5m/15m) OHLCV 캐시 - yahoo-finance2/KIS API 응답 저장';
COMMENT ON COLUMN intraday_price_cache.datetime IS 'TIMESTAMPTZ - 봉 시작 시각 (UTC 저장, 사용 시 Asia/Seoul 또는 America/New_York 변환 필요)';
COMMENT ON COLUMN intraday_price_cache.cached_at IS '캐시 저장 시각 - TTL 정리 기준';

-- 조회 인덱스 (ticker + market + timeframe 범위 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_intraday_lookup
  ON intraday_price_cache (ticker, market, timeframe, datetime DESC);

-- TTL 정리용 인덱스 (cron으로 30일 전 데이터 삭제)
CREATE INDEX IF NOT EXISTS idx_intraday_cached_at
  ON intraday_price_cache (cached_at);

-- ============================================
-- 2) 분봉 캐시 RLS
-- ============================================
ALTER TABLE intraday_price_cache ENABLE ROW LEVEL SECURITY;

-- 인증된 사용자는 read 가능 (개인 데이터 아님 — 시장 전체 공유 캐시)
DROP POLICY IF EXISTS "intraday_cache_read_authenticated" ON intraday_price_cache;
CREATE POLICY "intraday_cache_read_authenticated"
  ON intraday_price_cache FOR SELECT
  TO authenticated
  USING (true);

-- 익명도 read 허용 (캐시는 공개 데이터, 백테스트 등에서 사용 가능)
DROP POLICY IF EXISTS "intraday_cache_read_anon" ON intraday_price_cache;
CREATE POLICY "intraday_cache_read_anon"
  ON intraday_price_cache FOR SELECT
  TO anon
  USING (true);

-- 쓰기는 service_role만 (서버 측 fetcher만 캐시에 저장)
DROP POLICY IF EXISTS "intraday_cache_insert_service_role" ON intraday_price_cache;
CREATE POLICY "intraday_cache_insert_service_role"
  ON intraday_price_cache FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "intraday_cache_update_service_role" ON intraday_price_cache;
CREATE POLICY "intraday_cache_update_service_role"
  ON intraday_price_cache FOR UPDATE
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "intraday_cache_delete_service_role" ON intraday_price_cache;
CREATE POLICY "intraday_cache_delete_service_role"
  ON intraday_price_cache FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================
-- 3) investment_strategies.mode 컬럼 추가
-- ============================================
ALTER TABLE investment_strategies
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'swing'
  CHECK (mode IN ('swing', 'daytrading'));

CREATE INDEX IF NOT EXISTS idx_strategies_mode
  ON investment_strategies (mode);

COMMENT ON COLUMN investment_strategies.mode IS '전략 모드: swing(일봉, 기존) | daytrading(분봉, 신규)';

-- ============================================
-- 마이그레이션 완료
-- ============================================
