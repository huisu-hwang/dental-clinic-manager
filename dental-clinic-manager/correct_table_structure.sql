-- ========================================
-- 올바른 테이블 구조 (참고용)
-- ========================================
-- 각 테이블은 다음과 같은 구조여야 합니다:

-- 1. id: BIGSERIAL PRIMARY KEY (각 레코드의 고유 번호)
-- 2. clinic_id: UUID FOREIGN KEY (어느 병원의 데이터인지)
-- 3. 기타 컬럼들...

-- ========================================
-- DAILY_REPORTS 테이블 (올바른 구조)
-- ========================================
/*
CREATE TABLE daily_reports (
  id BIGSERIAL PRIMARY KEY,                          -- 각 보고서의 고유 ID
  clinic_id UUID REFERENCES clinics(id),             -- 병원 ID (foreign key)
  date DATE NOT NULL,                                -- 보고서 날짜
  recall_count INTEGER DEFAULT 0,
  recall_booking_count INTEGER DEFAULT 0,
  consult_proceed INTEGER DEFAULT 0,
  consult_hold INTEGER DEFAULT 0,
  naver_review_count INTEGER DEFAULT 0,
  special_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
*/

-- ========================================
-- CONSULT_LOGS 테이블 (올바른 구조)
-- ========================================
/*
CREATE TABLE consult_logs (
  id BIGSERIAL PRIMARY KEY,                          -- 각 상담의 고유 ID
  clinic_id UUID REFERENCES clinics(id),             -- 병원 ID (foreign key)
  date DATE NOT NULL,
  patient_name VARCHAR(100) NOT NULL,
  consult_content TEXT,
  consult_status VARCHAR(10),
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
*/

-- ========================================
-- 간단한 복원 방법 (만약 id를 clinic_id로 바꿨다면)
-- ========================================

-- 방법 1: 수동으로 하나씩 복원 (권장)
-- fix_table_structure.sql 파일의 단계별 스크립트를 따라하세요

-- 방법 2: 빠른 복원 (테스트 환경에서만 사용)
-- ⚠️ 주의: 이 방법은 데이터가 손실될 수 있습니다!
-- 프로덕션 환경에서는 절대 사용하지 마세요!

/*
-- 백업 테이블 생성
CREATE TABLE daily_reports_backup AS SELECT * FROM daily_reports;

-- 테이블 삭제 후 재생성
DROP TABLE IF EXISTS daily_reports CASCADE;

CREATE TABLE daily_reports (
  id BIGSERIAL PRIMARY KEY,
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  recall_count INTEGER DEFAULT 0,
  recall_booking_count INTEGER DEFAULT 0,
  consult_proceed INTEGER DEFAULT 0,
  consult_hold INTEGER DEFAULT 0,
  naver_review_count INTEGER DEFAULT 0,
  special_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 백업에서 데이터 복원
INSERT INTO daily_reports (clinic_id, date, recall_count, recall_booking_count,
                           consult_proceed, consult_hold, naver_review_count, special_notes)
SELECT clinic_id, date, recall_count, recall_booking_count,
       consult_proceed, consult_hold, naver_review_count, special_notes
FROM daily_reports_backup;

-- 백업 테이블 삭제
DROP TABLE daily_reports_backup;
*/

-- ========================================
-- 현재 구조 확인하기
-- ========================================

-- 이 쿼리로 현재 테이블 구조를 확인하세요
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  tc.constraint_type
FROM information_schema.columns c
LEFT JOIN information_schema.key_column_usage kcu
  ON c.table_name = kcu.table_name
  AND c.column_name = kcu.column_name
LEFT JOIN information_schema.table_constraints tc
  ON kcu.constraint_name = tc.constraint_name
WHERE c.table_name IN ('daily_reports', 'consult_logs', 'gift_logs')
  AND c.column_name IN ('id', 'clinic_id')
ORDER BY c.table_name, c.ordinal_position;

-- 예상 결과:
-- table_name      | column_name | data_type | constraint_type
-- daily_reports   | id          | bigint    | PRIMARY KEY
-- daily_reports   | clinic_id   | uuid      | FOREIGN KEY
-- consult_logs    | id          | bigint    | PRIMARY KEY
-- consult_logs    | clinic_id   | uuid      | FOREIGN KEY
