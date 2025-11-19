-- ============================================
-- clinic_branches 올바른 RLS 정책
-- ============================================
-- Context7 문서 기반 모범 사례 적용
-- - auth.uid()를 SELECT로 감싸서 결과 캐싱
-- - IN/EXISTS 서브쿼리로 users 테이블 조인
-- - TO authenticated로 명시하여 성능 향상
-- ============================================

-- 1단계: 기존 정책 모두 삭제
DROP POLICY IF EXISTS "clinic_branches_select" ON public.clinic_branches;
DROP POLICY IF EXISTS "clinic_branches_insert" ON public.clinic_branches;
DROP POLICY IF EXISTS "clinic_branches_update" ON public.clinic_branches;
DROP POLICY IF EXISTS "clinic_branches_delete" ON public.clinic_branches;
DROP POLICY IF EXISTS "Users can view branches from their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Users can view branches of their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners can manage branches in their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Managers can manage branches in their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners and managers can create branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners and managers can update branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners can delete branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "select_own_clinic_branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "update_own_clinic_branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "insert_delete_own_clinic_branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "Enable all for development" ON public.clinic_branches;

-- 2단계: RLS 활성화 확인
ALTER TABLE public.clinic_branches ENABLE ROW LEVEL SECURITY;

-- 3단계: 올바른 RLS 정책 생성 (Context7 패턴)

-- 정책 1: SELECT - 모든 인증된 사용자가 자신의 병원 지점 조회
CREATE POLICY "Users can view branches of their clinic"
ON public.clinic_branches
FOR SELECT
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = (SELECT auth.uid())
  )
);

-- 정책 2: INSERT - Owner/Manager만 자신의 병원에 지점 추가
CREATE POLICY "Admins can create branches"
ON public.clinic_branches
FOR INSERT
TO authenticated
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role IN ('owner', 'manager')
  )
);

-- 정책 3: UPDATE - Owner/Manager만 자신의 병원 지점 수정
CREATE POLICY "Admins can update branches"
ON public.clinic_branches
FOR UPDATE
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role IN ('owner', 'manager')
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role IN ('owner', 'manager')
  )
);

-- 정책 4: DELETE - Owner만 자신의 병원 지점 삭제
CREATE POLICY "Owners can delete branches"
ON public.clinic_branches
FOR DELETE
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = (SELECT auth.uid())
    AND role = 'owner'
  )
);

-- 4단계: 적용된 정책 확인
SELECT
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as check_expression
FROM pg_policies
WHERE tablename = 'clinic_branches'
ORDER BY cmd, policyname;
