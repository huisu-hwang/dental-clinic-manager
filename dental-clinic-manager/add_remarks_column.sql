-- ========================================
-- consult_logs 테이블에 remarks 컬럼 추가
-- Supabase SQL Editor에서 실행하세요
-- ========================================

-- 1. consult_logs 테이블에 remarks 컬럼 추가
ALTER TABLE consult_logs
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 2. 기존 데이터의 remarks를 NULL로 설정 (기본값)
-- 이미 NULL이므로 별도 작업 불필요

-- 3. 컬럼 추가 확인
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'consult_logs'
ORDER BY ordinal_position;

-- ========================================
-- 완료! 이제 remarks 필드를 저장할 수 있습니다.
-- ========================================