-- 소모임 공개/비공개 설정 기능
-- visibility 컬럼 추가: private, public_list, public_read, public_full

ALTER TABLE telegram_groups
  ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private';

ALTER TABLE telegram_groups
  ADD CONSTRAINT chk_telegram_groups_visibility
  CHECK (visibility IN ('private', 'public_list', 'public_read', 'public_full'));
