-- ========================================
-- 기존 데이터에 clinic_id 추가 마이그레이션
-- ========================================
-- 이 스크립트는 Supabase SQL Editor에서 실행하세요.

-- 1단계: 하얀치과의 clinic_id 확인
-- 아래 쿼리를 먼저 실행하여 하얀치과의 clinic_id를 확인하세요
SELECT id, name, email FROM clinics WHERE name LIKE '%하얀%' OR email LIKE '%하얀%';

-- 위에서 확인한 clinic_id를 아래 변수에 입력하세요
-- 예: DO $$
-- DECLARE
--   v_clinic_id UUID := 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'; -- 하얀치과의 clinic_id
-- BEGIN

-- 2단계: 기존 데이터 확인
-- clinic_id가 NULL인 데이터 개수 확인
SELECT
  'daily_reports' as table_name,
  COUNT(*) as null_count
FROM daily_reports
WHERE clinic_id IS NULL

UNION ALL

SELECT
  'consult_logs' as table_name,
  COUNT(*) as null_count
FROM consult_logs
WHERE clinic_id IS NULL

UNION ALL

SELECT
  'gift_logs' as table_name,
  COUNT(*) as null_count
FROM gift_logs
WHERE clinic_id IS NULL

UNION ALL

SELECT
  'happy_call_logs' as table_name,
  COUNT(*) as null_count
FROM happy_call_logs
WHERE clinic_id IS NULL

UNION ALL

SELECT
  'gift_inventory' as table_name,
  COUNT(*) as null_count
FROM gift_inventory
WHERE clinic_id IS NULL

UNION ALL

SELECT
  'inventory_logs' as table_name,
  COUNT(*) as null_count
FROM inventory_logs
WHERE clinic_id IS NULL;

-- 3단계: 기존 데이터에 clinic_id 업데이트
-- ⚠️ 주의: 아래 '<하얀치과_clinic_id>'를 실제 clinic_id로 교체하세요!
-- 1단계에서 확인한 clinic_id를 사용합니다.

-- daily_reports 테이블 업데이트
UPDATE daily_reports
SET clinic_id = '<하얀치과_clinic_id>'
WHERE clinic_id IS NULL;

-- consult_logs 테이블 업데이트
UPDATE consult_logs
SET clinic_id = '<하얀치과_clinic_id>'
WHERE clinic_id IS NULL;

-- gift_logs 테이블 업데이트
UPDATE gift_logs
SET clinic_id = '<하얀치과_clinic_id>'
WHERE clinic_id IS NULL;

-- happy_call_logs 테이블 업데이트
UPDATE happy_call_logs
SET clinic_id = '<하얀치과_clinic_id>'
WHERE clinic_id IS NULL;

-- gift_inventory 테이블 업데이트
UPDATE gift_inventory
SET clinic_id = '<하얀치과_clinic_id>'
WHERE clinic_id IS NULL;

-- inventory_logs 테이블 업데이트
UPDATE inventory_logs
SET clinic_id = '<하얀치과_clinic_id>'
WHERE clinic_id IS NULL;

-- 4단계: 업데이트 결과 확인
SELECT
  'daily_reports' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE clinic_id = '<하얀치과_clinic_id>') as with_clinic_id
FROM daily_reports

UNION ALL

SELECT
  'consult_logs' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE clinic_id = '<하얀치과_clinic_id>') as with_clinic_id
FROM consult_logs

UNION ALL

SELECT
  'gift_logs' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE clinic_id = '<하얀치과_clinic_id>') as with_clinic_id
FROM gift_logs

UNION ALL

SELECT
  'happy_call_logs' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE clinic_id = '<하얀치과_clinic_id>') as with_clinic_id
FROM happy_call_logs

UNION ALL

SELECT
  'gift_inventory' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE clinic_id = '<하얀치과_clinic_id>') as with_clinic_id
FROM gift_inventory

UNION ALL

SELECT
  'inventory_logs' as table_name,
  COUNT(*) as total_count,
  COUNT(*) FILTER (WHERE clinic_id = '<하얀치과_clinic_id>') as with_clinic_id
FROM inventory_logs;

-- 5단계 (선택사항): clinic_id NOT NULL 제약조건 추가
-- 모든 데이터에 clinic_id가 추가되었다면, NOT NULL 제약조건을 추가할 수 있습니다.
-- ⚠️ 주의: 이 단계는 모든 데이터가 올바르게 업데이트된 후에만 실행하세요!

-- ALTER TABLE daily_reports ALTER COLUMN clinic_id SET NOT NULL;
-- ALTER TABLE consult_logs ALTER COLUMN clinic_id SET NOT NULL;
-- ALTER TABLE gift_logs ALTER COLUMN clinic_id SET NOT NULL;
-- ALTER TABLE happy_call_logs ALTER COLUMN clinic_id SET NOT NULL;
-- ALTER TABLE gift_inventory ALTER COLUMN clinic_id SET NOT NULL;
-- ALTER TABLE inventory_logs ALTER COLUMN clinic_id SET NOT NULL;
