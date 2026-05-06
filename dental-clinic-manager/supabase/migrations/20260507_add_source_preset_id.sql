-- ============================================
-- 사용자 전략에 원본 프리셋 ID 추가
-- 프리셋에서 만든 사용자 전략의 백테스트 통계를 프리셋 통계와 합산하기 위함
-- ============================================

ALTER TABLE investment_strategies
  ADD COLUMN IF NOT EXISTS source_preset_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_investment_strategies_source_preset_id
  ON investment_strategies (source_preset_id) WHERE source_preset_id IS NOT NULL;

COMMENT ON COLUMN investment_strategies.source_preset_id IS
  '프리셋 기반으로 생성된 사용자 전략의 원본 프리셋 ID. 통계 집계 시 같은 그룹으로 묶기 위함.';
