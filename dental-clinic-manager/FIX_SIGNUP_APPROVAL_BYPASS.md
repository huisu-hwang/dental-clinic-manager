# 회원가입 승인 우회 문제 해결 가이드

## 🚨 문제 상황

- 신규 대표원장 가입 시 마스터 승인 없이 로그인 가능
- 마스터 계정에서 승인 대기 목록에 표시되지 않음
- 병원은 활성 상태로 자동 생성됨

## 🔍 근본 원인

**Supabase 데이터베이스에 `create_clinic_with_owner` RPC 함수의 최신 버전이 적용되지 않음**

- **구버전:** users.status = 'active' (즉시 로그인 가능)
- **신버전:** users.status = 'pending' (마스터 승인 필요)

---

## 📋 1단계: 현재 상태 확인

### Supabase Dashboard → SQL Editor

**1.1 RPC 함수 현재 버전 확인:**

```sql
-- RPC 함수의 소스 코드 확인
SELECT
  proname as function_name,
  prosrc as source_code
FROM pg_proc
WHERE proname = 'create_clinic_with_owner';
```

**확인 사항:**
- `VALUES` 절에서 8번째 값이 `'pending'`인지 확인
- `'active'`로 되어 있다면 → 구버전 (수정 필요)
- `'pending'`으로 되어 있다면 → 신버전 (정상)

**1.2 최근 가입한 사용자 status 확인:**

```sql
-- 최근 7일간 가입한 사용자 조회
SELECT
  au.id,
  au.email,
  au.created_at as auth_created_at,
  au.email_confirmed_at,
  pu.name,
  pu.role,
  pu.status,
  pu.created_at as profile_created_at,
  c.name as clinic_name
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
LEFT JOIN public.clinics c ON pu.clinic_id = c.id
WHERE au.created_at > NOW() - INTERVAL '7 days'
ORDER BY au.created_at DESC;
```

**확인 사항:**
- status 컬럼이 'active'인 사용자가 있는지 확인
- 'active'이면 → 구버전 RPC로 생성됨

---

## 📋 2단계: RPC 함수 업데이트

### Supabase Dashboard → SQL Editor → New Query

**아래 전체 SQL을 복사하여 붙여넣고 RUN 클릭:**

```sql
-- Drop old function versions
DROP FUNCTION IF EXISTS public.create_clinic_with_owner(
  text, text, text, text, text,
  text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.create_clinic_with_owner(
  uuid, text, text, text, text, text,
  text, text, text, text, text
);

-- Create updated SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.create_clinic_with_owner(
  p_user_id uuid,
  p_clinic_name text,
  p_owner_name text,
  p_clinic_address text,
  p_clinic_phone text,
  p_clinic_email text,
  p_user_name text,
  p_user_email text,
  p_user_phone text,
  p_user_address text,
  p_resident_number text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_result json;
BEGIN
  -- 1. Insert clinic
  INSERT INTO clinics (name, owner_name, address, phone, email)
  VALUES (p_clinic_name, p_owner_name, p_clinic_address, p_clinic_phone, p_clinic_email)
  RETURNING id INTO v_clinic_id;

  -- 2. Insert user profile with 'pending' status
  INSERT INTO users (
    id,
    name,
    email,
    phone,
    address,
    resident_registration_number,
    role,
    clinic_id,
    status
  )
  VALUES (
    p_user_id,
    p_user_name,
    p_user_email,
    p_user_phone,
    p_user_address,
    p_resident_number,
    'owner',
    v_clinic_id,
    'pending'  -- ⚠️ 핵심: 승인 대기 상태로 생성
  );

  -- 3. Return result
  v_result := json_build_object(
    'clinic_id', v_clinic_id,
    'user_id', p_user_id,
    'success', true
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Clinic creation failed: %', SQLERRM;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.create_clinic_with_owner(
  uuid, text, text, text, text, text,
  text, text, text, text, text
) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.create_clinic_with_owner IS
'Creates a new clinic and owner user in a single transaction.
Uses SECURITY DEFINER to bypass RLS policies during signup.
Sets user status to pending for master approval.';
```

**성공 메시지 확인:**
```
Success. No rows returned
```

---

## 📋 3단계: 기존 사용자 수정 (필요 시)

**문제가 있는 사용자(status='active')를 'pending'으로 변경:**

### 3.1 수정 대상 확인

```sql
-- role='owner'이고 status='active'인 사용자 조회
-- (이메일 인증 완료했지만 마스터 승인 안 받은 사용자)
SELECT
  id,
  email,
  name,
  role,
  status,
  created_at
FROM public.users
WHERE role = 'owner'
  AND status = 'active'
  AND created_at > NOW() - INTERVAL '7 days';  -- 최근 7일
```

### 3.2 수정 실행

```sql
-- ⚠️ 주의: 실제 사용자 ID로 교체하세요
UPDATE public.users
SET status = 'pending'
WHERE id = '실제-사용자-UUID'  -- 위 쿼리에서 확인한 ID
  AND role = 'owner'
  AND status = 'active';

-- 수정된 행 수 확인
-- 예: UPDATE 1
```

**또는 일괄 수정 (최근 7일 내 가입한 모든 owner):**

```sql
-- ⚠️ 주의: 기존 정상 사용자도 영향받을 수 있음
-- 실행 전 반드시 위 SELECT로 확인 후 실행
UPDATE public.users
SET status = 'pending'
WHERE role = 'owner'
  AND status = 'active'
  AND created_at > NOW() - INTERVAL '7 days'
RETURNING id, email, name;  -- 수정된 사용자 목록 반환
```

---

## 📋 4단계: 검증

### 4.1 RPC 함수 검증

```sql
-- RPC 함수가 올바르게 업데이트되었는지 확인
SELECT
  proname,
  CASE
    WHEN prosrc LIKE '%''pending''%' THEN 'OK - pending 설정됨'
    ELSE 'ERROR - pending 없음'
  END as status_check
FROM pg_proc
WHERE proname = 'create_clinic_with_owner';
```

**예상 결과:**
```
function_name              | status_check
---------------------------+----------------------
create_clinic_with_owner   | OK - pending 설정됨
```

### 4.2 사용자 status 검증

```sql
-- 최근 생성된 사용자들의 status 확인
SELECT
  role,
  status,
  COUNT(*) as count
FROM public.users
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY role, status
ORDER BY role, status;
```

**예상 결과 (수정 후):**
```
role   | status   | count
-------+----------+-------
owner  | pending  | 1
staff  | active   | 3
```

### 4.3 마스터 페이지 확인

1. **마스터 계정 로그인**
2. **Master Dashboard 접속**
3. **"승인 대기 중인 회원" 섹션 확인**
4. **수정한 사용자가 목록에 표시되는지 확인**

### 4.4 로그인 차단 확인

1. **문제가 있던 사용자 계정으로 로그인 시도**
2. **예상 결과:**
   ```
   승인 대기 중입니다. 관리자의 승인을 기다려주세요.
   ```
3. **로그인 차단 확인** ✅

---

## 📋 5단계: 신규 회원가입 테스트

### 5.1 테스트 시나리오

1. **신규 대표원장 회원가입**
   - 병원 정보 입력
   - 사용자 정보 입력
   - 회원가입 완료

2. **이메일 인증**
   - 이메일 수신 확인
   - 인증 링크 클릭

3. **로그인 시도**
   - **예상 결과:** "승인 대기 중입니다" 메시지
   - **실제 결과 확인**

4. **마스터 페이지 확인**
   - 승인 대기 목록에 표시되는지 확인

5. **승인 후 로그인**
   - 마스터가 승인
   - 로그인 성공 확인

---

## ✅ 체크리스트

### RPC 함수 업데이트
- [ ] 1단계: 현재 RPC 함수 버전 확인
- [ ] 2단계: RPC 함수 업데이트 SQL 실행
- [ ] 검증: `'pending'` 설정 확인

### 기존 사용자 수정
- [ ] 3.1: 수정 대상 사용자 조회
- [ ] 3.2: status='pending'으로 변경
- [ ] 검증: 사용자 목록에서 pending 확인

### 마스터 페이지 확인
- [ ] 4.3: 승인 대기 목록에 표시 확인
- [ ] 4.4: 로그인 차단 확인

### 신규 회원가입 테스트
- [ ] 5.1: 회원가입 → 이메일 인증
- [ ] 5.2: 로그인 차단 확인
- [ ] 5.3: 마스터 승인 후 로그인 성공

---

## 🐛 트러블슈팅

### Q: RPC 함수 업데이트 후에도 여전히 active로 생성됨
**A:** 브라우저 캐시 문제일 수 있습니다.
```sql
-- Supabase 연결 풀 리셋
SELECT pg_reload_conf();

-- 또는 Supabase Dashboard에서 프로젝트 재시작
```

### Q: 마스터 페이지에서 여전히 안 보임
**A:** Admin API가 캐시를 사용하고 있을 수 있습니다.
- 브라우저 캐시 클리어 (Ctrl+Shift+R)
- 마스터 페이지 새로고침

### Q: 기존 사용자 수정이 안 됨
**A:** RLS 정책 때문일 수 있습니다.
```sql
-- SERVICE_ROLE_KEY로 직접 수정
-- Supabase Dashboard의 SQL Editor는 자동으로 SERVICE_ROLE 사용
```

---

## 📚 관련 파일

- **마이그레이션:** `supabase/migrations/20251117_create_clinic_with_owner.sql`
- **회원가입 폼:** `src/components/Auth/SignupForm.tsx` (Line 224-244)
- **로그인 검증:** `src/components/Auth/LoginForm.tsx` (Line 162-178)
- **Auth 컨텍스트:** `src/contexts/AuthContext.tsx` (Line 148-169)
- **마스터 페이지:** `src/app/master/page.tsx` (Line 88-99)

---

## 📝 작업 완료 후

- [ ] 이 가이드 문서 보관
- [ ] WORK_LOG.md에 작업 내용 기록
- [ ] 다음 배포 시 마이그레이션 자동 적용 확인

---

**마지막 업데이트:** 2025-11-19
