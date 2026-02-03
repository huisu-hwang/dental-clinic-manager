-- AI 대화 기록 테이블
-- 사용자가 AI와 나눈 대화를 저장하고 나중에 다시 볼 수 있도록 함

-- 테이블 생성
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '새 대화',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_ai_conversations_clinic_id ON ai_conversations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_updated_at ON ai_conversations(updated_at DESC);

-- 코멘트 추가
COMMENT ON TABLE ai_conversations IS 'AI 데이터 분석 대화 기록';
COMMENT ON COLUMN ai_conversations.id IS '고유 식별자';
COMMENT ON COLUMN ai_conversations.clinic_id IS '병원 ID';
COMMENT ON COLUMN ai_conversations.user_id IS '사용자 ID';
COMMENT ON COLUMN ai_conversations.title IS '대화 제목 (첫 번째 메시지에서 자동 생성)';
COMMENT ON COLUMN ai_conversations.messages IS '대화 메시지 배열 (JSON)';
COMMENT ON COLUMN ai_conversations.created_at IS '생성 일시';
COMMENT ON COLUMN ai_conversations.updated_at IS '마지막 업데이트 일시';

-- RLS 활성화
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

-- 정책: 대표 원장(owner)만 자신의 대화 조회 가능
CREATE POLICY "ai_conversations_select_policy" ON ai_conversations
  FOR SELECT
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'owner'
        AND clinic_id = ai_conversations.clinic_id
    )
  );

-- 정책: 대표 원장(owner)만 대화 생성 가능
CREATE POLICY "ai_conversations_insert_policy" ON ai_conversations
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'owner'
        AND clinic_id = ai_conversations.clinic_id
    )
  );

-- 정책: 대표 원장(owner)만 자신의 대화 수정 가능
CREATE POLICY "ai_conversations_update_policy" ON ai_conversations
  FOR UPDATE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'owner'
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'owner'
    )
  );

-- 정책: 대표 원장(owner)만 자신의 대화 삭제 가능
CREATE POLICY "ai_conversations_delete_policy" ON ai_conversations
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
        AND role = 'owner'
    )
  );

-- 트리거 함수: updated_at 자동 업데이트
CREATE OR REPLACE FUNCTION update_ai_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS ai_conversations_updated_at ON ai_conversations;
CREATE TRIGGER ai_conversations_updated_at
  BEFORE UPDATE ON ai_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_conversations_updated_at();
