-- ============================================
-- 텔레그램 그룹 link_token 컬럼 추가
-- 딥 링크 기반 원클릭 봇 추가 플로우 지원
-- ============================================

ALTER TABLE telegram_groups ADD COLUMN IF NOT EXISTS link_token VARCHAR(64) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_telegram_groups_link_token
  ON telegram_groups(link_token)
  WHERE link_token IS NOT NULL;
