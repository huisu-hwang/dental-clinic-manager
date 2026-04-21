-- DentWeb 쿼리 프록시 시스템
-- AI 분석에서 DentWeb DB를 실시간으로 읽기/쓰기하기 위한 메시지 큐 테이블

-- 1. 쿼리 요청 테이블
CREATE TABLE IF NOT EXISTS dentweb_query_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  query_type VARCHAR(20) NOT NULL CHECK (query_type IN ('read', 'write')),
  query_text TEXT NOT NULL,
  params JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'error', 'timeout')),
  requested_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '60 seconds')
);

-- 2. 쿼리 결과 테이블
CREATE TABLE IF NOT EXISTS dentweb_query_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES dentweb_query_requests(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  data JSONB,
  row_count INTEGER DEFAULT 0,
  error_message TEXT,
  execution_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DentWeb 스키마 캐시 테이블
CREATE TABLE IF NOT EXISTS dentweb_schema_cache (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  schema_data JSONB NOT NULL,
  writable_tables TEXT[] DEFAULT '{}',
  discovered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_dqr_clinic_status ON dentweb_query_requests(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_dqr_expires ON dentweb_query_requests(expires_at);
CREATE INDEX IF NOT EXISTS idx_dqr_created ON dentweb_query_requests(created_at);
CREATE INDEX IF NOT EXISTS idx_dqres_request_id ON dentweb_query_results(request_id);

-- RLS 활성화
ALTER TABLE dentweb_query_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentweb_query_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE dentweb_schema_cache ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 클리닉별 격리
CREATE POLICY "Clinic isolation for dentweb_query_requests" ON dentweb_query_requests
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

CREATE POLICY "Clinic isolation for dentweb_query_results" ON dentweb_query_results
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

CREATE POLICY "Clinic isolation for dentweb_schema_cache" ON dentweb_schema_cache
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
  );

-- Realtime 활성화 (브릿지 에이전트가 구독할 수 있도록)
ALTER PUBLICATION supabase_realtime ADD TABLE dentweb_query_requests;

-- 만료된 요청 자동 정리 (pg_cron으로 10분마다)
-- 참고: pg_cron이 설정되어 있지 않으면 수동 정리 필요
