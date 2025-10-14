-- ========================================
-- 테이블 구조 복원 스크립트
-- ========================================
-- ⚠️ 주의: id 컬럼을 clinic_id로 바꾸면 안 됩니다!
-- 각 테이블은 id (primary key)와 clinic_id (foreign key) 둘 다 필요합니다.

-- 1단계: 현재 테이블 구조 확인
-- 다음 쿼리들을 실행하여 현재 구조를 확인하세요

-- daily_reports 테이블 구조 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'daily_reports'
ORDER BY ordinal_position;

-- consult_logs 테이블 구조 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'consult_logs'
ORDER BY ordinal_position;

-- gift_logs 테이블 구조 확인
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'gift_logs'
ORDER BY ordinal_position;

-- 2단계: 올바른 구조로 복원
-- 만약 id 컬럼이 없고 clinic_id만 있다면, 다음 단계를 따라주세요:

-- ========================================
-- DAILY_REPORTS 테이블 복원
-- ========================================

-- 2-1. clinic_id를 임시 컬럼으로 백업
ALTER TABLE daily_reports RENAME COLUMN clinic_id TO clinic_id_backup;

-- 2-2. id 컬럼을 primary key로 다시 추가
ALTER TABLE daily_reports ADD COLUMN id BIGSERIAL PRIMARY KEY;

-- 2-3. clinic_id를 foreign key로 추가
ALTER TABLE daily_reports ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

-- 2-4. 백업한 데이터를 clinic_id로 복사
UPDATE daily_reports SET clinic_id = clinic_id_backup;

-- 2-5. 백업 컬럼 삭제
ALTER TABLE daily_reports DROP COLUMN clinic_id_backup;

-- ========================================
-- CONSULT_LOGS 테이블 복원
-- ========================================

ALTER TABLE consult_logs RENAME COLUMN clinic_id TO clinic_id_backup;
ALTER TABLE consult_logs ADD COLUMN id BIGSERIAL PRIMARY KEY;
ALTER TABLE consult_logs ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE consult_logs SET clinic_id = clinic_id_backup;
ALTER TABLE consult_logs DROP COLUMN clinic_id_backup;

-- ========================================
-- GIFT_LOGS 테이블 복원
-- ========================================

ALTER TABLE gift_logs RENAME COLUMN clinic_id TO clinic_id_backup;
ALTER TABLE gift_logs ADD COLUMN id BIGSERIAL PRIMARY KEY;
ALTER TABLE gift_logs ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE gift_logs SET clinic_id = clinic_id_backup;
ALTER TABLE gift_logs DROP COLUMN clinic_id_backup;

-- ========================================
-- HAPPY_CALL_LOGS 테이블 복원
-- ========================================

ALTER TABLE happy_call_logs RENAME COLUMN clinic_id TO clinic_id_backup;
ALTER TABLE happy_call_logs ADD COLUMN id BIGSERIAL PRIMARY KEY;
ALTER TABLE happy_call_logs ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE happy_call_logs SET clinic_id = clinic_id_backup;
ALTER TABLE happy_call_logs DROP COLUMN clinic_id_backup;

-- ========================================
-- GIFT_INVENTORY 테이블 복원
-- ========================================

ALTER TABLE gift_inventory RENAME COLUMN clinic_id TO clinic_id_backup;
ALTER TABLE gift_inventory ADD COLUMN id BIGSERIAL PRIMARY KEY;
ALTER TABLE gift_inventory ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE gift_inventory SET clinic_id = clinic_id_backup;
ALTER TABLE gift_inventory DROP COLUMN clinic_id_backup;

-- ========================================
-- INVENTORY_LOGS 테이블 복원
-- ========================================

ALTER TABLE inventory_logs RENAME COLUMN clinic_id TO clinic_id_backup;
ALTER TABLE inventory_logs ADD COLUMN id BIGSERIAL PRIMARY KEY;
ALTER TABLE inventory_logs ADD COLUMN clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;
UPDATE inventory_logs SET clinic_id = clinic_id_backup;
ALTER TABLE inventory_logs DROP COLUMN clinic_id_backup;

-- 3단계: 결과 확인
-- 모든 테이블이 id와 clinic_id를 둘 다 가지고 있는지 확인

SELECT
  table_name,
  COUNT(*) FILTER (WHERE column_name = 'id') as has_id,
  COUNT(*) FILTER (WHERE column_name = 'clinic_id') as has_clinic_id
FROM information_schema.columns
WHERE table_name IN ('daily_reports', 'consult_logs', 'gift_logs',
                      'happy_call_logs', 'gift_inventory', 'inventory_logs')
  AND column_name IN ('id', 'clinic_id')
GROUP BY table_name;

-- 결과가 모두 has_id=1, has_clinic_id=1 이어야 합니다!
