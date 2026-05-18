-- ============================================
-- regime_runs.kernel_predictions JSONB 컬럼 추가
-- Created: 2026-05-19
--
-- Kernel Markov (RHINE 적응) 모델이 학습한 비선형 임베딩 공간에서의
-- N-step 전이행렬 (5d/10d/30d) 결과 저장. 기존 HMM transmat^n 과
-- Reservoir N-step 예측에 더해 3-모델 모두 전환 예측에 기여.
-- ============================================

ALTER TABLE regime_runs ADD COLUMN IF NOT EXISTS kernel_predictions JSONB;

COMMENT ON COLUMN regime_runs.kernel_predictions IS 'Kernel Markov (RHINE) 비선형 임베딩 공간에서의 N-step 전이 확률 (5d/10d/30d)';
