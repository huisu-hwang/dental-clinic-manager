# Protocol Steps 스키마 수정

## 문제 상황
프로토콜 생성 시 다음 오류 발생:
```
"Could not find the 'clinic_id' column of 'protocol_steps' in the schema cache"
```

## 원인 분석
1. 코드에서 `protocol_steps` 테이블에 `clinic_id`와 `version_id`를 삽입하려고 시도
2. 하지만 데이터베이스 스키마에는 이 컬럼들이 존재하지 않음
3. 현재 스키마:
   - `protocol_steps`는 `protocol_id`로만 연결됨
   - `version_id` 컬럼이 없어서 버전별 단계 관리 불가능

## 해결 방법

### 1. 코드 수정 (완료)
- ✅ `protocolStepUtils.ts`: `clinic_id` 파라미터 제거
- ✅ `dataService.ts`: `saveProtocolSteps` 함수에서 `clinic_id` 파라미터 제거
- ✅ 모든 호출 지점 업데이트 (3곳)

### 2. 데이터베이스 마이그레이션 (실행 필요)

**마이그레이션 파일 위치:**
```
supabase/migrations/20250128_add_version_id_to_protocol_steps.sql
```

**실행 방법:**

#### 옵션 1: Supabase Dashboard (권장)
1. https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql/new 접속
2. 아래 SQL을 복사하여 붙여넣기
3. "Run" 버튼 클릭

```sql
-- Add version_id column to protocol_steps
ALTER TABLE protocol_steps
ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES protocol_versions(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_protocol_steps_version_id ON protocol_steps(version_id);

-- Update RLS policies to include version_id checks
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view protocol steps from their clinic" ON protocol_steps;
DROP POLICY IF EXISTS "Users can insert protocol steps for their clinic" ON protocol_steps;
DROP POLICY IF EXISTS "Users can update protocol steps for their clinic" ON protocol_steps;
DROP POLICY IF EXISTS "Users can delete protocol steps for their clinic" ON protocol_steps;

-- Recreate policies with version_id support
CREATE POLICY "Users can view protocol steps from their clinic" ON protocol_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert protocol steps for their clinic" ON protocol_steps
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update protocol steps for their clinic" ON protocol_steps
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete protocol steps for their clinic" ON protocol_steps
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Add comment
COMMENT ON COLUMN protocol_steps.version_id IS 'Links the step to a specific protocol version';
```

#### 옵션 2: Supabase CLI
```bash
npx supabase db push
```

### 3. 마이그레이션 후 확인
```sql
-- protocol_steps 테이블 구조 확인
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'protocol_steps'
ORDER BY ordinal_position;

-- version_id 컬럼이 추가되었는지 확인
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_name = 'protocol_steps'
  AND column_name = 'version_id'
);
```

## 변경 사항 요약

### 스키마 변경
- **추가된 컬럼**: `protocol_steps.version_id` (UUID, FK to protocol_versions)
- **추가된 인덱스**: `idx_protocol_steps_version_id`
- **업데이트된 RLS 정책**: 모든 정책이 `version_id`를 통해 접근 제어

### 코드 변경
- **제거**: `clinic_id` 파라미터 (불필요, `protocols` 테이블을 통해 간접 참조)
- **유지**: `version_id` 파라미터 (버전별 단계 관리를 위해 필수)

## 아키텍처
```
protocols (clinic_id)
  ↓
protocol_versions
  ↓
protocol_steps (version_id) ← 새로 추가된 연결
```

이제 프로토콜 단계가 특정 버전에 연결되어 버전별로 다른 단계를 가질 수 있습니다.
