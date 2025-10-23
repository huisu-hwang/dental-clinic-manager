-- ========================================
-- Fix Protocol Versions Table Column Types
-- 1. Change content from JSONB to TEXT (for HTML content)
-- 2. Change version_number from INTEGER to VARCHAR (for semantic versioning like 1.0, 1.1, 2.0)
-- ========================================

-- 1. content 컬럼 타입을 JSONB에서 TEXT로 변경
ALTER TABLE protocol_versions
  ALTER COLUMN content TYPE TEXT USING content::text;

ALTER TABLE protocol_versions
  ALTER COLUMN content SET DEFAULT '';

-- 2. version_number 컬럼 타입을 INTEGER에서 VARCHAR로 변경 (semantic versioning 지원)
ALTER TABLE protocol_versions
  ALTER COLUMN version_number TYPE VARCHAR(20) USING version_number::VARCHAR;

-- 3. 기존 UNIQUE 제약조건 삭제 후 재생성 (INTEGER -> VARCHAR 변경으로 인해)
ALTER TABLE protocol_versions
  DROP CONSTRAINT IF EXISTS protocol_versions_protocol_id_version_number_key;

ALTER TABLE protocol_versions
  ADD CONSTRAINT protocol_versions_protocol_id_version_number_key
  UNIQUE (protocol_id, version_number);

-- 변경 확인
SELECT
  table_name,
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name = 'protocol_versions' AND column_name IN ('content', 'version_number')
ORDER BY column_name;
