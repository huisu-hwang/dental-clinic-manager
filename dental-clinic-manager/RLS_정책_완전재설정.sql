-- ============================================
-- clinic_branches RLS 정책 완전 재설정
-- ============================================
-- Supabase Dashboard > SQL Editor에서 실행
-- https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql
-- ============================================

-- 1. 기존 모든 정책 삭제
DROP POLICY IF EXISTS "Users can view branches from their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Users can view branches of their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners can manage branches in their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Managers can manage branches in their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners and managers can create branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners and managers can update branches" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners can delete branches" ON public.clinic_branches;

-- 2. RLS 활성화 (이미 활성화되어 있지만 확인차)
ALTER TABLE public.clinic_branches ENABLE ROW LEVEL SECURITY;

-- 3. 새로운 간단한 정책 생성

-- 정책 1: 모든 인증된 사용자는 자신의 병원 지점을 볼 수 있음
CREATE POLICY "select_own_clinic_branches"
ON public.clinic_branches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.clinic_id = clinic_branches.clinic_id
  )
);

-- 정책 2: Owner와 Manager는 자신의 병원 지점을 수정할 수 있음
CREATE POLICY "update_own_clinic_branches"
ON public.clinic_branches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.clinic_id = clinic_branches.clinic_id
    AND users.role IN ('owner', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.clinic_id = clinic_branches.clinic_id
    AND users.role IN ('owner', 'manager')
  )
);

-- 정책 3: Owner와 Manager는 자신의 병원 지점을 추가/삭제할 수 있음
CREATE POLICY "insert_delete_own_clinic_branches"
ON public.clinic_branches
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.clinic_id = clinic_branches.clinic_id
    AND users.role IN ('owner', 'manager')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.clinic_id = clinic_branches.clinic_id
    AND users.role IN ('owner', 'manager')
  )
);

-- 4. 적용된 정책 확인
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'clinic_branches'
ORDER BY policyname;
