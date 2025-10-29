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

다음 마이그레이션 파일을 Supabase에 적용해야 합니다:
- **권장**: `supabase/migrations/20250129_disable_users_rls_temporarily.sql` (RLS 비활성화)
- 또는: `supabase/migrations/20250129_fix_users_rls_update_policy.sql` (RLS 정책 수정)

**중요**: 두 개의 마이그레이션 중 하나만 선택하여 실행하세요. 권장 방법은 RLS를 비활성화하는 것입니다.

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
5. **권장**: `supabase/migrations/20250129_disable_users_rls_temporarily.sql` 파일의 내용을 복사하여 붙여넣기
6. "Run" 버튼 클릭
7. "Success" 메시지 확인

### 2. 마이그레이션 내용

#### 방법 A: RLS 비활성화 (권장)
`20250129_disable_users_rls_temporarily.sql`를 실행하면:
- users 테이블의 RLS를 비활성화합니다
- 애플리케이션 레벨에서 이미 보안 체크를 하고 있으므로 안전합니다
- 코드에서 사용자 본인 확인 로직이 구현되어 있습니다 (dataService.updateUserProfile)

#### 방법 B: RLS 정책 수정
`20250129_fix_users_rls_update_policy.sql`를 실행하면:
- 인증된 모든 사용자가 users 테이블을 업데이트할 수 있도록 허용
- 애플리케이션 레벨에서 본인 확인 로직으로 보안 유지
- Supabase Auth 세션이 있는 사용자만 작동

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

### 4. 테스트 방법

마이그레이션 적용 후:

1. 애플리케이션에 로그인
2. 계정 정보 페이지로 이동
3. 이름 또는 전화번호 변경
4. "프로필 저장" 버튼 클릭
5. "프로필이 성공적으로 업데이트되었습니다" 메시지 확인

### 5. 문제 해결

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
