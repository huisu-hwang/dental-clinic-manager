# 프로필 업데이트 오류 수정 마이그레이션 가이드

## 문제 설명
사용자가 계정 정보(이름, 전화번호)를 업데이트하려고 할 때 "프로필 업데이트 중 오류가 발생했습니다"라는 오류가 발생하는 문제가 있었습니다.

## 원인
이 시스템은 **하이브리드 인증 방식**을 사용합니다:
1. 새로운 사용자: Supabase Auth로 가입 (auth.uid() 사용 가능)
2. 기존 사용자: users 테이블에만 존재 (auth.uid() 반환 불가)

Supabase의 `users` 테이블에 대한 Row Level Security (RLS) 정책이 `auth.uid()`를 기반으로 작동하는데, 기존 사용자들은 Supabase Auth 세션이 없어서 UPDATE가 실패했습니다.

## 해결 방법

### 1. 마이그레이션 파일 적용

세 가지 방법이 있으며, **방법 A가 가장 안전하고 권장됩니다**:

- **✅ 방법 A (최고 권장)**: `20250129_secure_profile_update_function.sql`
  - Database Function을 사용한 보안 업데이트
  - RLS 유지 + 함수 내부 권한 체크
  - 클라이언트 우회 불가능
  - **가장 안전한 방법**

- **⚠️ 방법 B (임시 해결책)**: `20250129_disable_users_rls_temporarily.sql`
  - RLS 비활성화
  - 빠른 적용 가능
  - **보안 위험 있음** (SECURITY_ANALYSIS.md 참조)

- **🔶 방법 C (하이브리드)**: `20250129_fix_users_rls_update_policy.sql`
  - RLS 정책 수정
  - Supabase Auth 세션 필요

#### Supabase CLI를 사용하는 경우:

```bash
cd dental-clinic-manager
supabase db push
```

#### Supabase Dashboard를 사용하는 경우:

1. Supabase Dashboard에 로그인
2. 프로젝트 선택
3. 좌측 메뉴에서 "SQL Editor" 선택
4. "New query" 클릭
5. **최고 권장**: `supabase/migrations/20250129_secure_profile_update_function.sql` 파일의 내용을 복사하여 붙여넣기
6. "Run" 버튼 클릭
7. "Success. No rows returned" 메시지 확인

### 2. 마이그레이션 내용

#### ✅ 방법 A: Database Function (최고 권장)
`20250129_secure_profile_update_function.sql`를 실행하면:
- `update_own_profile()` 함수 생성 (SECURITY DEFINER)
- RLS를 유지하면서도 안전한 업데이트 가능
- 함수 내부에서 권한 체크 (데이터베이스 레벨)
- 클라이언트에서 우회 불가능
- 감사 로그 자동 기록

**보안 구조:**
```
클라이언트 → supabase.rpc('update_own_profile') → Database Function
                                                    ↓
                                             권한 체크 (DB)
                                                    ↓
                                             UPDATE users
```

#### ⚠️ 방법 B: RLS 비활성화 (보안 위험)
`20250129_disable_users_rls_temporarily.sql`를 실행하면:
- users 테이블의 RLS를 완전히 비활성화
- 애플리케이션 레벨 보안에만 의존
- **보안 위험 상세 내역은 SECURITY_ANALYSIS.md 참조**
- 프로덕션 환경에서는 권장하지 않음

#### 🔶 방법 C: RLS 정책 수정 (하이브리드)
`20250129_fix_users_rls_update_policy.sql`를 실행하면:
- 인증된 사용자의 UPDATE 허용
- Supabase Auth 세션이 있어야 작동
- 기존 사용자는 여전히 문제 발생 가능

### 3. 변경된 코드

#### `/src/lib/authService.ts`
- `login` 함수에 Supabase Auth 세션 생성 로직 추가
- 하이브리드 인증 지원: Supabase Auth 실패 시 커스텀 인증으로 폴백
- 상세한 로깅 추가

#### `/src/lib/dataService.ts`
- `updateUserProfile` 함수에 더 상세한 에러 로깅 추가
- 인증 상태 확인 로직 추가
- 본인 확인 로직 추가 (사용자는 자신의 프로필만 수정 가능)

#### `/src/components/Management/AccountProfile.tsx`
- 에러 메시지를 더 구체적으로 표시하도록 개선
- 상세한 로깅 추가

### 4. 추가 마이그레이션 (필수!)

로그인 후 "프로필 정보를 불러오는 데 실패했습니다" 오류가 발생하는 경우:

**원인**: SELECT RLS 정책의 순환 참조 문제

**해결**: `20250129_fix_select_policy_circular_reference.sql` 실행

```sql
-- 아래 SQL을 Supabase SQL Editor에서 실행하세요
DROP POLICY IF EXISTS "Users can view colleagues in same clinic" ON users;

CREATE POLICY "Users can view profiles" ON users
  FOR SELECT USING (
    id = auth.uid()
    OR
    (
      auth.uid() IS NOT NULL
      AND clinic_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
        AND u.clinic_id = users.clinic_id
      )
    )
    OR
    (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
        AND u.role = 'master_admin'
      )
    )
    OR
    auth.uid() IS NULL
  );
```

### 5. 테스트 방법

모든 마이그레이션 적용 후:

1. **로그인 테스트**
   - 로그아웃 후 다시 로그인
   - 정상적으로 로그인되는지 확인
   - "프로필 정보를 불러오는 데 실패" 오류가 없는지 확인

2. **프로필 업데이트 테스트**
   - 계정 정보 페이지로 이동
   - 이름 또는 전화번호 변경
   - "프로필 저장" 버튼 클릭
   - "프로필이 성공적으로 업데이트되었습니다" 메시지 확인

### 6. 문제 해결

만약 여전히 오류가 발생한다면:

1. **브라우저 콘솔 확인**
   - F12를 눌러 개발자 도구 열기
   - Console 탭에서 `[updateUserProfile]`로 시작하는 로그 확인
   - 오류 메시지를 확인하여 구체적인 원인 파악

2. **Supabase RLS 정책 확인**
   - Supabase Dashboard → Authentication → Policies
   - `users` 테이블의 정책이 제대로 적용되었는지 확인

3. **세션 확인**
   - 로그아웃 후 다시 로그인
   - 브라우저 캐시 및 쿠키 삭제

## 추가 정보

### RLS 정책 확인 쿼리

Supabase SQL Editor에서 다음 쿼리로 현재 RLS 정책을 확인할 수 있습니다:

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'users';
```

### 관련 이슈

- 사용자 프로필 업데이트 실패
- RLS 정책 누락
- UPDATE 권한 없음

---

**작성일**: 2025-01-29
**작성자**: Claude Code Assistant
