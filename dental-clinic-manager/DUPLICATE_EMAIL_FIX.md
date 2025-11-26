# 중복 이메일 에러 수정 가이드

## 🔍 문제 상황

회원가입 시 다음 에러가 발생:
```
병원 정보 생성 실패: duplicate key value violates unique constraint "users_email_key"
```

## 📌 원인

1. **Supabase Auth (`auth.users`)** 와 **애플리케이션 DB (`public.users`)** 가 분리되어 있음
2. Supabase 대시보드에서 "계정 삭제"는 `auth.users`만 삭제하고, `public.users`는 남아있음
3. 회원가입 시 `public.users` 테이블의 email UNIQUE 제약조건에 걸림

## ✅ 해결 방법

### 방법 1: Supabase 대시보드에서 완전 삭제 (권장)

1. **Supabase 대시보드** 접속 → 프로젝트 선택
2. **Table Editor** → `users` 테이블 선택
3. 해당 이메일의 레코드를 찾아서 **완전히 삭제**
4. **Authentication** → Users에서도 해당 계정 삭제 확인

### 방법 2: SQL Editor에서 수동 삭제

Supabase 대시보드 → **SQL Editor** → 다음 쿼리 실행:

```sql
-- 1. public.users 테이블에서 해당 이메일 삭제
DELETE FROM public.users
WHERE email = 'your-email@example.com';

-- 2. auth.users 테이블에서도 확인 (필요시)
-- 참고: auth.users는 일반적으로 대시보드의 Authentication 메뉴에서 관리
```

### 방법 3: 새로운 마이그레이션 적용

수정된 RPC 함수를 데이터베이스에 적용:

```bash
# 로컬 개발 환경
cd dental-clinic-manager
npx supabase db reset --local

# 프로덕션 환경
# Supabase 대시보드 → SQL Editor에서 아래 파일 내용 복사/실행
# supabase/migrations/20251117_create_clinic_with_owner.sql
```

## 🛠️ 코드 수정 내역

### 1. RPC 함수 (`create_clinic_with_owner`) 개선

**파일**: `supabase/migrations/20251117_create_clinic_with_owner.sql`

**변경 사항**:
- ✅ 이메일 중복 체크 추가 (INSERT 전에 SELECT로 확인)
- ✅ 명확한 에러 메시지 제공
- ✅ `DUPLICATE_EMAIL` 에러 코드 추가

```sql
-- 0. Check if email already exists in users table
SELECT id INTO v_existing_user_id
FROM users
WHERE email = p_user_email
LIMIT 1;

IF v_existing_user_id IS NOT NULL THEN
  RAISE EXCEPTION 'DUPLICATE_EMAIL: 이미 사용 중인 이메일입니다. 다른 이메일을 사용하거나, 기존 계정의 데이터를 완전히 삭제한 후 다시 시도해주세요.';
END IF;
```

### 2. SignupForm 에러 처리 개선

**파일**: `src/components/Auth/SignupForm.tsx`

**변경 사항**:
- ✅ `DUPLICATE_EMAIL` 에러 감지 및 사용자 친화적 메시지 표시
- ✅ owner와 non-owner 회원가입 모두에 적용

```typescript
// Owner 회원가입
if (rpcError.message && rpcError.message.includes('DUPLICATE_EMAIL')) {
  const customMessage = rpcError.message.replace('DUPLICATE_EMAIL:', '').trim();
  throw new Error(customMessage || '이미 사용 중인 이메일입니다.');
}

// Non-owner 회원가입
if (userProfileError.message && (
  userProfileError.message.includes('duplicate key value violates unique constraint "users_email_key"') ||
  userProfileError.message.includes('DUPLICATE_EMAIL')
)) {
  throw new Error('이미 사용 중인 이메일입니다. 다른 이메일을 사용하거나, 기존 계정의 데이터를 완전히 삭제한 후 다시 시도해주세요.');
}
```

## 🎯 예방 조치

앞으로 이런 문제를 방지하려면:

1. **회원 탈퇴 기능 구현** 시:
   - `auth.users` 삭제
   - `public.users` 삭제
   - 관련 데이터 cascade 삭제 (clinics, 등)

2. **테스트 계정 생성** 시:
   - 테스트 전용 이메일 사용 (예: test+timestamp@example.com)
   - 테스트 후 반드시 완전 삭제

3. **개발 환경**:
   - 로컬 Supabase 사용 (`npx supabase start`)
   - 프로덕션 DB를 직접 건드리지 않기

## 📝 참고 사항

- `users` 테이블의 `email` 컬럼은 **전역 UNIQUE 제약조건**이 있습니다
- 같은 이메일로 여러 병원에 가입할 수 없는 구조입니다
- Multi-tenant 설계 변경이 필요하다면 별도 논의 필요

## 🔗 관련 파일

- `supabase/migrations/20251117_create_clinic_with_owner.sql` - RPC 함수
- `src/components/Auth/SignupForm.tsx` - 회원가입 폼
- `supabase/migrations/001_multi_tenant_schema.sql` - DB 스키마
