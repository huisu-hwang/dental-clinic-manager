/**
 * Database Trigger for Approval Email Notification
 *
 * @description
 * users 테이블에서 status가 'pending'에서 'active'로 변경될 때
 * 자동으로 Edge Function을 호출하여 승인 완료 이메일을 발송합니다.
 *
 * @requires
 * - Supabase Edge Function: send-approval-email
 * - Database Webhooks: Enabled
 */

-- 1. Edge Function 호출 함수 생성
CREATE OR REPLACE FUNCTION notify_user_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  function_url TEXT;
  request_payload JSON;
  service_role_key TEXT;
BEGIN
  -- status가 pending에서 active로 변경된 경우만 처리
  IF OLD.status = 'pending' AND NEW.status = 'active' THEN

    -- Edge Function URL 설정
    -- 프로덕션: https://beahjntkmkfhpcbhfnrr.supabase.co/functions/v1/send-approval-email
    -- 로컬: http://host.docker.internal:54321/functions/v1/send-approval-email
    function_url := 'https://beahjntkmkfhpcbhfnrr.supabase.co/functions/v1/send-approval-email';

    -- 요청 페이로드 생성
    request_payload := json_build_object(
      'userId', NEW.id,
      'clinicId', NEW.clinic_id
    );

    -- Edge Function 호출 (비동기, 실패해도 사용자 승인은 성공)
    BEGIN
      -- Supabase Database Webhooks 사용
      PERFORM supabase_functions.http_request(
        function_url,
        'POST',
        '{"Content-Type":"application/json"}',
        request_payload::text,
        '5000'
      );

      RAISE LOG 'Approval email trigger fired for user: %, clinic: %', NEW.id, NEW.clinic_id;
    EXCEPTION
      WHEN OTHERS THEN
        -- 이메일 발송 실패해도 트리거는 성공으로 처리
        RAISE WARNING 'Failed to send approval email for user %: %', NEW.id, SQLERRM;
    END;

  END IF;

  RETURN NEW;
END;
$$;

-- 2. Trigger 생성
DROP TRIGGER IF EXISTS users_approval_notification_trigger ON public.users;

CREATE TRIGGER users_approval_notification_trigger
  AFTER UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION notify_user_approval();

-- 3. 트리거에 대한 주석 추가
COMMENT ON FUNCTION notify_user_approval() IS
'사용자 승인 시 자동으로 Edge Function을 호출하여 승인 완료 이메일을 발송합니다.';

COMMENT ON TRIGGER users_approval_notification_trigger ON public.users IS
'사용자 status가 pending에서 active로 변경될 때 승인 이메일을 발송합니다.';
