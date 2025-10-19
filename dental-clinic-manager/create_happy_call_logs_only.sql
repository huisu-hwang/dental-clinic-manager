-- ========================================
-- 해피콜 로그 테이블만 생성
-- ========================================
-- 다른 테이블은 이미 있고 happy_call_logs만 필요한 경우 사용

-- happy_call_logs 테이블 생성
CREATE TABLE IF NOT EXISTS happy_call_logs (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  treatment TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 날짜 인덱스 생성 (빠른 조회용)
CREATE INDEX IF NOT EXISTS idx_happy_call_logs_date ON happy_call_logs(date);

-- RLS (Row Level Security) 활성화
ALTER TABLE happy_call_logs ENABLE ROW LEVEL SECURITY;

-- 모든 사용자가 접근 가능하도록 정책 설정
CREATE POLICY "Enable all access for happy_call_logs" ON happy_call_logs
  FOR ALL USING (true) WITH CHECK (true);

-- ========================================
-- 테스트 데이터 삽입 (선택사항)
-- 아래 주석을 해제하면 테스트 데이터가 추가됩니다
-- ========================================

/*
INSERT INTO happy_call_logs (date, patient_name, treatment, notes)
VALUES
  (CURRENT_DATE, '홍길동', '스케일링', '다음 주 재방문 예약'),
  (CURRENT_DATE, '김영희', '충치 치료', '치료 후 상태 양호'),
  (CURRENT_DATE, '이철수', '임플란트 상담', '3개월 후 재확인 필요');
*/

-- ========================================
-- 테이블 생성 확인
-- ========================================
-- 아래 쿼리로 테이블이 제대로 생성되었는지 확인 가능
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'happy_call_logs'
ORDER BY ordinal_position;

-- ========================================
-- 완료!
-- happy_call_logs 테이블이 생성되었습니다.
-- ========================================