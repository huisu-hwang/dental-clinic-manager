-- 부동산 경매 목록 조회 성능 인덱스
--
-- 문제: auction_items 가 30,000+ 행으로 늘면서 WHERE status='active' + ORDER BY 가
-- PostgREST 의 statement timeout(8s)을 초과해 목록 API 가 timeout.
--
-- 해결: status='active' 부분 인덱스 4종 — 각 정렬 컬럼별. status 가 active 행이
-- 대다수라 일반 인덱스도 충분하지만, "활성 매물" 쿼리에 한정해 인덱스 크기를 줄임.

CREATE INDEX IF NOT EXISTS idx_auction_items_active_discount
  ON auction_items (discount_rate DESC NULLS LAST)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_auction_items_active_dday
  ON auction_items (next_auction_date ASC NULLS LAST)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_auction_items_active_min_bid
  ON auction_items (min_bid_price ASC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_auction_items_active_failure
  ON auction_items (failure_count DESC)
  WHERE status = 'active';

-- 필터링 자주 사용되는 sido + 정렬 결합
CREATE INDEX IF NOT EXISTS idx_auction_items_active_sido_discount
  ON auction_items (sido, discount_rate DESC NULLS LAST)
  WHERE status = 'active';

ANALYZE auction_items;
