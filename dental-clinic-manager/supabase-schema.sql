-- 하얀치과 실시간 업무 대시보드 데이터베이스 스키마

-- 일일 보고서 종합 테이블
CREATE TABLE IF NOT EXISTS daily_reports (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    recall_count INTEGER DEFAULT 0,
    recall_booking_count INTEGER DEFAULT 0,
    consult_proceed INTEGER DEFAULT 0,
    consult_hold INTEGER DEFAULT 0,
    naver_review_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 상담 상세 기록 테이블
CREATE TABLE IF NOT EXISTS consult_logs (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    patient_name VARCHAR(100) NOT NULL,
    consult_content TEXT,
    consult_status VARCHAR(1) NOT NULL CHECK (consult_status IN ('O', 'X')),
    hold_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 선물/리뷰 상세 기록 테이블
CREATE TABLE IF NOT EXISTS gift_logs (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    patient_name VARCHAR(100) NOT NULL,
    gift_type VARCHAR(100),
    naver_review VARCHAR(1) NOT NULL CHECK (naver_review IN ('O', 'X')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 선물 재고 관리 테이블
CREATE TABLE IF NOT EXISTS gift_inventory (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    stock INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 재고 입출고 기록 테이블
CREATE TABLE IF NOT EXISTS inventory_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    change INTEGER NOT NULL,
    old_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(date);
CREATE INDEX IF NOT EXISTS idx_consult_logs_date ON consult_logs(date);
CREATE INDEX IF NOT EXISTS idx_gift_logs_date ON gift_logs(date);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_timestamp ON inventory_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_inventory_logs_name ON inventory_logs(name);

-- RLS (Row Level Security) 정책 설정
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE consult_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

-- 모든 테이블에 대한 SELECT, INSERT, UPDATE, DELETE 권한 부여
CREATE POLICY "Enable read access for all users" ON daily_reports FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON daily_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON daily_reports FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON daily_reports FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON consult_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON consult_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON consult_logs FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON consult_logs FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON gift_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON gift_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON gift_logs FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON gift_logs FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON gift_inventory FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON gift_inventory FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON gift_inventory FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON gift_inventory FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON inventory_logs FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON inventory_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON inventory_logs FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON inventory_logs FOR DELETE USING (true);

-- 트리거 함수 생성 (updated_at 자동 업데이트)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 트리거 생성
CREATE OR REPLACE TRIGGER update_daily_reports_updated_at 
    BEFORE UPDATE ON daily_reports 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER update_gift_inventory_updated_at 
    BEFORE UPDATE ON gift_inventory 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();