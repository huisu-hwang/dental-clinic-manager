# 개인 근무 스케줄 기능 Migration 가이드

## 📋 개요

이 Migration은 **병원 진료시간 → 개인 근무 스케줄 → 근로계약서** 연동 기능을 구현합니다.

### 주요 기능
1. ✅ `users` 테이블에 `work_schedule` JSONB 컬럼 추가
2. ✅ 신규 직원 등록 시 병원 진료시간을 기반으로 개인 스케줄 자동 초기화
3. ✅ 개인 스케줄을 근로계약서 근로시간에 자동 입력
4. ✅ 개인별 근무 스케줄 수정 가능

---

## 🚀 Migration 실행 방법

### 방법 1: Supabase Dashboard (권장)

1. **Supabase Dashboard 로그인**
   - https://supabase.com/dashboard 접속
   - 로그인

2. **프로젝트 선택**
   - `beahjntkmkfhpcbhfnrr` (하얀치과) 프로젝트 선택

3. **SQL Editor 열기**
   - 왼쪽 메뉴에서 `SQL Editor` 클릭

4. **Migration SQL 실행**
   - `New Query` 버튼 클릭
   - 아래 파일의 내용을 복사하여 붙여넣기:
     ```
     supabase/migrations/20251031_add_work_schedule_to_users.sql
     ```
   - `Run` 버튼 클릭

5. **실행 결과 확인**
   - ✅ Success 메시지 확인
   - 에러 발생 시 에러 메시지 확인 후 수정

---

### 방법 2: Supabase CLI

```bash
# 1. Supabase CLI 설치 (미설치 시)
npm install -g supabase

# 2. 프로젝트 연결
supabase link --project-ref beahjntkmkfhpcbhfnrr

# 3. Migration 실행
supabase db push
```

---

## 📊 Migration 상세 내용

### 1. users 테이블에 work_schedule 컬럼 추가

```sql
ALTER TABLE users
ADD COLUMN IF NOT EXISTS work_schedule JSONB DEFAULT NULL;
```

**데이터 구조:**
```json
{
  "monday": {
    "start": "09:00",
    "end": "18:00",
    "breakStart": "12:00",
    "breakEnd": "13:00",
    "isWorking": true
  },
  "tuesday": { ... },
  "wednesday": { ... },
  "thursday": { ... },
  "friday": { ... },
  "saturday": {
    "start": "09:00",
    "end": "14:00",
    "breakStart": null,
    "breakEnd": null,
    "isWorking": true
  },
  "sunday": {
    "start": null,
    "end": null,
    "breakStart": null,
    "breakEnd": null,
    "isWorking": false
  }
}
```

---

### 2. 생성된 함수

#### `initialize_work_schedule_from_clinic(p_user_id UUID)`
- 병원의 `clinic_hours`를 조회하여 개인 `work_schedule` 생성
- 신규 직원 등록 시 자동 호출됨

#### `auto_initialize_work_schedule()`
- 신규 사용자 INSERT 시 자동으로 work_schedule 초기화
- Trigger로 연결됨

#### `get_user_work_schedule(p_user_id UUID)`
- 사용자 근무 스케줄 조회
- work_schedule이 NULL이면 자동으로 clinic_hours에서 초기화

---

### 3. Trigger

```sql
CREATE TRIGGER trigger_auto_initialize_work_schedule
  BEFORE INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION auto_initialize_work_schedule();
```

**동작:**
- 신규 직원 등록 시 자동으로 work_schedule 초기화
- `master_admin`, `owner` 역할은 제외 (병원 진료시간과 무관)

---

## 🧪 Migration 검증 방법

### 1. 테이블 구조 확인

```sql
-- users 테이블에 work_schedule 컬럼 존재 확인
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'work_schedule';
```

**예상 결과:**
```
column_name    | data_type | column_default
---------------|-----------|---------------
work_schedule  | jsonb     | NULL
```

---

### 2. 함수 존재 확인

```sql
-- 생성된 함수 목록 확인
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_name LIKE '%work_schedule%';
```

**예상 결과:**
- `initialize_work_schedule_from_clinic` (FUNCTION)
- `auto_initialize_work_schedule` (FUNCTION)
- `get_user_work_schedule` (FUNCTION)

---

### 3. Trigger 확인

```sql
-- users 테이블의 trigger 확인
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users';
```

**예상 결과:**
- `trigger_auto_initialize_work_schedule` (BEFORE INSERT)

---

### 4. 기존 직원의 work_schedule 초기화 (선택사항)

기존 직원들은 work_schedule이 NULL일 수 있습니다. 필요 시 수동으로 초기화:

```sql
-- 특정 직원의 work_schedule 초기화
UPDATE users
SET work_schedule = initialize_work_schedule_from_clinic(id)
WHERE id = 'USER_ID_HERE';
```

또는 전체 직원 일괄 초기화:

```sql
-- 모든 직원의 work_schedule 초기화 (work_schedule이 NULL인 경우만)
UPDATE users
SET work_schedule = initialize_work_schedule_from_clinic(id)
WHERE work_schedule IS NULL
  AND clinic_id IS NOT NULL
  AND role NOT IN ('master_admin', 'owner');
```

---

## 🔧 애플리케이션 코드 변경 사항

### 1. 새로운 파일

- `src/types/workSchedule.ts` - 근무 스케줄 타입 정의
- `src/utils/workScheduleUtils.ts` - 스케줄 변환 유틸리티
- `src/lib/workScheduleService.ts` - 스케줄 관리 서비스

### 2. 수정된 파일

- `src/components/Contract/ContractForm.tsx`
  - 직원 선택 시 개인 근무 스케줄 자동 조회
  - 근로시간 필드에 자동 입력
  - 사용자 피드백 메시지 추가

---

## 📖 사용 방법

### 1. 신규 직원 등록

신규 직원 등록 시 자동으로 병원 진료시간이 개인 스케줄에 복사됩니다.

```javascript
// 회원가입 시 자동 처리됨 (Trigger)
// 추가 코드 필요 없음
```

---

### 2. 근로계약서 작성

근로계약서 작성 시 직원의 개인 스케줄이 자동으로 입력됩니다.

**화면 흐름:**
1. 근로계약서 작성 페이지 접속
2. 직원 선택
3. ✅ 개인 근무 스케줄 자동 조회
4. ✅ 근로시간 필드에 자동 입력
5. 필요 시 수동 수정 가능
6. 저장

**자동 입력되는 필드:**
- `work_start_time`: 가장 빠른 시작 시간
- `work_end_time`: 가장 늦은 종료 시간
- `work_days_per_week`: 주당 근무일수
- `work_hours_detail`: 요일별 상세 근무시간

---

### 3. 개인 스케줄 수정 (선택사항)

개별 직원이 자신의 근무 스케줄을 수정하려면 별도의 UI 페이지가 필요합니다.

**구현 예정:**
- `src/components/Schedule/WorkScheduleSettings.tsx`
- 개인 스케줄 조회/수정 페이지
- "병원 진료시간 가져오기" 버튼

---

## ⚠️ 주의사항

### 1. Migration 실행 순서

이 Migration은 다음 테이블에 의존합니다:
- `users` 테이블 (이미 존재)
- `clinic_hours` 테이블 (이미 존재)

**실행 전 확인:**
```sql
-- 테이블 존재 확인
SELECT table_name
FROM information_schema.tables
WHERE table_name IN ('users', 'clinic_hours');
```

---

### 2. 기존 데이터 영향

- **기존 직원:** work_schedule이 NULL로 시작
  - 첫 로그인 시 또는 근로계약서 작성 시 자동 초기화됨
  - 수동 초기화 SQL 참고 (위 "기존 직원 초기화" 섹션)

- **기존 근로계약서:** 영향 없음
  - 기존 contract_data는 변경되지 않음

---

### 3. 병원 진료시간 변경

병원 진료시간 변경 시:
- ❌ 기존 직원 스케줄 자동 업데이트 **안 됨**
- ✅ 신규 등록 직원만 변경된 시간 적용
- 기존 직원은 "병원 진료시간 가져오기" 버튼으로 수동 업데이트

---

## 🐛 트러블슈팅

### 에러 1: "relation work_schedule does not exist"

**원인:** Migration이 실행되지 않음

**해결:**
1. Supabase Dashboard SQL Editor에서 Migration 실행
2. 또는 Supabase CLI로 `supabase db push`

---

### 에러 2: "function initialize_work_schedule_from_clinic does not exist"

**원인:** Migration이 부분적으로만 실행됨

**해결:**
1. Migration SQL 전체를 다시 실행
2. 함수 생성 부분만 별도로 실행

---

### 에러 3: 신규 직원 work_schedule이 NULL

**원인 1:** clinic_hours가 설정되지 않음

**해결:**
1. 병원 설정 > 진료시간 설정에서 진료시간 입력
2. 직원 재등록 또는 수동 초기화 SQL 실행

**원인 2:** Trigger가 비활성화됨

**해결:**
```sql
-- Trigger 상태 확인
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'users';

-- Trigger 재생성 (필요 시)
-- Migration SQL의 Trigger 섹션 재실행
```

---

## 📞 문의

Migration 실행 중 문제 발생 시:
1. 에러 메시지 전체 복사
2. 실행한 SQL 문장 확인
3. 개발자에게 문의

---

## 📅 변경 이력

### 2025-10-31
- 초기 Migration 작성
- users.work_schedule JSONB 컬럼 추가
- 병원 진료시간 → 개인 스케줄 → 근로계약서 연동 구현
- 자동 초기화 Trigger 추가

---

## 🎯 다음 단계

1. ✅ Migration 실행
2. ✅ 기존 직원 work_schedule 초기화 (선택사항)
3. ⏳ 개인 스케줄 관리 UI 페이지 구현 (선택사항)
4. ⏳ 테스트 및 검증

---

**작성일:** 2025-10-31
**작성자:** Claude Code
**버전:** 1.0.0
