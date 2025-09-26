-- ========================================
-- 참고사항 저장 오류 해결
-- Supabase SQL Editor에서 아래 SQL을 실행하세요
-- ========================================

-- 1. consult_logs 테이블에 remarks 컬럼 추가
ALTER TABLE consult_logs
ADD COLUMN remarks TEXT;

-- 2. gift_logs 테이블에 notes 컬럼 추가
ALTER TABLE gift_logs
ADD COLUMN notes TEXT;

-- 3. 컬럼이 정상적으로 추가되었는지 확인
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name IN ('consult_logs', 'gift_logs')
  AND column_name IN ('remarks', 'notes')
ORDER BY table_name, column_name;

-- ========================================
-- 실행 후 결과 확인:
-- consult_logs | remarks | text | YES
-- gift_logs    | notes   | text | YES
-- ========================================