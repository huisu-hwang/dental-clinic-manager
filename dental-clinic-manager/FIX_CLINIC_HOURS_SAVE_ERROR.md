# 병원 진료시간 저장 오류 수정 가이드

## 문제 원인

병원 진료시간을 저장할 때 "저장에 실패했습니다" 또는 "저장 중..." 상태에서 멈추는 문제가 발생했습니다.

**근본 원인**: RLS (Row Level Security) 정책에 `WITH CHECK` 절이 누락되어 있어서 INSERT 작업이 실패합니다.

## 기술적 설명

`updateClinicHours` 함수는 다음과 같이 동작합니다:
1. 기존 데이터 DELETE (성공 - USING 절로 체크)
2. 새 데이터 INSERT (실패 - WITH CHECK 절 없음)

RLS 정책에서:
- `USING` 절: 기존 행을 읽거나 수정할 때 체크
- `WITH CHECK` 절: 새 행을 삽입하거나 기존 행을 업데이트할 때 새 값을 체크

기존 정책에는 `WITH CHECK`가 없어서 INSERT가 차단됩니다.

## 해결 방법

### 1단계: Supabase Dashboard 접속

1. https://supabase.com/dashboard 접속
2. 로그인
3. 해당 프로젝트 선택

### 2단계: SQL Editor 열기

왼쪽 메뉴에서 "SQL Editor" 클릭

### 3단계: 아래 SQL 실행

다음 SQL을 복사하여 SQL Editor에 붙여넣고 "Run" 버튼을 클릭하세요:

```sql
-- RLS 정책 수정: WITH CHECK 절 추가
-- 기존 정책 삭제
DROP POLICY IF EXISTS "Owners can manage clinic hours" ON clinic_hours;
DROP POLICY IF EXISTS "Owners can manage clinic holidays" ON clinic_holidays;

-- clinic_hours RLS 정책 재생성 (WITH CHECK 추가)
CREATE POLICY "Owners can manage clinic hours"
  ON clinic_hours FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_holidays RLS 정책 재생성 (WITH CHECK 추가)
CREATE POLICY "Owners can manage clinic holidays"
  ON clinic_holidays FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );
```

### 4단계: 테스트

1. 브라우저에서 애플리케이션 새로고침
2. 병원 설정 > 진료시간 탭으로 이동
3. 진료시간 수정
4. "진료시간 저장" 버튼 클릭
5. "✓ 진료시간이 저장되었습니다." 메시지 확인

## 예상 결과

- ✅ 진료시간 저장이 정상적으로 작동
- ✅ 에러 메시지 없이 성공 메시지 표시
- ✅ 데이터베이스에 변경사항 저장됨

## 추가 정보

- Migration 파일 위치: `supabase/migrations/20250131_fix_clinic_hours_rls.sql`
- 관련 서비스: `src/lib/clinicHoursService.ts`
- 관련 컴포넌트: `src/components/Management/ClinicHoursSettings.tsx`

## 문제가 계속되는 경우

1. 브라우저 개발자 도구 (F12) 열기
2. Console 탭에서 에러 메시지 확인
3. Network 탭에서 실패한 요청 확인
4. 에러 메시지와 함께 문의

## 참고 자료

- Supabase RLS 문서: https://supabase.com/docs/guides/auth/row-level-security
- PostgreSQL Policy 문서: https://www.postgresql.org/docs/current/sql-createpolicy.html
