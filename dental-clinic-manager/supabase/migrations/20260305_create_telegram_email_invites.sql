-- telegram_email_invites: 비회원 이메일 초대 테이블
CREATE TABLE IF NOT EXISTS telegram_email_invites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  telegram_group_id UUID NOT NULL REFERENCES telegram_groups(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL,
  invited_by UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'joined', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at TIMESTAMPTZ
);

-- 같은 이메일+그룹 중복 방지 (pending 상태만)
CREATE UNIQUE INDEX idx_email_invites_unique ON telegram_email_invites(email, telegram_group_id) WHERE status = 'pending';

-- 이메일로 빠른 조회 (로그인 시 pending 초대 확인용)
CREATE INDEX idx_email_invites_email_status ON telegram_email_invites(email, status);

-- RLS
ALTER TABLE telegram_email_invites ENABLE ROW LEVEL SECURITY;

-- 초대한 사람 또는 master_admin 접근 허용
CREATE POLICY "telegram_email_invites_admin" ON telegram_email_invites
  FOR ALL TO authenticated
  USING (
    invited_by = auth.uid()
    OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'master_admin')
  );
