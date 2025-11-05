-- ============================================
-- 지점 관리 시스템 스키마
-- Clinic Branches System Schema
-- ============================================

-- 1. clinic_branches 테이블 생성
CREATE TABLE IF NOT EXISTS clinic_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  branch_name TEXT NOT NULL,          -- "본점", "강남점", "서초점"
  branch_code TEXT,                   -- 내부 관리 코드 (선택)

  -- 지점 위치 정보
  address TEXT,
  latitude DECIMAL(10, 8),           -- 위도
  longitude DECIMAL(11, 8),          -- 경도

  -- 출근 인증 설정
  attendance_radius_meters INTEGER DEFAULT 100,

  -- 지점별 연락처
  phone TEXT,

  -- 지점 상태
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- 제약조건: 같은 병원 내 지점명 중복 불가
  UNIQUE(clinic_id, branch_name)
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_clinic_branches_clinic
  ON clinic_branches(clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_branches_active
  ON clinic_branches(clinic_id, is_active);

-- 3. 기존 테이블에 branch_id 컬럼 추가 (nullable로 하위 호환성 유지)

-- attendance_qr_codes 테이블
ALTER TABLE attendance_qr_codes
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES clinic_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_qr_branch
  ON attendance_qr_codes(branch_id);

-- attendance_records 테이블
ALTER TABLE attendance_records
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES clinic_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_records_branch
  ON attendance_records(branch_id);

CREATE INDEX IF NOT EXISTS idx_attendance_clinic_branch_date
  ON attendance_records(clinic_id, branch_id, work_date);

-- users 테이블 (주 근무 지점)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS primary_branch_id UUID REFERENCES clinic_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_primary_branch
  ON users(primary_branch_id);

-- 4. RLS (Row Level Security) 정책

-- clinic_branches 테이블 RLS 활성화
ALTER TABLE clinic_branches ENABLE ROW LEVEL SECURITY;

-- 읽기: 자신의 병원 지점만 조회
DROP POLICY IF EXISTS "Users can view branches of their clinic" ON clinic_branches;
CREATE POLICY "Users can view branches of their clinic"
ON clinic_branches FOR SELECT
USING (
  clinic_id IN (
    SELECT clinic_id FROM users WHERE id = auth.uid()
  )
);

-- 생성: owner와 manager만
DROP POLICY IF EXISTS "Owners and managers can create branches" ON clinic_branches;
CREATE POLICY "Owners and managers can create branches"
ON clinic_branches FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND clinic_id = clinic_branches.clinic_id
    AND role IN ('owner', 'manager')
  )
);

-- 수정: owner와 manager만
DROP POLICY IF EXISTS "Owners and managers can update branches" ON clinic_branches;
CREATE POLICY "Owners and managers can update branches"
ON clinic_branches FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND clinic_id = clinic_branches.clinic_id
    AND role IN ('owner', 'manager')
  )
);

-- 삭제: owner만
DROP POLICY IF EXISTS "Owners can delete branches" ON clinic_branches;
CREATE POLICY "Owners can delete branches"
ON clinic_branches FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
    AND clinic_id = clinic_branches.clinic_id
    AND role = 'owner'
  )
);

-- 5. 기존 병원에 "본점" 자동 생성
INSERT INTO clinic_branches (clinic_id, branch_name, is_active, display_order)
SELECT
  id,
  '본점',
  true,
  0
FROM clinics
WHERE NOT EXISTS (
  SELECT 1 FROM clinic_branches WHERE clinic_id = clinics.id
)
ON CONFLICT (clinic_id, branch_name) DO NOTHING;

-- 6. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_clinic_branches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clinic_branches_updated_at ON clinic_branches;
CREATE TRIGGER trigger_clinic_branches_updated_at
BEFORE UPDATE ON clinic_branches
FOR EACH ROW
EXECUTE FUNCTION update_clinic_branches_updated_at();

-- 완료
-- ============================================
-- Migration Complete
-- ============================================
