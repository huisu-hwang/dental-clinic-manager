-- ============================================
-- RL 트레이딩 Phase 1
-- - rl_models: 사전학습 모델 메타데이터
-- - rl_inference_logs: 일봉 추론 감사 로그
-- - investment_strategies 확장: strategy_type, rl_model_id
-- - user_investment_settings 확장: rl_paused_at, rl_paused_reason
-- ============================================

CREATE TABLE IF NOT EXISTS rl_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('finrl_pretrained','sb3_pretrained','custom')),
  algorithm TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('portfolio','single_asset')),
  market TEXT NOT NULL DEFAULT 'US',
  timeframe TEXT NOT NULL DEFAULT '1d',
  universe JSONB,
  input_features JSONB NOT NULL,
  state_window INT NOT NULL DEFAULT 60 CHECK (state_window > 0 AND state_window <= 500),
  output_shape JSONB NOT NULL,
  checkpoint_url TEXT,
  checkpoint_path TEXT,
  checkpoint_sha256 TEXT,
  min_confidence NUMERIC(3,2) DEFAULT 0.60 CHECK (min_confidence >= 0 AND min_confidence <= 1),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','downloading','ready','failed','archived')),
  metrics JSONB,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rl_models_clinic ON rl_models(clinic_id);
CREATE INDEX IF NOT EXISTS idx_rl_models_status ON rl_models(status);

ALTER TABLE investment_strategies
  ADD COLUMN IF NOT EXISTS strategy_type TEXT NOT NULL DEFAULT 'rule'
    CHECK (strategy_type IN ('rule','rl_portfolio','rl_single')),
  ADD COLUMN IF NOT EXISTS rl_model_id UUID REFERENCES rl_models(id) ON DELETE SET NULL;
ALTER TABLE investment_strategies DROP CONSTRAINT IF EXISTS rl_strategy_requires_model;
ALTER TABLE investment_strategies
  ADD CONSTRAINT rl_strategy_requires_model
  CHECK (strategy_type = 'rule' OR rl_model_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_strategies_type ON investment_strategies(strategy_type);
CREATE INDEX IF NOT EXISTS idx_strategies_rl_model ON investment_strategies(rl_model_id);

CREATE TABLE IF NOT EXISTS rl_inference_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES investment_strategies(id) ON DELETE CASCADE,
  rl_model_id UUID NOT NULL REFERENCES rl_models(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trade_date DATE NOT NULL,
  state_hash TEXT NOT NULL,
  output JSONB NOT NULL,
  confidence NUMERIC(4,3),
  decision TEXT NOT NULL CHECK (decision IN ('order','hold','blocked_low_confidence','blocked_kill_switch','error')),
  blocked_reason TEXT,
  latency_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT rl_inference_unique_per_day UNIQUE (strategy_id, trade_date)
);
CREATE INDEX IF NOT EXISTS idx_rl_logs_strategy_date ON rl_inference_logs(strategy_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_rl_logs_user_date ON rl_inference_logs(user_id, trade_date DESC);

ALTER TABLE user_investment_settings
  ADD COLUMN IF NOT EXISTS rl_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rl_paused_reason TEXT;

ALTER TABLE rl_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE rl_inference_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic models" ON rl_models;
CREATE POLICY "Users can view clinic models" ON rl_models
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own models" ON rl_models;
CREATE POLICY "Users can manage own models" ON rl_models
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own logs" ON rl_inference_logs;
CREATE POLICY "Users can view own logs" ON rl_inference_logs
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service can write logs" ON rl_inference_logs;
CREATE POLICY "Service can write logs" ON rl_inference_logs
  FOR INSERT WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_rl_models_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rl_models_updated_at ON rl_models;
CREATE TRIGGER trigger_rl_models_updated_at BEFORE UPDATE ON rl_models
  FOR EACH ROW EXECUTE FUNCTION update_rl_models_updated_at();
