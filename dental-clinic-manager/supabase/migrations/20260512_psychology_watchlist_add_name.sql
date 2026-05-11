-- psychology_watchlist 에 종목명(name) 컬럼 추가
-- 기존 한국 종목은 ticker(6자리 숫자)만 저장되어 사용자가 어떤 종목인지 알아보기 어려움.
-- 신규 등록 시 클라이언트에서 name 전달, 기존 데이터는 GET API 에서 KR_TICKER_DICT lazy backfill.
ALTER TABLE psychology_watchlist
  ADD COLUMN IF NOT EXISTS name TEXT NULL;
