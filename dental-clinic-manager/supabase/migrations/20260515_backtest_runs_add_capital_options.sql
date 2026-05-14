-- ============================================
-- backtest_runs 에 자본 사용 옵션 컬럼 추가
--
-- 배경: 검증 스크립트(verifyBacktests.mjs) 가 저장된 백테스트를 재실행할 때
-- useFullCapital / maxPositionSizePercent 값을 알 수 없어 5배 차이가 발생.
-- 본 마이그레이션 이후 백테스트는 이 옵션을 row 에 함께 저장하여 100% 재현 가능.
--
-- legacy row (NULL) 는 종전 UI 의 기본 동작 (useFullCapital=true) 으로 추정.
-- ============================================

ALTER TABLE backtest_runs
  ADD COLUMN IF NOT EXISTS use_full_capital BOOLEAN,
  ADD COLUMN IF NOT EXISTS max_position_size_percent NUMERIC;

COMMENT ON COLUMN backtest_runs.use_full_capital IS
  'true 면 매수 시 가용 cash 100% 사용. false 면 maxPositionSizePercent 적용. NULL 은 legacy row (이전 default=true 로 추정).';

COMMENT ON COLUMN backtest_runs.max_position_size_percent IS
  'use_full_capital=false 일 때 단일 포지션의 cash 사용 비율 (%). 기본 20%.';
