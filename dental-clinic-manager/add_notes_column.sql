-- ========================================
-- 컬럼 추가: remarks와 notes
-- Supabase SQL Editor에서 실행하세요
-- ========================================

-- 1. consult_logs 테이블에 remarks 컬럼 추가
ALTER TABLE consult_logs
ADD COLUMN IF NOT EXISTS remarks TEXT;

-- 2. gift_logs 테이블에 notes 컬럼 추가
ALTER TABLE gift_logs
ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. 컬럼 추가 확인
SELECT 'consult_logs' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'consult_logs'
UNION ALL
SELECT 'gift_logs' as table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'gift_logs'
ORDER BY table_name, ordinal_position;

-- ========================================
-- 완료! 이제 모든 필드를 저장할 수 있습니다.
-- ========================================