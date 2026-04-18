-- ============================================
-- 사용자 약관 동의 테이블 생성
-- Migration: 20260418_create_user_consents.sql
-- Created: 2026-04-18
--
-- 목적: 회원가입 시 약관 동의 내역을 기록하여
--       개인정보보호법(PIPA) 준수를 위한 감사 추적 제공
-- ============================================

-- 1. user_consents 테이블 생성
CREATE TABLE IF NOT EXISTS user_consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type VARCHAR(50) NOT NULL,
  -- 동의 유형:
  -- 'terms_of_service'   : 서비스 이용약관 (필수)
  -- 'privacy_collection' : 개인정보 수집·이용 동의 (필수)
  -- 'sensitive_info'     : 민감정보(주민등록번호) 수집 동의 (필수)
  -- 'marketing_email'    : 마케팅 정보 수신 동의 - 이메일 (선택)
  -- 'marketing_sms'      : 마케팅 정보 수신 동의 - SMS (선택)
  is_agreed BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_at TIMESTAMPTZ,          -- 동의한 시각 (미동의 시 NULL)
  revoked_at TIMESTAMPTZ,         -- 동의 철회 시각 (철회 전 NULL)
  consent_version VARCHAR(20) NOT NULL DEFAULT '1.0',  -- 약관 버전 추적
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

  UNIQUE(user_id, consent_type)   -- 사용자당 동의 유형 1개
);

-- 2. 인덱스
CREATE INDEX IF NOT EXISTS idx_user_consents_user_id ON user_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_user_consents_type ON user_consents(consent_type);
CREATE INDEX IF NOT EXISTS idx_user_consents_agreed ON user_consents(is_agreed);

-- 3. 코멘트
COMMENT ON TABLE user_consents IS '사용자 약관 동의 내역 (개인정보보호법 준수 감사 추적)';
COMMENT ON COLUMN user_consents.consent_type IS '동의 유형: terms_of_service, privacy_collection, sensitive_info, marketing_email, marketing_sms';
COMMENT ON COLUMN user_consents.consent_version IS '동의 당시 약관 버전 (추후 약관 변경 시 재동의 여부 판단에 활용)';
COMMENT ON COLUMN user_consents.revoked_at IS '마케팅 동의 등 선택 항목 철회 시 기록';

-- 4. RLS 활성화
ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

-- 5. RLS 정책: 본인 동의 내역 조회 가능
CREATE POLICY "Users can view own consents"
  ON user_consents FOR SELECT
  USING (user_id = auth.uid());

-- 6. RLS 정책: 클리닉 owner는 소속 직원 동의 내역 조회 가능
CREATE POLICY "Owners can view clinic member consents"
  ON user_consents FOR SELECT
  USING (
    user_id IN (
      SELECT u.id FROM users u
      WHERE u.clinic_id IN (
        SELECT clinic_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
      )
    )
  );

-- 7. RLS 정책: 본인 동의 내역 수정 가능 (마케팅 동의 철회 등)
CREATE POLICY "Users can update own consents"
  ON user_consents FOR UPDATE
  USING (user_id = auth.uid());

-- 8. updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_user_consents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_consents_updated_at
  BEFORE UPDATE ON user_consents
  FOR EACH ROW
  EXECUTE FUNCTION update_user_consents_updated_at();

-- ============================================
-- 9. insert_user_consents RPC 함수 (SECURITY DEFINER)
--
-- 회원가입 직후 이메일 미인증 상태에서도 동의 내역을 저장하기 위해
-- SECURITY DEFINER를 사용하여 RLS를 우회합니다.
-- ============================================
CREATE OR REPLACE FUNCTION insert_user_consents(
  p_user_id UUID,
  p_consents JSONB
)
RETURNS VOID AS $$
DECLARE
  consent_item JSONB;
BEGIN
  -- 입력값 검증
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'p_user_id cannot be null';
  END IF;

  IF p_consents IS NULL OR jsonb_array_length(p_consents) = 0 THEN
    RAISE EXCEPTION 'p_consents cannot be null or empty';
  END IF;

  -- users 테이블에 해당 사용자가 존재하는지 확인
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User with id % does not exist', p_user_id;
  END IF;

  -- 각 동의 항목을 삽입 (이미 존재하는 경우 무시)
  FOR consent_item IN SELECT * FROM jsonb_array_elements(p_consents)
  LOOP
    INSERT INTO user_consents (
      user_id,
      consent_type,
      is_agreed,
      agreed_at,
      consent_version
    ) VALUES (
      p_user_id,
      (consent_item->>'consent_type')::VARCHAR(50),
      (consent_item->>'is_agreed')::BOOLEAN,
      CASE
        WHEN (consent_item->>'is_agreed')::BOOLEAN = TRUE
        THEN NOW()
        ELSE NULL
      END,
      COALESCE(consent_item->>'consent_version', '1.0')
    )
    ON CONFLICT (user_id, consent_type) DO NOTHING;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 함수 코멘트
COMMENT ON FUNCTION insert_user_consents(UUID, JSONB) IS
  '회원가입 시 약관 동의 내역을 저장하는 SECURITY DEFINER 함수. 이메일 미인증 상태에서도 RLS를 우회하여 동의 내역을 저장합니다.';

-- ============================================
-- Migration Complete
-- ============================================
