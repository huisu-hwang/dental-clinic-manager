-- ============================================
-- regime_runs.signals + reservoir_predictions 컬럼 추가
-- Created: 2026-05-19
--
-- Part 1 (판단 근거 시각화) + Part 2 (모델 용도 분리) 지원
--   signals: ret_20d, vol_60d, vix, vol_median, thresholds, matched_rule, rules[]
--   reservoir_predictions: Reservoir Hypernet N-step ahead label 분포 (5d/10d/30d)
-- ============================================

ALTER TABLE regime_runs ADD COLUMN IF NOT EXISTS signals JSONB;
ALTER TABLE regime_runs ADD COLUMN IF NOT EXISTS reservoir_predictions JSONB;

COMMENT ON COLUMN regime_runs.signals IS '국면 판단 근거 (ret_20d, vol_60d, vix, vol_median, 임계값, 매칭된 규칙)';
COMMENT ON COLUMN regime_runs.reservoir_predictions IS 'Reservoir Hypernet N-step ahead 예측 (5d/10d/30d, label-wise 확률)';
