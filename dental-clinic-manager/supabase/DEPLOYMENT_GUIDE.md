# Supabase Edge Functions 배포 가이드

## 📋 개요

승인 완료 이메일 발송 기능이 Supabase Edge Functions + Database Trigger 방식으로 구현되었습니다.

**구조:**
```
users 테이블 UPDATE (status: pending → active)
  ↓
Database Trigger 자동 감지
  ↓
Edge Function 호출 (send-approval-email)
  ↓
Resend API로 이메일 발송
```

## 🚀 배포 단계

### 1. Supabase CLI 로그인

```bash
npx supabase login
```

브라우저가 열리면 Supabase 계정으로 로그인하세요.

### 2. 프로젝트 링크

```bash
npx supabase link --project-ref beahjntkmkfhpcbhfnrr
```

### 3. Secrets 설정

Edge Function에서 사용할 환경 변수를 설정합니다.

```bash
# RESEND_API_KEY 설정 (필수)
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx

# NEXT_PUBLIC_APP_URL 설정 (선택 사항)
npx supabase secrets set NEXT_PUBLIC_APP_URL=https://hi-clinic.co.kr
```

**RESEND_API_KEY 획득 방법:**
1. [Resend 대시보드](https://resend.com/api-keys)에 로그인
2. API Keys → Create API Key
3. 생성된 키를 복사하여 위 명령어에 사용

**Secrets 확인:**
```bash
npx supabase secrets list
```

### 4. Edge Function 배포

```bash
npx supabase functions deploy send-approval-email
```

배포 완료 후 표시되는 URL:
```
https://beahjntkmkfhpcbhfnrr.supabase.co/functions/v1/send-approval-email
```

### 5. Database Migration 적용

```bash
npx supabase db push
```

이 명령은 `20251118_create_approval_email_trigger.sql` Migration을 적용하여:
- `notify_user_approval()` 함수 생성
- `users_approval_notification_trigger` 트리거 생성

### 6. 테스트

#### Supabase 대시보드에서 테스트

1. Supabase 대시보드 → Table Editor → `users` 테이블
2. status가 'pending'인 사용자 찾기
3. status를 'active'로 변경
4. 해당 사용자의 이메일로 승인 완료 메일 수신 확인

#### 로그 확인

**Edge Function 로그:**
```bash
npx supabase functions logs send-approval-email
```

**Database 로그 (트리거):**
- Supabase 대시보드 → Logs → PostgreSQL Logs

## 🔧 로컬 개발

### 로컬 Supabase 시작

```bash
npx supabase start
```

### 로컬 Secrets 설정

`.env` 파일 생성:
```env
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key
```

### 로컬 Edge Function 실행

```bash
npx supabase functions serve send-approval-email --env-file .env
```

### 로컬 테스트 요청

```bash
curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/send-approval-email' \
  --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' \
  --header 'Content-Type: application/json' \
  --data '{
    "userId": "user-uuid-here",
    "clinicId": "clinic-uuid-here"
  }'
```

## 📁 파일 구조

```
supabase/
├── functions/
│   └── send-approval-email/
│       └── index.ts              # Edge Function 코드
├── migrations/
│   └── 20251118_create_approval_email_trigger.sql  # Database Trigger
└── config.toml                   # Supabase 프로젝트 설정
```

## ⚙️ 환경 변수

| 변수명 | 필수 | 설명 | 기본값 |
|--------|------|------|--------|
| `RESEND_API_KEY` | ✅ | Resend API Key | - |
| `NEXT_PUBLIC_APP_URL` | ❌ | 앱 URL (이메일의 "로그인하러 가기" 링크) | `https://hi-clinic.co.kr` |
| `SUPABASE_URL` | ✅ (자동) | Supabase 프로젝트 URL | 자동 설정 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ (자동) | Service Role Key | 자동 설정 |

## 🐛 문제 해결

### Edge Function 배포 실패

**증상:**
```
Error: Failed to deploy function
```

**해결:**
1. 로그인 상태 확인: `npx supabase login`
2. 프로젝트 링크 확인: `npx supabase link --project-ref beahjntkmkfhpcbhfnrr`
3. 다시 배포: `npx supabase functions deploy send-approval-email`

### 이메일 발송 안 됨

**증상:**
- 트리거는 실행되지만 이메일이 발송되지 않음

**확인 사항:**
1. Secrets 설정 확인: `npx supabase secrets list`
2. RESEND_API_KEY가 올바른지 확인
3. Edge Function 로그 확인: `npx supabase functions logs send-approval-email`
4. Resend 대시보드에서 이메일 발송 로그 확인

### Database Trigger 실행 안 됨

**증상:**
- status를 변경해도 트리거가 실행되지 않음

**확인 사항:**
1. Migration 적용 확인: `npx supabase db push`
2. Supabase 대시보드 → Database → Functions에서 `notify_user_approval` 함수 존재 확인
3. Supabase 대시보드 → Database → Triggers에서 `users_approval_notification_trigger` 트리거 존재 확인

## 📞 참고 링크

- [Supabase Edge Functions 문서](https://supabase.com/docs/guides/functions)
- [Supabase Database Webhooks 문서](https://supabase.com/docs/guides/database/webhooks)
- [Resend 문서](https://resend.com/docs)
- [Supabase CLI 문서](https://supabase.com/docs/reference/cli/introduction)

## 🔄 롤백 방법

Migration을 롤백하려면:

```bash
# 트리거 및 함수 삭제
npx supabase db execute "DROP TRIGGER IF EXISTS users_approval_notification_trigger ON public.users; DROP FUNCTION IF EXISTS notify_user_approval();"
```

Edge Function 삭제:
- Supabase 대시보드 → Edge Functions → send-approval-email → Delete

## ✅ 체크리스트

- [ ] Supabase CLI 로그인 완료
- [ ] 프로젝트 링크 완료
- [ ] RESEND_API_KEY Secret 설정 완료
- [ ] Edge Function 배포 완료
- [ ] Database Migration 적용 완료
- [ ] 테스트 완료 (승인 시 이메일 수신 확인)
- [ ] 로그 확인 완료

---

**마지막 업데이트:** 2025-11-18
**작성자:** Claude Code
