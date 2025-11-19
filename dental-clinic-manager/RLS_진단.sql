-- ============================================
-- RLS 정책 진단 SQL
-- ============================================
-- Supabase Dashboard > SQL Editor에서 실행
-- https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql
-- ============================================

-- 1. 현재 로그인한 사용자 ID 및 clinic_id 확인
SELECT
  auth.uid() as current_user_id,
  (SELECT clinic_id FROM users WHERE id = auth.uid()) as user_clinic_id,
  (SELECT role FROM users WHERE id = auth.uid()) as user_role;

-- 2. RLS가 적용된 상태로 clinic_branches 조회
-- (빈 결과가 나오면 RLS 정책에 문제가 있음)
SELECT * FROM clinic_branches;

-- 3. 현재 적용된 RLS 정책 확인
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual as using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'clinic_branches'
ORDER BY policyname;

-- 4. users 테이블에서 현재 사용자 정보 확인
SELECT id, clinic_id, role, name
FROM users
WHERE id = auth.uid();

-- 5. 서브쿼리 테스트 (RLS 정책에서 사용하는 조건 직접 테스트)
SELECT
  cb.*,
  (cb.clinic_id IN (
    SELECT clinic_id
    FROM users
    WHERE id = auth.uid()
  )) as rls_should_allow
FROM clinic_branches cb
WHERE cb.clinic_id = (SELECT clinic_id FROM users WHERE id = auth.uid());
