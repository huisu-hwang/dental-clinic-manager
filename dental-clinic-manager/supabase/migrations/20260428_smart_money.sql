-- 외국인/기관 일별 매매 동향 (KIS API 캐시)
CREATE TABLE IF NOT EXISTS investor_trend (
  ticker varchar(20) NOT NULL,
  market varchar(2) NOT NULL,
  date date NOT NULL,
  foreigner_net bigint,
  institution_net bigint,
  retail_net bigint,
  total_value bigint,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticker, market, date)
);
CREATE INDEX IF NOT EXISTS idx_investor_trend_date ON investor_trend(date DESC);

-- 사용자 시그널 알림 구독
CREATE TABLE IF NOT EXISTS smart_money_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker varchar(20) NOT NULL,
  market varchar(2) NOT NULL,
  ticker_name varchar(100),
  signal_types text[] NOT NULL DEFAULT '{}',
  min_confidence integer NOT NULL DEFAULT 70 CHECK (min_confidence BETWEEN 0 AND 100),
  notification_methods text[] NOT NULL DEFAULT ARRAY['inapp']::text[],
  enabled boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sma_user ON smart_money_alerts(user_id, enabled);

ALTER TABLE smart_money_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts_owner_all" ON smart_money_alerts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 시그널 발생 이력
CREATE TABLE IF NOT EXISTS smart_money_signal_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_id uuid REFERENCES smart_money_alerts(id) ON DELETE SET NULL,
  ticker varchar(20) NOT NULL,
  market varchar(2) NOT NULL,
  signal_type varchar(50) NOT NULL,
  confidence integer NOT NULL,
  payload jsonb,
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sml_user_time ON smart_money_signal_log(user_id, detected_at DESC);

ALTER TABLE smart_money_signal_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signal_log_owner_select" ON smart_money_signal_log FOR SELECT USING (auth.uid() = user_id);
