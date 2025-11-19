-- ============================================
-- clinic_branches 개발용 전체 허용 정책 추가
-- ============================================
-- users 테이블과 동일한 개발용 정책을 추가합니다
-- 이후 프로덕션 배포 시 이 정책을 제거하면 됩니다
-- ============================================

-- 1. 기존 함수 기반 정책 모두 삭제 (작동하지 않으므로)
DROP POLICY IF EXISTS "clinic_branches_select" ON public.clinic_branches;
DROP POLICY IF EXISTS "clinic_branches_insert" ON public.clinic_branches;
DROP POLICY IF EXISTS "clinic_branches_update" ON public.clinic_branches;
DROP POLICY IF EXISTS "clinic_branches_delete" ON public.clinic_branches;

-- 2. RLS 활성화 (이미 활성화되어 있지만 확인차)
ALTER TABLE public.clinic_branches ENABLE ROW LEVEL SECURITY;

-- 3. 개발용 전체 허용 정책 추가
CREATE POLICY "Enable all for development"
ON public.clinic_branches
FOR ALL
TO public
USING (true)
WITH CHECK (true);

-- 4. 적용된 정책 확인
SELECT
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as check_expression
FROM pg_policies
WHERE tablename = 'clinic_branches'
ORDER BY cmd, policyname;
