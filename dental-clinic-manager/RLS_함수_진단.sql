-- ============================================
-- RLS 함수 진단 스크립트
-- ============================================
-- 현재 사용자 컨텍스트에서 함수들이 제대로 동작하는지 확인
-- Supabase Dashboard > SQL Editor에서 실행
-- https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql
-- ============================================

-- 1. 현재 인증된 사용자 ID 확인
SELECT
  auth.uid() as current_user_id,
  'Current authenticated user' as description;

-- 2. 헬퍼 함수 테스트
SELECT
  public.get_user_clinic_id() as user_clinic_id,
  public.get_user_role() as user_role,
  'Helper functions result' as description;

-- 3. users 테이블에서 직접 조회 (비교용)
SELECT
  id,
  clinic_id,
  role,
  name,
  'Direct user query' as description
FROM public.users
WHERE id = auth.uid();

-- 4. clinic_branches 테이블의 데이터 (RLS 통과 여부 확인)
SELECT
  cb.id,
  cb.clinic_id as branch_clinic_id,
  cb.branch_name as name,
  cb.is_active,
  public.get_user_clinic_id() as user_clinic_id,
  CASE
    WHEN cb.clinic_id = public.get_user_clinic_id() THEN 'MATCH - Should be visible'
    ELSE 'NO MATCH - Should be hidden'
  END as rls_check,
  'Branches with RLS condition check' as description
FROM public.clinic_branches cb;

-- 5. RLS 정책이 통과해야 하는 조건 테스트
SELECT
  cb.id,
  cb.clinic_id as branch_clinic_id,
  public.get_user_clinic_id() as user_clinic_id,
  cb.clinic_id = public.get_user_clinic_id() as should_match,
  cb.branch_name as name,
  'RLS condition test' as description
FROM public.clinic_branches cb;

-- 6. 현재 적용된 RLS 정책 확인
SELECT
  policyname,
  cmd,
  qual as using_expression,
  with_check as check_expression
FROM pg_policies
WHERE tablename = 'clinic_branches'
ORDER BY cmd, policyname;

-- 7. 함수 존재 및 속성 확인
SELECT
  routine_name,
  routine_type,
  security_type,
  is_deterministic,
  routine_definition
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_user_clinic_id', 'get_user_role')
ORDER BY routine_name;
