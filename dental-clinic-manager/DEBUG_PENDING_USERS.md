# 승인 대기 목록 미표시 문제 디버깅 가이드

## 🔍 문제 상황

- DB에서 status='pending'인 사용자 존재
- 병원 관리 → 회원보기에서는 "승인대기" 표시
- 승인 대기 목록에는 표시되지 않음

## 📋 디버깅 절차

### 1단계: Chrome DevTools로 콘솔 로그 확인

1. **마스터 페이지 접속**
   - 브라우저에서 마스터 페이지 열기
   - F12 → Console 탭 열기

2. **콘솔 로그 확인**
   ```
   [Master] Loading data...
   [Master] Clinics result: {...}
   [Master] Users result: {...}
   [Master] Total users loaded: X
   [Master] All users: [...]
   [Master] Users by status: { pending: X, active: Y, ... }
   [Master] Pending users: X
   [Master] Pending users details: [...]
   ```

3. **확인 사항:**
   - `Total users loaded`: 전체 사용자 수
   - `Users by status`: 각 상태별 사용자 수
   - `Pending users details`: 실제 pending 사용자 목록

### 2단계: Network 탭에서 API 응답 확인

1. **Network 탭 열기**
   - F12 → Network 탭
   - Fetch/XHR 필터 클릭

2. **마스터 페이지 새로고침**

3. **`/api/admin/users` 요청 클릭**
   - Response 탭 확인
   - 해당 사용자가 응답에 포함되어 있는지 확인
   - status 값이 정확한지 확인

### 3단계: 데이터베이스 직접 확인

**Supabase Dashboard → SQL Editor:**

```sql
-- 1. pending 사용자 확인
SELECT
  id,
  email,
  name,
  role,
  status,
  clinic_id,
  created_at
FROM public.users
WHERE status = 'pending'
ORDER BY created_at DESC;

-- 2. clinic 관계 확인
SELECT
  u.id,
  u.email,
  u.name,
  u.status,
  u.clinic_id,
  c.name as clinic_name,
  c.status as clinic_status
FROM public.users u
LEFT JOIN public.clinics c ON u.clinic_id = c.id
WHERE u.status = 'pending';

-- 3. Admin API와 동일한 쿼리 실행
SELECT
  u.*,
  c.name as clinic_name
FROM public.users u
LEFT JOIN public.clinics c ON u.clinic_id = c.id
ORDER BY u.created_at DESC;
```

---

## 🐛 가능한 문제 시나리오

### 시나리오 A: Admin API가 해당 사용자를 반환하지 않음

**증상:**
- 콘솔 로그: `Total users loaded: X` (예상보다 적음)
- Network 탭: 해당 사용자가 응답에 없음

**원인:**
- `clinic:clinics(name)` 관계 쿼리가 INNER JOIN처럼 동작
- clinic_id가 null이거나 존재하지 않는 clinic 참조

**해결:**
```sql
-- Admin API 쿼리 수정 (src/app/api/admin/users/route.ts)
-- BEFORE:
.select(`*, clinic:clinics(name)`)

-- AFTER:
.select('*')
-- 또는
.select(`
  *,
  clinic:clinics!left(name)
`)
```

### 시나리오 B: status 값이 실제로는 'pending'이 아님

**증상:**
- 콘솔 로그: `Users by status`에서 pending: 0
- DB 확인: status='pending' 사용자 존재
- Network 탭: status가 'active' 또는 다른 값

**원인:**
- RPC 함수가 구버전 (status='active'로 설정)
- 또는 다른 곳에서 status 변경

**해결:**
1. `FIX_SIGNUP_APPROVAL_BYPASS.md` 가이드 따라 RPC 함수 업데이트
2. 기존 사용자 status 수정

### 시나리오 C: 필터링 로직 오류

**증상:**
- 콘솔 로그: `Total users loaded: X` (정상)
- `Users by status`: pending > 0
- `Pending users`: 0 (다름!)

**원인:**
- status 값의 공백 또는 특수문자
- 대소문자 문제 ('PENDING', 'Pending' 등)

**해결:**
```typescript
// 필터링 로직 수정
const pending = allUsers.filter((u: any) =>
  u.status?.trim().toLowerCase() === 'pending'
)
```

### 시나리오 D: clinic_id 문제

**증상:**
- DB 확인: clinic_id가 null
- 회원보기: 특정 clinic_id로 조회하면 표시됨

**원인:**
- 회원가입 시 clinic_id 할당 실패
- RPC 함수에서 clinic_id 설정 누락

**해결:**
- `create_clinic_with_owner` RPC 함수 확인
- 사용자의 clinic_id 수동 업데이트

---

## 🔧 문제별 해결 방법

### 해결 1: Admin API 수정

**파일:** `src/app/api/admin/users/route.ts`

**라인 47-53 수정:**

```typescript
// BEFORE
const { data: publicUsers, error: publicError } = await supabase
  .from('users')
  .select(`
    *,
    clinic:clinics(name)
  `)
  .order('created_at', { ascending: false })

// AFTER (옵션 1: clinic 제거)
const { data: publicUsers, error: publicError } = await supabase
  .from('users')
  .select('*')
  .order('created_at', { ascending: false })

// AFTER (옵션 2: LEFT JOIN 명시)
const { data: publicUsers, error: publicError } = await supabase
  .from('users')
  .select(`
    *,
    clinic:clinics!left(name)
  `)
  .order('created_at', { ascending: false })

// AFTER (옵션 3: 별도 쿼리로 병합)
const { data: publicUsers } = await supabase
  .from('users')
  .select('*')
  .order('created_at', { ascending: false })

const { data: clinicsData } = await supabase
  .from('clinics')
  .select('id, name')

const usersWithClinics = publicUsers.map(user => ({
  ...user,
  clinic: clinicsData.find(c => c.id === user.clinic_id)
}))
```

### 해결 2: 필터링 로직 강화

**파일:** `src/app/master/page.tsx`

**라인 115 수정:**

```typescript
// BEFORE
const pending = allUsers.filter((u: any) => u.status === 'pending')

// AFTER
const pending = allUsers.filter((u: any) => {
  const status = u.status?.trim().toLowerCase()
  return status === 'pending'
})
```

### 해결 3: 데이터베이스 사용자 수정

**Supabase Dashboard → SQL Editor:**

```sql
-- 특정 사용자의 clinic_id 수정
UPDATE public.users
SET clinic_id = (
  SELECT id FROM public.clinics
  WHERE email = '사용자가_가입한_병원_이메일@example.com'
  LIMIT 1
)
WHERE id = '사용자-UUID'
  AND clinic_id IS NULL;

-- 또는 status 수정
UPDATE public.users
SET status = 'pending'
WHERE id = '사용자-UUID'
  AND status != 'pending';
```

---

## ✅ 체크리스트

### 디버깅
- [ ] Chrome DevTools Console 로그 확인
- [ ] Network 탭에서 `/api/admin/users` 응답 확인
- [ ] 데이터베이스에서 직접 쿼리 실행

### 문제 파악
- [ ] 해당 사용자가 API 응답에 포함되는지 확인
- [ ] status 값이 정확한지 확인
- [ ] clinic_id가 올바른지 확인

### 해결
- [ ] Admin API 수정 (필요 시)
- [ ] 필터링 로직 수정 (필요 시)
- [ ] 데이터베이스 데이터 수정 (필요 시)

### 검증
- [ ] 마스터 페이지에서 승인 대기 목록 표시 확인
- [ ] 신규 회원가입 테스트
- [ ] 승인 프로세스 전체 테스트

---

## 📝 다음 단계

1. **디버그 로그 확인** (즉시)
   - 마스터 페이지 접속
   - F12 → Console
   - 로그 복사하여 분석

2. **문제 원인 파악** (5분)
   - 시나리오 A, B, C, D 중 어디에 해당하는지 확인

3. **해결 방법 적용** (10분)
   - 해당 시나리오의 해결 방법 적용

4. **검증** (5분)
   - 승인 대기 목록 표시 확인

---

**마지막 업데이트:** 2025-11-19
