-- supabase/migrations/20260419_investment_profit_snapshots.sql
-- 주식 자동매매 월별 수익 스냅샷 (예정 정산 5% 표시용)

CREATE TABLE IF NOT EXISTS investment_profit_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  realized_profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  unrealized_profit NUMERIC(15,2) NOT NULL DEFAULT 0,
  expected_fee NUMERIC(15,2) GENERATED ALWAYS AS
    (GREATEST(realized_profit, 0) * 0.05) STORED,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (clinic_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_investment_profit_clinic_ym
  ON investment_profit_snapshots (clinic_id, year DESC, month DESC);

ALTER TABLE investment_profit_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "클리닉 멤버만 조회" ON investment_profit_snapshots;
CREATE POLICY "클리닉 멤버만 조회"
  ON investment_profit_snapshots FOR SELECT
  USING (clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "서비스 롤만 기록" ON investment_profit_snapshots;
CREATE POLICY "서비스 롤만 기록"
  ON investment_profit_snapshots FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "서비스 롤만 갱신" ON investment_profit_snapshots;
CREATE POLICY "서비스 롤만 갱신"
  ON investment_profit_snapshots FOR UPDATE
  USING (auth.role() = 'service_role');
