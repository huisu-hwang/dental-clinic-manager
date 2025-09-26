-- ========================================
-- 해피콜 로그 테이블 생성
-- Supabase SQL Editor에서 실행하세요
-- ========================================

-- 1. 테이블 생성
CREATE TABLE happy_call_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  treatment TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 인덱스 생성
CREATE INDEX idx_happy_call_logs_date ON happy_call_logs(date);

-- 3. RLS 활성화
ALTER TABLE happy_call_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS 정책 생성
CREATE POLICY "Allow all operations" ON happy_call_logs
  FOR ALL USING (true) WITH CHECK (true);

-- 5. 테이블 생성 확인
SELECT COUNT(*) FROM happy_call_logs;

-- ========================================
-- 실행 완료!
-- ========================================