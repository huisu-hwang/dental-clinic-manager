-- ============================================
-- intraday_price_cache: timeframe '1d' 허용
-- RL 일봉 재교형(dailyRebalanceJob.fetchOhlcvWindow)에서 일봉을 동일 캐시에서 읽기 위함.
-- 기존 분봉(1m/5m/15m) 데이터는 그대로 보존.
-- ============================================
ALTER TABLE intraday_price_cache DROP CONSTRAINT IF EXISTS intraday_price_cache_timeframe_check;
ALTER TABLE intraday_price_cache ADD CONSTRAINT intraday_price_cache_timeframe_check
  CHECK (timeframe = ANY (ARRAY['1m'::text, '5m'::text, '15m'::text, '1d'::text]));
