-- ============================================
-- clinic_branches 함수 기반 RLS 정책
-- ============================================
-- Supabase Dashboard > SQL Editor에서 실행
-- https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql
-- ============================================

-- ============================================
-- 1단계: 기존 정책 모두 삭제
-- ============================================
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

-- ============================================
-- 2단계: 헬퍼 함수 생성
-- ============================================

-- 함수 1: 현재 사용자의 clinic_id 반환
CREATE OR REPLACE FUNCTION public.get_user_clinic_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT clinic_id
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- 함수 2: 현재 사용자의 role 반환
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT role
  FROM public.users
  WHERE id = auth.uid()
  LIMIT 1;
$$;

-- ============================================
-- 3단계: RLS 활성화
-- ============================================
ALTER TABLE public.clinic_branches ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4단계: 새 RLS 정책 생성
-- ============================================

-- 정책 1: SELECT - 모든 인증된 사용자가 자신의 병원 지점 조회
CREATE POLICY "clinic_branches_select"
ON public.clinic_branches
FOR SELECT
TO authenticated
USING (
  clinic_id = public.get_user_clinic_id()
);

-- 정책 2: INSERT - Owner/Manager만 자신의 병원에 지점 추가
CREATE POLICY "clinic_branches_insert"
ON public.clinic_branches
FOR INSERT
TO authenticated
WITH CHECK (
  clinic_id = public.get_user_clinic_id()
  AND public.get_user_role() IN ('owner', 'manager')
);

-- 정책 3: UPDATE - Owner/Manager만 자신의 병원 지점 수정
CREATE POLICY "clinic_branches_update"
ON public.clinic_branches
FOR UPDATE
TO authenticated
USING (
  clinic_id = public.get_user_clinic_id()
  AND public.get_user_role() IN ('owner', 'manager')
)
WITH CHECK (
  clinic_id = public.get_user_clinic_id()
  AND public.get_user_role() IN ('owner', 'manager')
);

-- 정책 4: DELETE - Owner만 자신의 병원 지점 삭제
CREATE POLICY "clinic_branches_delete"
ON public.clinic_branches
FOR DELETE
TO authenticated
USING (
  clinic_id = public.get_user_clinic_id()
  AND public.get_user_role() = 'owner'
);

-- ============================================
-- 5단계: 확인
-- ============================================

-- 생성된 정책 확인
SELECT
  policyname,
  cmd,
  qual as using_expression,
  with_check as check_expression
FROM pg_policies
WHERE tablename = 'clinic_branches'
ORDER BY cmd, policyname;

-- 함수 확인
SELECT
  routine_name,
  routine_type,
  security_type,
  is_deterministic
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_user_clinic_id', 'get_user_role');
