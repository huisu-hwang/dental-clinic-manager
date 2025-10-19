-- ============================================
-- 하얀치과 대시보드 - Supabase 테이블 설정
-- ============================================
-- 이 SQL을 Supabase SQL Editor에서 실행하세요.
-- 기존 테이블이 있어도 안전하게 실행됩니다.

-- ============================================
-- 1. daily_reports 테이블 (일일 보고서)
-- ============================================
CREATE TABLE IF NOT EXISTS daily_reports (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  recall_count INTEGER DEFAULT 0,
  recall_booking_count INTEGER DEFAULT 0,
  consult_proceed INTEGER DEFAULT 0,
  consult_hold INTEGER DEFAULT 0,
  naver_review_count INTEGER DEFAULT 0,
  special_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(date);

-- ============================================
-- 2. consult_logs 테이블 (상담 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS consult_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  consult_content TEXT,
  consult_status VARCHAR(1) CHECK (consult_status IN ('O', 'X')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_consult_logs_date ON consult_logs(date);

-- ============================================
-- 3. gift_logs 테이블 (선물 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS gift_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  gift_type VARCHAR(100),
  naver_review VARCHAR(1) CHECK (naver_review IN ('O', 'X')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_gift_logs_date ON gift_logs(date);

-- ============================================
-- 4. happy_call_logs 테이블 (해피콜 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS happy_call_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  treatment TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_happy_call_logs_date ON happy_call_logs(date);

-- ============================================
-- 5. gift_inventory 테이블 (선물 재고)
-- ============================================
CREATE TABLE IF NOT EXISTS gift_inventory (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  stock INTEGER DEFAULT 0 CHECK (stock >= 0),
  unit VARCHAR(50) DEFAULT '개',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 기본 선물 아이템 추가 (이미 존재하면 무시)
INSERT INTO gift_inventory (name, stock, unit)
VALUES
  ('없음', 0, '개'),
  ('칫솔', 50, '개'),
  ('치약', 30, '개'),
  ('구강청결제', 20, '개'),
  ('덴탈플로스', 40, '개'),
  ('가글', 25, '개')
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 6. inventory_logs 테이블 (재고 변동 기록)
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  name VARCHAR(100) NOT NULL,
  reason TEXT,
  change INTEGER NOT NULL,
  old_stock INTEGER,
  new_stock INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_inventory_logs_timestamp ON inventory_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_name ON inventory_logs(name);

-- ============================================
-- 7. 자동 업데이트 트리거 설정
-- ============================================

-- updated_at 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 각 테이블에 트리거 생성
DROP TRIGGER IF EXISTS update_daily_reports_updated_at ON daily_reports;
CREATE TRIGGER update_daily_reports_updated_at
  BEFORE UPDATE ON daily_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_consult_logs_updated_at ON consult_logs;
CREATE TRIGGER update_consult_logs_updated_at
  BEFORE UPDATE ON consult_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_gift_logs_updated_at ON gift_logs;
CREATE TRIGGER update_gift_logs_updated_at
  BEFORE UPDATE ON gift_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_happy_call_logs_updated_at ON happy_call_logs;
CREATE TRIGGER update_happy_call_logs_updated_at
  BEFORE UPDATE ON happy_call_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_gift_inventory_updated_at ON gift_inventory;
CREATE TRIGGER update_gift_inventory_updated_at
  BEFORE UPDATE ON gift_inventory
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. Row Level Security (RLS) 설정
-- ============================================

-- 모든 테이블에 RLS 활성화
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE consult_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE happy_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 모든 작업을 할 수 있도록 정책 설정
-- (프로덕션 환경에서는 더 엄격한 정책 필요)

CREATE POLICY "Allow all operations on daily_reports" ON daily_reports
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on consult_logs" ON consult_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on gift_logs" ON gift_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on happy_call_logs" ON happy_call_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on gift_inventory" ON gift_inventory
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations on inventory_logs" ON inventory_logs
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 설정 완료!
-- ============================================
-- 이제 애플리케이션을 실행할 수 있습니다.
--
-- 테이블 확인:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
-- ============================================