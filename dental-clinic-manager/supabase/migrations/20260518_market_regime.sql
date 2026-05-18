-- ============================================
-- Market Regime Detection System Migration
-- Created: 2026-05-18
-- 7 tables + 1 ALTER for strategy_matrix_runs
-- ============================================

-- 매크로 지표 시계열 (FRED + ECOS)
CREATE TABLE IF NOT EXISTS macro_indicators (
  date DATE NOT NULL,
  source TEXT NOT NULL,
  indicator_id TEXT NOT NULL,
  value NUMERIC,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (date, source, indicator_id)
);
CREATE INDEX IF NOT EXISTS idx_macro_indicator_date ON macro_indicators (indicator_id, date DESC);

-- 학습 모델 메타데이터
CREATE TABLE IF NOT EXISTS regime_models (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  model_type TEXT NOT NULL,
  model_version TEXT NOT NULL,
  model_blob_path TEXT NOT NULL,
  feature_config JSONB NOT NULL,
  trained_at TIMESTAMPTZ DEFAULT NOW(),
  training_samples INT,
  validation_accuracy NUMERIC,
  UNIQUE (scope_type, scope_id, model_type, model_version)
);

-- 국면 추론 결과
CREATE TABLE IF NOT EXISTS regime_runs (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  trigger_type TEXT NOT NULL,
  current_state TEXT NOT NULL,
  current_confidence NUMERIC,
  state_probabilities JSONB,
  model_votes JSONB,
  transition_probabilities JSONB,
  data_as_of DATE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (scope_type, scope_id, as_of_date, trigger_type)
);
CREATE INDEX IF NOT EXISTS idx_regime_runs_lookup ON regime_runs (scope_type, scope_id, as_of_date DESC);

-- 국면 타임라인
CREATE TABLE IF NOT EXISTS regime_history (
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  date DATE NOT NULL,
  state TEXT NOT NULL,
  confidence NUMERIC,
  PRIMARY KEY (scope_type, scope_id, date)
);

-- 정밀 학습 작업 큐 (사용자 종목)
CREATE TABLE IF NOT EXISTS regime_jobs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  scope_type TEXT,
  scope_id TEXT,
  job_type TEXT,
  status TEXT DEFAULT 'queued',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_regime_jobs_status ON regime_jobs (status, requested_at);

-- 국면 전환 알림
CREATE TABLE IF NOT EXISTS regime_alerts (
  id BIGSERIAL PRIMARY KEY,
  scope_type TEXT,
  scope_id TEXT,
  from_state TEXT,
  to_state TEXT,
  transition_date DATE,
  notified_at TIMESTAMPTZ,
  notified_user_ids UUID[]
);

-- Strategy Matrix 연동 (regime 컬럼 추가)
ALTER TABLE strategy_matrix_runs
  ADD COLUMN IF NOT EXISTS regime_at_window_end TEXT;
CREATE INDEX IF NOT EXISTS idx_smr_regime
  ON strategy_matrix_runs (regime_at_window_end, market, period_window);
