# 어제 데이터가 보이지 않는 문제 디버깅 가이드

## 문제 상황
어제 입력한 데이터가 보이지 않고, 그 전 데이터는 보이는 상황

## 디버깅 단계

### 1단계: 브라우저 콘솔 확인 (F12)

브라우저를 열고 F12를 눌러 개발자 도구를 엽니다.

#### 확인할 콘솔 로그:

```
[useSupabaseData] 데이터 가져오기 시작... clinic_id: xxx
[useSupabaseData] 조회된 데이터 개수: { dailyReports: N, ... }
[useSupabaseData] 최근 일일 보고서 날짜: ['2025-01-16', ...]
```

**체크포인트:**
- clinic_id가 올바르게 출력되는가?
- 조회된 데이터 개수에 어제 날짜가 포함되어 있는가?
- 최근 일일 보고서 날짜에 어제 날짜가 있는가?

### 2단계: 특정 날짜 데이터 조회 확인

일일 보고서 입력 화면에서 어제 날짜를 선택했을 때:

```
[DailyInputForm] Calling dataService.getReportByDate...
[DataService] getReportByDate called
[DataService] Target date: 2025-01-16
[DataService] Target clinic_id: xxx
[DataService] daily_reports fetched: {...}
```

**체크포인트:**
- Target date가 정확한가?
- Target clinic_id가 있는가?
- daily_reports fetched 결과에 데이터가 있는가?

### 3단계: 데이터베이스 직접 확인

Supabase 대시보드에서 SQL 쿼리 실행:

```sql
-- 1. 모든 daily_reports 조회 (날짜 순)
SELECT date, clinic_id, id, created_at
FROM daily_reports
ORDER BY date DESC
LIMIT 10;

-- 2. 특정 clinic_id의 어제 데이터 확인
SELECT *
FROM daily_reports
WHERE clinic_id = 'YOUR_CLINIC_ID'
AND date = '2025-01-16';

-- 3. consult_logs 확인
SELECT *
FROM consult_logs
WHERE clinic_id = 'YOUR_CLINIC_ID'
AND date = '2025-01-16';

-- 4. gift_logs 확인
SELECT *
FROM gift_logs
WHERE clinic_id = 'YOUR_CLINIC_ID'
AND date = '2025-01-16';
```

### 4단계: 날짜 형식 확인

데이터베이스의 날짜 형식과 애플리케이션에서 사용하는 날짜 형식이 일치하는지 확인:

```sql
-- 날짜 컬럼 타입 확인
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'daily_reports'
AND column_name = 'date';
```

**일반적인 날짜 형식:**
- `DATE` 타입: `2025-01-16`
- `TIMESTAMP` 타입: `2025-01-16T00:00:00.000Z`
- `TEXT` 타입: 저장된 형식 그대로

## 해결 방법

### 방법 1: 데이터가 실제로 저장되지 않은 경우

1. 다시 데이터를 입력하고 저장
2. 콘솔에서 저장 성공 메시지 확인
3. 새로고침 후 데이터 확인

### 방법 2: 날짜 형식 문제

날짜를 저장할 때와 조회할 때 형식이 다른 경우:

```typescript
// 저장할 때 날짜 형식 통일
const date = new Date('2025-01-16').toISOString().split('T')[0] // '2025-01-16'
```

### 방법 3: clinic_id 불일치

localStorage의 currentUser 데이터를 확인:

```javascript
// 브라우저 콘솔에서 실행
console.log(JSON.parse(localStorage.getItem('currentUser')))
```

clinic_id가 있는지 확인하고, 없다면 로그아웃 후 다시 로그인

### 방법 4: RLS (Row Level Security) 문제

Supabase에서 RLS 정책 확인:
1. Supabase 대시보드 > Authentication > Policies
2. `daily_reports`, `consult_logs`, `gift_logs` 테이블의 정책 확인
3. SELECT 정책이 `clinic_id = auth.user_id` 같은 잘못된 조건을 사용하고 있는지 확인

올바른 RLS 정책 예시:
```sql
-- daily_reports SELECT 정책
CREATE POLICY "Users can view their clinic's daily reports"
ON daily_reports FOR SELECT
USING (
  clinic_id IN (
    SELECT clinic_id FROM users WHERE id = auth.uid()
  )
);
```

## 긴급 해결 방법

모든 방법이 실패한 경우, 데이터베이스를 직접 확인하고 수동으로 데이터를 수정할 수 있습니다.

### 주의사항
- 데이터베이스를 직접 수정하기 전에 백업을 만드세요
- RLS 정책을 변경할 때는 보안을 고려하세요

## 추가 도움

위의 단계를 모두 시도했는데도 문제가 해결되지 않으면:
1. 브라우저 콘솔의 모든 로그를 캡처
2. 데이터베이스 쿼리 결과 스크린샷
3. 문제가 발생한 날짜와 시간
4. 사용 중인 clinic_id

위 정보를 제공하면 더 정확한 진단이 가능합니다.
