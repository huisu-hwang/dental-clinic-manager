-- ============================================
-- RLS 테스트용 임시 비활성화
-- ============================================
-- 이것은 데이터가 제대로 조회되는지 테스트하기 위한 것입니다
-- 테스트 후 반드시 다시 활성화해야 합니다!
-- ============================================

-- RLS 임시 비활성화
ALTER TABLE public.clinic_branches DISABLE ROW LEVEL SECURITY;

-- 확인
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'clinic_branches';
