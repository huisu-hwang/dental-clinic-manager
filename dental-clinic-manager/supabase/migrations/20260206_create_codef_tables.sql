-- ============================================
-- CODEF 홈택스 연동 테이블 생성
-- Migration: 20260206_create_codef_tables.sql
-- Created: 2026-02-06
-- ============================================

-- 1. CODEF 연결 정보 테이블
CREATE TABLE IF NOT EXISTS codef_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  connected_id VARCHAR(100) NOT NULL,           -- CODEF Connected ID
  hometax_user_id VARCHAR(50) NOT NULL,         -- 홈택스 부서사용자 ID
  is_active BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  last_sync_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- 병원당 하나의 연결만 허용
  CONSTRAINT unique_clinic_connection UNIQUE (clinic_id)
);

-- 2. CODEF 동기화 로그 테이블
CREATE TABLE IF NOT EXISTS codef_sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  sync_type VARCHAR(20) NOT NULL DEFAULT 'all',  -- all, taxInvoice, cashReceipt, businessCard
  tax_invoice_count INTEGER DEFAULT 0,
  cash_receipt_count INTEGER DEFAULT 0,
  business_card_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_codef_connections_clinic ON codef_connections(clinic_id);
CREATE INDEX IF NOT EXISTS idx_codef_connections_active ON codef_connections(is_active);
CREATE INDEX IF NOT EXISTS idx_codef_sync_logs_clinic ON codef_sync_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_codef_sync_logs_date ON codef_sync_logs(year, month);
CREATE INDEX IF NOT EXISTS idx_codef_sync_logs_synced_at ON codef_sync_logs(synced_at DESC);

-- 4. RLS 정책 설정
ALTER TABLE codef_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE codef_sync_logs ENABLE ROW LEVEL SECURITY;

-- codef_connections RLS
CREATE POLICY "Users can view their clinic codef connection"
  ON codef_connections FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage codef connection"
  ON codef_connections FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- codef_sync_logs RLS
CREATE POLICY "Users can view their clinic sync logs"
  ON codef_sync_logs FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Owners can manage sync logs"
  ON codef_sync_logs FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- 5. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_codef_connections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_codef_connections_updated_at ON codef_connections;
CREATE TRIGGER trigger_codef_connections_updated_at
  BEFORE UPDATE ON codef_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_codef_connections_updated_at();

-- ============================================
-- Migration Complete
-- ============================================
