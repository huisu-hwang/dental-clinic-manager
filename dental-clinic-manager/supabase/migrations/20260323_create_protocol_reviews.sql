-- ============================================
-- 프로토콜 검토 요청 테이블
-- Migration: 20260323_create_protocol_reviews
-- Created: 2026-03-23
-- ============================================

-- protocol_reviews 테이블 생성
CREATE TABLE IF NOT EXISTS protocol_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES protocol_versions(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  request_message TEXT,
  review_message TEXT,
  previous_version_id UUID REFERENCES protocol_versions(id) ON DELETE SET NULL,
  previous_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_protocol_reviews_clinic_id ON protocol_reviews(clinic_id);
CREATE INDEX idx_protocol_reviews_protocol_id ON protocol_reviews(protocol_id);
CREATE INDEX idx_protocol_reviews_status ON protocol_reviews(status);
CREATE INDEX idx_protocol_reviews_requested_by ON protocol_reviews(requested_by);

-- RLS 활성화
ALTER TABLE protocol_reviews ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 같은 클리닉 사용자만 조회 가능
CREATE POLICY "protocol_reviews_select_clinic" ON protocol_reviews
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- RLS 정책: 같은 클리닉 사용자가 검토 요청 생성 가능
CREATE POLICY "protocol_reviews_insert_clinic" ON protocol_reviews
  FOR INSERT WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- RLS 정책: 대표원장(owner)만 검토 결과 업데이트 가능
CREATE POLICY "protocol_reviews_update_owner" ON protocol_reviews
  FOR UPDATE USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid() AND role = 'owner'
    )
  );

-- protocols 테이블에 pending_review 상태 추가
ALTER TABLE protocols DROP CONSTRAINT IF EXISTS protocols_status_check;
ALTER TABLE protocols ADD CONSTRAINT protocols_status_check
  CHECK (status IN ('draft', 'active', 'archived', 'pending_review'));

-- user_notifications type 체크 제약조건 업데이트 (새 알림 타입 추가)
ALTER TABLE user_notifications DROP CONSTRAINT IF EXISTS user_notifications_type_check;
ALTER TABLE user_notifications ADD CONSTRAINT user_notifications_type_check
  CHECK (type = ANY (ARRAY[
    'leave_approval_pending', 'leave_approved', 'leave_rejected', 'leave_forwarded',
    'contract_signature_required', 'contract_signed', 'contract_completed', 'contract_cancelled',
    'document_resignation', 'document_approved', 'document_rejected', 'document',
    'telegram_board_approved', 'telegram_board_rejected', 'telegram_board_pending',
    'task_assigned', 'task_completed',
    'protocol_review_requested', 'protocol_review_approved', 'protocol_review_rejected',
    'important', 'system'
  ]));

-- ============================================
-- Migration Complete
-- ============================================
