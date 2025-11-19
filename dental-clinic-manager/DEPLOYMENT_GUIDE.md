# 가입 승인 이메일 배포 가이드

## 🎯 개요
Supabase Edge Functions + Database Trigger를 사용한 승인 이메일 자동 발송 시스템 배포 가이드입니다.

---

## 📋 1단계: Database Trigger 적용

### 1.1 SQL Editor 접속
1. Supabase Dashboard 접속: https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql
2. **New Query** 클릭

### 1.2 SQL 실행
아래 SQL을 복사하여 붙여넣고 **RUN** 클릭:

```sql
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
BEGIN
  -- status가 pending에서 active로 변경된 경우만 처리
  IF OLD.status = 'pending' AND NEW.status = 'active' THEN
    -- Edge Function URL 설정
    function_url := 'https://beahjntkmkfhpcbhfnrr.supabase.co/functions/v1/send-approval-email';

    -- 요청 페이로드 생성
    request_payload := json_build_object(
      'userId', NEW.id,
      'clinicId', NEW.clinic_id
    );

    -- Edge Function 호출 (비동기)
    BEGIN
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
```

### 1.3 검증
SQL Editor에서 다음 쿼리로 Trigger 생성 확인:

```sql
SELECT
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'users_approval_notification_trigger';
```

✅ 결과가 나오면 성공!

---

## 📋 2단계: Edge Function 배포

### 방법 A: Supabase Dashboard (수동)

#### 2.1 Edge Functions 페이지 접속
https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/functions

#### 2.2 새 함수 생성
1. **"Create a new function"** 클릭
2. Function name: `send-approval-email`
3. **"Create function"** 클릭

#### 2.3 코드 작성
Dashboard의 코드 에디터에 다음 코드 붙여넣기:

```typescript
// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { Resend } from 'npm:resend@4.0.0'

console.log("[send-approval-email] Edge Function initialized")

Deno.serve(async (req) => {
  try {
    // 환경 변수 확인
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL') || 'https://hi-clinic.co.kr'

    if (!resendApiKey) {
      console.error("[send-approval-email] Missing RESEND_API_KEY")
      return new Response(
        JSON.stringify({ error: 'Missing RESEND_API_KEY' }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error("[send-approval-email] Missing Supabase credentials")
      return new Response(
        JSON.stringify({ error: 'Missing Supabase credentials' }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    // 요청 바디에서 userId, clinicId 추출
    const { userId, clinicId } = await req.json()

    if (!userId || !clinicId) {
      console.error("[send-approval-email] Missing userId or clinicId")
      return new Response(
        JSON.stringify({ error: 'userId and clinicId are required' }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log(`[send-approval-email] Processing approval for user: ${userId}, clinic: ${clinicId}`)

    // Supabase 클라이언트 생성 (SERVICE_ROLE_KEY 사용)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // 사용자 정보 조회 (이메일 발송용)
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('email, name, clinics(name)')
      .eq('id', userId)
      .eq('clinic_id', clinicId)
      .single()

    if (fetchError || !userData) {
      console.error("[send-approval-email] Error fetching user:", fetchError)
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log(`[send-approval-email] User data fetched:`, userData.email)

    // Resend 클라이언트 생성
    const resend = new Resend(resendApiKey)
    const clinicName = (userData.clinics as any)?.name || '덴탈매니저'

    // 승인 완료 이메일 발송
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'DentalManager <noreply@hi-clinic.co.kr>',
      to: [userData.email],
      subject: `[${clinicName}] 회원가입 승인 완료`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #2563eb;">회원가입 승인 완료</h2>
          <p>안녕하세요, <strong>${userData.name}</strong>님!</p>
          <p><strong>${clinicName}</strong>의 회원가입이 승인되었습니다.</p>
          <p>이제 덴탈매니저의 모든 기능을 사용하실 수 있습니다.</p>
          <div style="margin: 30px 0;">
            <a href="${appUrl}"
               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              로그인하러 가기
            </a>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          <p style="color: #6b7280; font-size: 14px;">
            문의사항이 있으시면 병원 관리자에게 연락해 주세요.
          </p>
        </div>
      `
    })

    if (emailError) {
      console.error("[send-approval-email] Error sending email:", emailError)
      return new Response(
        JSON.stringify({ error: 'Failed to send email', details: emailError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    console.log("[send-approval-email] Email sent successfully:", emailData)

    return new Response(
      JSON.stringify({ success: true, emailData }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (error: unknown) {
    console.error("[send-approval-email] Unexpected error:", error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})
```

#### 2.4 Deploy 클릭

---

### 방법 B: Supabase CLI (자동)

```bash
# 1. Supabase CLI 설치 (이미 설치되어 있으면 생략)
npm install -g supabase

# 2. 로그인
supabase login

# 3. 프로젝트 연결
supabase link --project-ref beahjntkmkfhpcbhfnrr

# 4. Secrets 설정
supabase secrets set RESEND_API_KEY=re_2sP8DYoc_4x6LYMyJiJu9adXUsD9XGMHs
supabase secrets set NEXT_PUBLIC_APP_URL=https://hi-clinic.co.kr

# 5. Edge Function 배포
supabase functions deploy send-approval-email

# 6. Database Migration 적용
supabase db push
```

---

## 📋 3단계: 환경 변수 설정

### 3.1 Secrets 설정
Supabase Dashboard → Settings → Edge Functions → Secrets

**추가할 Secrets:**
- `RESEND_API_KEY`: `re_2sP8DYoc_4x6LYMyJiJu9adXUsD9XGMHs`
- `NEXT_PUBLIC_APP_URL`: `https://hi-clinic.co.kr`

> 참고: `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`는 자동으로 주입됩니다.

---

## 📋 4단계: 테스트

### 4.1 Edge Function 직접 테스트

Supabase Dashboard → Edge Functions → send-approval-email → Test

**요청 Body:**
```json
{
  "userId": "실제-사용자-UUID",
  "clinicId": "실제-병원-UUID"
}
```

### 4.2 실제 시나리오 테스트

1. **신규 사용자 회원가입**
2. **Admin Dashboard에서 사용자 승인**
3. **이메일 수신 확인**

### 4.3 로그 확인

**Edge Function 로그:**
- Supabase Dashboard → Edge Functions → send-approval-email → Logs

**Database 로그:**
- Supabase Dashboard → Logs → PostgreSQL Logs

**확인 항목:**
```
[send-approval-email] Edge Function initialized
[send-approval-email] Processing approval for user: xxx, clinic: xxx
[send-approval-email] User data fetched: user@example.com
[send-approval-email] Email sent successfully
```

---

## ✅ 체크리스트

### Database Trigger
- [ ] SQL 실행 완료
- [ ] Trigger 생성 확인 쿼리 성공
- [ ] `information_schema.triggers`에 트리거 존재

### Edge Function
- [ ] 함수 생성 완료
- [ ] 코드 붙여넣기 완료
- [ ] Deploy 성공

### 환경 변수
- [ ] RESEND_API_KEY 설정
- [ ] NEXT_PUBLIC_APP_URL 설정

### 테스트
- [ ] Edge Function 직접 테스트 성공
- [ ] 실제 승인 시나리오 테스트 성공
- [ ] 이메일 수신 확인

---

## 🐛 트러블슈팅

### 에러: "Missing RESEND_API_KEY"
**원인:** Secrets가 설정되지 않음
**해결:** Dashboard → Settings → Edge Functions → Secrets에서 설정

### 에러: "User not found"
**원인:** userId 또는 clinicId가 잘못됨
**해결:** 실제 데이터베이스의 UUID 사용

### 이메일이 발송되지 않음
**원인:** Resend API 키가 잘못되었거나, 발신 도메인이 인증되지 않음
**해결:**
1. Resend Dashboard에서 API 키 확인
2. `noreply@hi-clinic.co.kr` 도메인 인증 확인

### Trigger가 실행되지 않음
**원인:** Trigger SQL이 정확히 실행되지 않음
**해결:** SQL Editor에서 Trigger 확인 쿼리 실행

---

## 📚 참고 자료

- [Supabase Edge Functions 공식 문서](https://supabase.com/docs/guides/functions)
- [Database Triggers 공식 문서](https://supabase.com/docs/guides/database/postgres/triggers)
- [Resend API 문서](https://resend.com/docs)

---

**마지막 업데이트:** 2025-11-19
