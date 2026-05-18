-- ============================================
-- regime_history.close 컬럼 추가
-- Created: 2026-05-19
--
-- 국면 타임라인 차트에 실제 가격(종가) 라인을 함께 표시하기 위해
-- train_worker 가 학습 시 마지막 5년치 종가를 함께 upsert
-- ============================================

ALTER TABLE regime_history ADD COLUMN IF NOT EXISTS close NUMERIC;

COMMENT ON COLUMN regime_history.close IS '해당 일자 종가 (가격 라인 시각화용)';
