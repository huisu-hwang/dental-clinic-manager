-- 프로토콜별 개별 권한 테이블
-- 대표원장이 직원들에게 프로토콜별로 접근, 수정, 생성, 삭제 권한을 부여할 수 있도록 함

-- protocol_permissions 테이블 생성
CREATE TABLE IF NOT EXISTS protocol_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  can_view BOOLEAN NOT NULL DEFAULT false,
  can_edit BOOLEAN NOT NULL DEFAULT false,
  can_create BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  granted_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- 프로토콜+사용자 조합은 유일해야 함
  UNIQUE(protocol_id, user_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_protocol_permissions_protocol_id ON protocol_permissions(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_permissions_user_id ON protocol_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_protocol_permissions_granted_by ON protocol_permissions(granted_by);

-- updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_protocol_permissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_protocol_permissions_updated_at ON protocol_permissions;
CREATE TRIGGER trigger_update_protocol_permissions_updated_at
  BEFORE UPDATE ON protocol_permissions
  FOR EACH ROW
  EXECUTE FUNCTION update_protocol_permissions_updated_at();

-- RLS 정책 활성화
ALTER TABLE protocol_permissions ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 같은 클리닉 소속 사용자만 조회 가능
CREATE POLICY "protocol_permissions_select_policy" ON protocol_permissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM protocols p
      JOIN users u ON u.clinic_id = p.clinic_id
      WHERE p.id = protocol_permissions.protocol_id
        AND u.id = auth.uid()
    )
  );

-- RLS 정책: 대표원장만 권한 생성 가능
CREATE POLICY "protocol_permissions_insert_policy" ON protocol_permissions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users u
      JOIN protocols p ON p.clinic_id = u.clinic_id
      WHERE u.id = auth.uid()
        AND u.role = 'owner'
        AND p.id = protocol_permissions.protocol_id
    )
  );

-- RLS 정책: 대표원장만 권한 수정 가능
CREATE POLICY "protocol_permissions_update_policy" ON protocol_permissions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN protocols p ON p.clinic_id = u.clinic_id
      WHERE u.id = auth.uid()
        AND u.role = 'owner'
        AND p.id = protocol_permissions.protocol_id
    )
  );

-- RLS 정책: 대표원장만 권한 삭제 가능
CREATE POLICY "protocol_permissions_delete_policy" ON protocol_permissions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN protocols p ON p.clinic_id = u.clinic_id
      WHERE u.id = auth.uid()
        AND u.role = 'owner'
        AND p.id = protocol_permissions.protocol_id
    )
  );

-- 코멘트 추가
COMMENT ON TABLE protocol_permissions IS '프로토콜별 개별 접근 권한 관리 테이블';
COMMENT ON COLUMN protocol_permissions.protocol_id IS '프로토콜 ID';
COMMENT ON COLUMN protocol_permissions.user_id IS '권한을 부여받은 사용자 ID';
COMMENT ON COLUMN protocol_permissions.can_view IS '조회 권한';
COMMENT ON COLUMN protocol_permissions.can_edit IS '수정 권한';
COMMENT ON COLUMN protocol_permissions.can_create IS '생성 권한';
COMMENT ON COLUMN protocol_permissions.can_delete IS '삭제 권한';
COMMENT ON COLUMN protocol_permissions.granted_by IS '권한을 부여한 사용자 ID (대표원장)';
