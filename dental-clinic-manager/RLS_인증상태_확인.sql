-- ============================================
-- 현재 인증 상태 확인용 RPC 함수
-- ============================================
-- 이 함수는 애플리케이션에서 호출하여
-- 실제 인증 컨텍스트를 확인할 수 있습니다
-- ============================================

-- 1. RPC 함수 생성
CREATE OR REPLACE FUNCTION public.debug_auth_context()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result json;
BEGIN
  SELECT json_build_object(
    'auth_uid', auth.uid(),
    'user_clinic_id', public.get_user_clinic_id(),
    'user_role', public.get_user_role(),
    'user_exists', EXISTS(SELECT 1 FROM public.users WHERE id = auth.uid()),
    'user_data', (
      SELECT json_build_object(
        'id', id,
        'clinic_id', clinic_id,
        'role', role,
        'name', name,
        'email', email
      )
      FROM public.users
      WHERE id = auth.uid()
    ),
    'branches_count', (
      SELECT COUNT(*)
      FROM public.clinic_branches
      WHERE clinic_id = public.get_user_clinic_id()
    ),
    'branches_visible_count', (
      SELECT COUNT(*)
      FROM public.clinic_branches
      -- RLS가 적용된 상태에서 보이는 개수
    ),
    'timestamp', NOW()
  ) INTO result;

  RETURN result;
END;
$$;

-- 2. 함수 권한 설정 (모든 인증된 사용자가 호출 가능)
GRANT EXECUTE ON FUNCTION public.debug_auth_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.debug_auth_context() TO anon;

-- 3. 테스트 (Supabase Dashboard에서는 auth.uid()가 null이므로 의미 없음)
-- 이 함수는 애플리케이션에서 호출해야 합니다.
SELECT public.debug_auth_context();
