-- ============================================
-- users 테이블의 RLS 상태 확인
-- ============================================

-- 1. users 테이블의 RLS 활성화 여부 확인
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'users';

-- 2. users 테이블의 RLS 정책 확인
SELECT
  policyname,
  cmd,
  roles,
  qual as using_expression,
  with_check as check_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'users'
ORDER BY cmd, policyname;
