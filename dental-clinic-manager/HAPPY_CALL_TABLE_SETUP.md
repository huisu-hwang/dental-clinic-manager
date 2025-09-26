# Happy Call Logs 테이블 설정 가이드

## Supabase에서 테이블 생성하기

### 방법 1: Supabase Dashboard에서 SQL 실행

1. [Supabase Dashboard](https://app.supabase.com)에 로그인
2. 프로젝트 선택
3. 왼쪽 메뉴에서 **SQL Editor** 클릭
4. 새 쿼리 만들기
5. `create_happy_call_logs_table.sql` 파일의 내용을 복사하여 붙여넣기
6. **Run** 버튼 클릭

### 방법 2: Table Editor 사용

1. Supabase Dashboard에서 **Table Editor** 메뉴로 이동
2. **New Table** 버튼 클릭
3. 다음 정보로 테이블 생성:

#### 테이블 이름: `happy_call_logs`

#### 컬럼 구조:
| Column Name | Type | Default | Nullable | Primary |
|------------|------|---------|----------|---------|
| id | bigint | auto-increment | No | Yes |
| date | date | - | No | No |
| patient_name | varchar(100) | - | No | No |
| treatment | text | - | Yes | No |
| notes | text | - | Yes | No |
| created_at | timestamptz | now() | No | No |
| updated_at | timestamptz | now() | No | No |

## 테이블 생성 확인

테이블이 성공적으로 생성되었는지 확인:

1. Table Editor에서 `happy_call_logs` 테이블이 보이는지 확인
2. 또는 SQL Editor에서 다음 쿼리 실행:
   ```sql
   SELECT * FROM happy_call_logs LIMIT 1;
   ```

## 주요 기능

- **해피콜 기록 저장**: 환자명, 치료내용, 특이사항을 날짜별로 저장
- **자동 타임스탬프**: created_at과 updated_at 필드가 자동으로 관리됨
- **날짜별 조회 최적화**: date 컬럼에 인덱스가 설정되어 빠른 조회 가능

## 참고사항

- 테이블이 이미 존재하는 경우 `IF NOT EXISTS` 구문으로 인해 오류가 발생하지 않습니다
- RLS(Row Level Security)가 활성화되어 있지만 모든 작업을 허용하는 정책이 설정되어 있습니다
- 필요에 따라 보안 정책을 수정할 수 있습니다