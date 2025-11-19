-- ============================================
-- clinic_branches 테이블 RLS 정책 추가
-- ============================================
-- 아래 SQL을 Supabase Dashboard > SQL Editor에서 실행하세요
-- https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql
-- ============================================

-- 1. RLS 활성화
ALTER TABLE public.clinic_branches ENABLE ROW LEVEL SECURITY;

-- 2. 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Users can view branches from their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Owners can manage branches in their clinic" ON public.clinic_branches;
DROP POLICY IF EXISTS "Managers can manage branches in their clinic" ON public.clinic_branches;

-- 3. 읽기 정책: 모든 인증된 사용자는 자신의 병원 지점을 볼 수 있음
CREATE POLICY "Users can view branches from their clinic"
ON public.clinic_branches
FOR SELECT
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- 4. 관리 정책: 원장은 지점을 관리할 수 있음
CREATE POLICY "Owners can manage branches in their clinic"
ON public.clinic_branches
FOR ALL
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'owner'
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'owner'
  )
);

-- 5. 관리 정책: 매니저도 지점을 관리할 수 있음
CREATE POLICY "Managers can manage branches in their clinic"
ON public.clinic_branches
FOR ALL
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'manager'
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
    AND role = 'manager'
  )
);
