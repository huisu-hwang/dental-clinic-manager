-- happy_call_logs 테이블 생성
CREATE TABLE IF NOT EXISTS happy_call_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  treatment TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- 날짜별 조회를 위한 인덱스
CREATE INDEX idx_happy_call_logs_date ON happy_call_logs(date);

-- 업데이트 시각 자동 갱신을 위한 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER update_happy_call_logs_updated_at BEFORE UPDATE
    ON happy_call_logs FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS (Row Level Security) 활성화 (선택사항)
ALTER TABLE happy_call_logs ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 읽고 쓸 수 있도록 정책 설정 (필요에 따라 조정)
CREATE POLICY "Allow all operations on happy_call_logs" ON happy_call_logs
  FOR ALL USING (true) WITH CHECK (true);