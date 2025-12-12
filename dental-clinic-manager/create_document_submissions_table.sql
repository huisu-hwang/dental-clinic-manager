-- 문서 제출 테이블 생성
CREATE TABLE IF NOT EXISTS document_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- 'resignation', 'employment_certificate'
  document_data JSONB NOT NULL, -- 문서 데이터 (사직서/재직증명서 내용)
  employee_signature TEXT, -- 직원 서명 (base64)
  owner_signature TEXT, -- 원장 서명 (base64, 재직증명서용)
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  reject_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_document_submissions_clinic_id ON document_submissions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_document_submissions_submitted_by ON document_submissions(submitted_by);
CREATE INDEX IF NOT EXISTS idx_document_submissions_status ON document_submissions(status);
CREATE INDEX IF NOT EXISTS idx_document_submissions_document_type ON document_submissions(document_type);

-- clinic_notifications 테이블에 metadata 컬럼 추가 (없는 경우)
ALTER TABLE clinic_notifications ADD COLUMN IF NOT EXISTS metadata JSONB;

-- RLS 정책
ALTER TABLE document_submissions ENABLE ROW LEVEL SECURITY;

-- 같은 병원 소속 사용자만 조회 가능
CREATE POLICY "Users can view their clinic document submissions"
  ON document_submissions FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 직원은 자신의 문서만 생성 가능
CREATE POLICY "Users can create their own document submissions"
  ON document_submissions FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- owner만 수정 가능 (승인/반려)
CREATE POLICY "Only owner can update document submissions"
  ON document_submissions FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role = 'owner'
    )
  );
