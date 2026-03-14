-- ============================================
-- 홈택스 스크래핑 시스템 DB 스키마 마이그레이션
-- Migration: 20260312_hometax_scraping_system.sql
-- Created: 2026-03-12
--
-- 작업 내용:
--   1. 기존 CODEF 테이블 제거 (codef_connections, codef_sync_logs)
--   2. 신규 5개 테이블 생성 (hometax_credentials, scraping_jobs,
--      hometax_raw_data, scraping_sync_logs, scraping_workers)
--   3. RLS 정책 설정 (clinic_id 기반)
--   4. 인덱스 생성
--   5. 트리거 설정
-- ============================================

-- ============================================
-- STEP 1: 기존 CODEF 테이블 제거
-- ============================================

-- 1.1 CODEF 트리거 제거
DROP TRIGGER IF EXISTS trigger_codef_connections_updated_at ON codef_connections;

-- 1.2 CODEF 전용 트리거 함수 제거
DROP FUNCTION IF EXISTS update_codef_connections_updated_at();

-- 1.3 RLS 정책 제거
DROP POLICY IF EXISTS "Users can view their clinic codef connection" ON codef_connections;
DROP POLICY IF EXISTS "Owners can manage codef connection" ON codef_connections;
DROP POLICY IF EXISTS "Users can view their clinic sync logs" ON codef_sync_logs;
DROP POLICY IF EXISTS "Owners can manage sync logs" ON codef_sync_logs;

-- 1.4 테이블 제거
DROP TABLE IF EXISTS codef_sync_logs CASCADE;
DROP TABLE IF EXISTS codef_connections CASCADE;

-- ============================================
-- STEP 2: 신규 테이블 생성
-- ============================================

-- 2.1 hometax_credentials: 홈택스 인증정보 (클리닉별 1개)
CREATE TABLE hometax_credentials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  business_number VARCHAR(12) NOT NULL,
  hometax_user_id VARCHAR(50) NOT NULL,
  encrypted_password TEXT NOT NULL,
  login_method VARCHAR(20) NOT NULL DEFAULT 'id_pw'
    CHECK (login_method IN ('id_pw', 'cert')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_success TIMESTAMPTZ,
  last_login_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_clinic_hometax UNIQUE (clinic_id)
);

COMMENT ON TABLE hometax_credentials IS '홈택스 인증정보 (클리닉별 1개, 비밀번호 AES-256-GCM 암호화)';

-- 2.2 scraping_jobs: 스크래핑 작업 큐 (Job Queue)
CREATE TABLE scraping_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  job_type VARCHAR(30) NOT NULL
    CHECK (job_type IN ('daily_sync', 'monthly_settlement', 'manual_sync')),
  data_types TEXT[] NOT NULL,
  target_year INTEGER NOT NULL,
  target_month INTEGER NOT NULL
    CHECK (target_month BETWEEN 1 AND 12),
  target_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 5
    CHECK (priority BETWEEN 1 AND 10),
  worker_id VARCHAR(50),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  error_details JSONB,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE scraping_jobs IS '홈택스 스크래핑 작업 큐 (PostgreSQL Job Queue 패턴)';

-- 2.3 hometax_raw_data: 홈택스 수집 원시 데이터
CREATE TABLE hometax_raw_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  job_id UUID REFERENCES scraping_jobs(id) ON DELETE SET NULL,
  data_type VARCHAR(30) NOT NULL
    CHECK (data_type IN (
      'tax_invoice_sales', 'tax_invoice_purchase',
      'cash_receipt_sales', 'cash_receipt_purchase',
      'business_card_purchase', 'credit_card_sales'
    )),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL
    CHECK (month BETWEEN 1 AND 12),
  raw_data JSONB NOT NULL,
  parsed_data JSONB,
  record_count INTEGER NOT NULL DEFAULT 0,
  total_amount BIGINT NOT NULL DEFAULT 0,
  supply_amount BIGINT NOT NULL DEFAULT 0,
  tax_amount BIGINT NOT NULL DEFAULT 0,
  data_hash VARCHAR(64),
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_clinic_data_period UNIQUE (clinic_id, data_type, year, month)
);

COMMENT ON TABLE hometax_raw_data IS '홈택스 수집 원시 데이터 (클리닉/데이터유형/연월별 1행, UPSERT)';

-- 2.4 scraping_sync_logs: 스크래핑 동기화 로그
CREATE TABLE scraping_sync_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  job_id UUID REFERENCES scraping_jobs(id) ON DELETE SET NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL
    CHECK (month BETWEEN 1 AND 12),
  sync_type VARCHAR(30) NOT NULL
    CHECK (sync_type IN ('daily_sync', 'monthly_settlement', 'manual_sync', 'all')),
  tax_invoice_sales_count INTEGER NOT NULL DEFAULT 0,
  tax_invoice_purchase_count INTEGER NOT NULL DEFAULT 0,
  cash_receipt_sales_count INTEGER NOT NULL DEFAULT 0,
  cash_receipt_purchase_count INTEGER NOT NULL DEFAULT 0,
  business_card_purchase_count INTEGER NOT NULL DEFAULT 0,
  credit_card_sales_count INTEGER NOT NULL DEFAULT 0,
  total_synced INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE scraping_sync_logs IS '스크래핑 동기화 로그 (기존 codef_sync_logs 대체)';

-- 2.5 scraping_workers: 스크래핑 워커 상태 (헬스체크)
CREATE TABLE scraping_workers (
  id VARCHAR(50) PRIMARY KEY,
  hostname VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'busy', 'offline')),
  current_job_id UUID REFERENCES scraping_jobs(id) ON DELETE SET NULL,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jobs_completed INTEGER NOT NULL DEFAULT 0,
  jobs_failed INTEGER NOT NULL DEFAULT 0,
  metadata JSONB
);

COMMENT ON TABLE scraping_workers IS '스크래핑 워커 상태 (헬스체크, PK=워커ID)';

-- ============================================
-- STEP 3: 인덱스 생성
-- ============================================

-- hometax_credentials
CREATE INDEX idx_hometax_credentials_active
  ON hometax_credentials(is_active)
  WHERE is_active = true;

-- scraping_jobs (Job Queue 핵심 인덱스)
CREATE INDEX idx_scraping_jobs_queue
  ON scraping_jobs(status, priority ASC, created_at ASC)
  WHERE status = 'pending';
CREATE INDEX idx_scraping_jobs_clinic
  ON scraping_jobs(clinic_id, created_at DESC);
CREATE INDEX idx_scraping_jobs_worker
  ON scraping_jobs(worker_id)
  WHERE status = 'running';
CREATE INDEX idx_scraping_jobs_running_started
  ON scraping_jobs(started_at)
  WHERE status = 'running';

-- hometax_raw_data
CREATE INDEX idx_hometax_raw_data_clinic_period
  ON hometax_raw_data(clinic_id, year, month);
CREATE INDEX idx_hometax_raw_data_job
  ON hometax_raw_data(job_id)
  WHERE job_id IS NOT NULL;

-- scraping_sync_logs
CREATE INDEX idx_scraping_sync_logs_clinic_period
  ON scraping_sync_logs(clinic_id, year, month, synced_at DESC);
CREATE INDEX idx_scraping_sync_logs_synced
  ON scraping_sync_logs(synced_at DESC);

-- scraping_workers
CREATE INDEX idx_scraping_workers_heartbeat
  ON scraping_workers(last_heartbeat);

-- ============================================
-- STEP 4: RLS (Row Level Security) 정책
-- ============================================

-- 4.1 hometax_credentials
ALTER TABLE hometax_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hometax_credentials_select"
  ON hometax_credentials FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

CREATE POLICY "hometax_credentials_modify"
  ON hometax_credentials FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'master_admin')
    )
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

-- 4.2 scraping_jobs
ALTER TABLE scraping_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraping_jobs_select"
  ON scraping_jobs FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

CREATE POLICY "scraping_jobs_modify"
  ON scraping_jobs FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'master_admin')
    )
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

-- 4.3 hometax_raw_data (읽기 전용, 쓰기는 service_role만)
ALTER TABLE hometax_raw_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hometax_raw_data_select"
  ON hometax_raw_data FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

-- 4.4 scraping_sync_logs (읽기 전용, 쓰기는 service_role만)
ALTER TABLE scraping_sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraping_sync_logs_select"
  ON scraping_sync_logs FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

-- 4.5 scraping_workers (관리자 전용 조회)
ALTER TABLE scraping_workers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scraping_workers_select_admin"
  ON scraping_workers FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM users WHERE role IN ('master_admin', 'owner')
    )
  );

-- ============================================
-- STEP 5: 트리거 설정 (updated_at 자동 갱신)
-- ============================================

CREATE TRIGGER trigger_hometax_credentials_updated_at
  BEFORE UPDATE ON hometax_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_scraping_jobs_updated_at
  BEFORE UPDATE ON scraping_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trigger_hometax_raw_data_updated_at
  BEFORE UPDATE ON hometax_raw_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Migration Complete
-- ============================================
