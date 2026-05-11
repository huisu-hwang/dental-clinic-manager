-- ============================================
-- 소모임 가입 신청/승인 워크플로우
--
-- 공개 소모임이라도 글쓰기 권한을 위해서는 모임장의 승인이 필요한 경우가 많아,
-- 비멤버가 "가입 신청 → 모임장 승인/거부 → 자동 멤버 등록" 흐름을 위한 테이블.
--
-- Migration: 20260511_telegram_group_join_requests.sql
-- Created: 2026-05-11
-- ============================================

CREATE TABLE IF NOT EXISTS telegram_group_join_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message           TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reject_reason     TEXT,
  reviewed_by       UUID REFERENCES auth.users(id),
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동일 사용자의 pending 신청은 그룹당 1건만
CREATE UNIQUE INDEX IF NOT EXISTS idx_join_requests_unique_pending
  ON telegram_group_join_requests (telegram_group_id, user_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_join_requests_group_status
  ON telegram_group_join_requests (telegram_group_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_join_requests_user
  ON telegram_group_join_requests (user_id, created_at DESC);

ALTER TABLE telegram_group_join_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: 본인 신청 + 모임장(created_by) + master_admin
DROP POLICY IF EXISTS "join_requests_select" ON telegram_group_join_requests;
CREATE POLICY "join_requests_select" ON telegram_group_join_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM telegram_groups g
      WHERE g.id = telegram_group_join_requests.telegram_group_id
        AND g.created_by = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  );

-- INSERT: 본인만 자기 신청 가능
DROP POLICY IF EXISTS "join_requests_insert_self" ON telegram_group_join_requests;
CREATE POLICY "join_requests_insert_self" ON telegram_group_join_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- UPDATE: 본인(취소) + 모임장(승인/거부) + master_admin
DROP POLICY IF EXISTS "join_requests_update" ON telegram_group_join_requests;
CREATE POLICY "join_requests_update" ON telegram_group_join_requests
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM telegram_groups g
      WHERE g.id = telegram_group_join_requests.telegram_group_id
        AND g.created_by = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'master_admin')
  );

-- DELETE 없이 운영(취소는 status='cancelled')

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_join_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_join_requests_updated_at ON telegram_group_join_requests;
CREATE TRIGGER trg_join_requests_updated_at
  BEFORE UPDATE ON telegram_group_join_requests
  FOR EACH ROW EXECUTE FUNCTION update_join_requests_updated_at();

COMMENT ON TABLE telegram_group_join_requests IS '소모임 가입 신청 — pending/approved/rejected/cancelled 상태로 운영';
