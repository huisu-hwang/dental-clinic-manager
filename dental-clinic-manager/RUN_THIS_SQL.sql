-- ========================================
-- 하얀치과 대시보드 데이터베이스 설정
-- ========================================
-- Supabase SQL Editor에서 이 전체 코드를 복사하여 실행하세요.

-- 1. daily_reports 테이블 생성
CREATE TABLE IF NOT EXISTS daily_reports (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  recall_count INTEGER DEFAULT 0,
  recall_booking_count INTEGER DEFAULT 0,
  consult_proceed INTEGER DEFAULT 0,
  consult_hold INTEGER DEFAULT 0,
  naver_review_count INTEGER DEFAULT 0,
  special_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. consult_logs 테이블 생성
CREATE TABLE IF NOT EXISTS consult_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  consult_content TEXT,
  consult_status VARCHAR(1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. gift_logs 테이블 생성
CREATE TABLE IF NOT EXISTS gift_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  gift_type VARCHAR(100),
  naver_review VARCHAR(1),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. happy_call_logs 테이블 생성
CREATE TABLE IF NOT EXISTS happy_call_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  treatment TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. gift_inventory 테이블 생성
CREATE TABLE IF NOT EXISTS gift_inventory (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  stock INTEGER DEFAULT 0,
  unit VARCHAR(50) DEFAULT '개',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. inventory_logs 테이블 생성
CREATE TABLE IF NOT EXISTS inventory_logs (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  name VARCHAR(100) NOT NULL,
  reason TEXT,
  change INTEGER NOT NULL,
  old_stock INTEGER,
  new_stock INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 인덱스 생성 (빠른 조회를 위해)
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(date);
CREATE INDEX IF NOT EXISTS idx_consult_logs_date ON consult_logs(date);
CREATE INDEX IF NOT EXISTS idx_gift_logs_date ON gift_logs(date);
CREATE INDEX IF NOT EXISTS idx_happy_call_logs_date ON happy_call_logs(date);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_timestamp ON inventory_logs(timestamp);

-- 8. 기본 선물 아이템 추가
INSERT INTO gift_inventory (name, stock, unit)
VALUES
  ('없음', 0, '개'),
  ('칫솔', 50, '개'),
  ('치약', 30, '개'),
  ('구강청결제', 20, '개'),
  ('덴탈플로스', 40, '개'),
  ('가글', 25, '개')
ON CONFLICT (name) DO NOTHING;

-- 9. RLS (Row Level Security) 활성화
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE consult_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE happy_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- 10. RLS 정책 생성 (모든 사용자 접근 허용)
CREATE POLICY "Enable all access for daily_reports" ON daily_reports
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for consult_logs" ON consult_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for gift_logs" ON gift_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for happy_call_logs" ON happy_call_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for gift_inventory" ON gift_inventory
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for inventory_logs" ON inventory_logs
  FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- 실행 완료!
-- 모든 테이블이 생성되었습니다.
-- ========================================