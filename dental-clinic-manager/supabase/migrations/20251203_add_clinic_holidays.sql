-- ============================================
-- 병원 휴무일 관리 테이블
-- Migration: 20251203_add_clinic_holidays.sql
-- Created: 2025-12-03
-- ============================================

-- ============================================
-- 1. 병원 휴무일 테이블 (Clinic Holidays)
-- 여름휴가, 겨울휴가, 공휴일 등 병원 전체 휴무일 관리
-- ============================================
CREATE TABLE IF NOT EXISTS clinic_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- 휴무일 정보
  holiday_name VARCHAR(100) NOT NULL, -- 휴무일 이름 (예: 여름휴가, 겨울휴가, 설날)
  holiday_type VARCHAR(50) NOT NULL DEFAULT 'company', -- company(회사지정), public(공휴일), special(특별)
  start_date DATE NOT NULL, -- 시작일
  end_date DATE NOT NULL, -- 종료일
  total_days DECIMAL(4,1) NOT NULL, -- 총 휴무일수 (주말 제외 계산)

  -- 연차 차감 설정
  deduct_from_annual BOOLEAN DEFAULT true, -- 직원 연차에서 차감 여부
  deduct_days DECIMAL(4,1), -- 차감 일수 (NULL이면 total_days와 동일)

  -- 적용 대상
  apply_to_all BOOLEAN DEFAULT true, -- 전체 직원 적용
  excluded_roles TEXT[] DEFAULT '{}', -- 제외할 역할 (예: owner)
  excluded_user_ids UUID[] DEFAULT '{}', -- 제외할 특정 사용자

  -- 적용 상태
  is_applied BOOLEAN DEFAULT false, -- 연차에 적용 완료 여부
  applied_at TIMESTAMPTZ, -- 적용 일시
  applied_by UUID REFERENCES users(id), -- 적용한 사용자

  -- 메모
  description TEXT, -- 설명/메모

  -- 생성 정보
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 성능 최적화 인덱스
CREATE INDEX idx_clinic_holidays_clinic ON clinic_holidays(clinic_id);
CREATE INDEX idx_clinic_holidays_dates ON clinic_holidays(start_date, end_date);
CREATE INDEX idx_clinic_holidays_year ON clinic_holidays(clinic_id, EXTRACT(YEAR FROM start_date));

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_clinic_holidays_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_clinic_holidays_updated_at
  BEFORE UPDATE ON clinic_holidays
  FOR EACH ROW
  EXECUTE FUNCTION update_clinic_holidays_updated_at();

-- ============================================
-- 2. 휴무일 연차 적용 기록 (Holiday Leave Applications)
-- 어떤 직원에게 어떤 휴무일이 적용되었는지 기록
-- ============================================
CREATE TABLE IF NOT EXISTS holiday_leave_applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_holiday_id UUID NOT NULL REFERENCES clinic_holidays(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- 적용 정보
  deducted_days DECIMAL(4,1) NOT NULL, -- 차감된 연차 일수
  year INTEGER NOT NULL, -- 적용 연도

  -- 연관된 연차 조정 ID
  leave_adjustment_id UUID REFERENCES leave_adjustments(id) ON DELETE SET NULL,

  applied_at TIMESTAMPTZ DEFAULT NOW(),
  applied_by UUID NOT NULL REFERENCES users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 중복 적용 방지
CREATE UNIQUE INDEX idx_holiday_applications_unique ON holiday_leave_applications(clinic_holiday_id, user_id);

-- 성능 최적화 인덱스
CREATE INDEX idx_holiday_applications_user ON holiday_leave_applications(user_id, year);
CREATE INDEX idx_holiday_applications_clinic ON holiday_leave_applications(clinic_id, year);

-- ============================================
-- 3. RLS (Row Level Security) 정책
-- ============================================

-- clinic_holidays RLS
ALTER TABLE clinic_holidays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic holidays" ON clinic_holidays
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Owners can manage holidays" ON clinic_holidays
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- holiday_leave_applications RLS
ALTER TABLE holiday_leave_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic applications" ON holiday_leave_applications
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Owners can manage applications" ON holiday_leave_applications
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- ============================================
-- 4. 코멘트 추가
-- ============================================
COMMENT ON TABLE clinic_holidays IS '병원 휴무일 관리 (여름휴가, 겨울휴가 등)';
COMMENT ON COLUMN clinic_holidays.holiday_type IS 'company=회사지정휴일, public=공휴일, special=특별휴일';
COMMENT ON COLUMN clinic_holidays.deduct_from_annual IS '직원 연차에서 차감할지 여부';
COMMENT ON TABLE holiday_leave_applications IS '휴무일 연차 적용 기록';

-- ============================================
-- Migration Complete
-- ============================================
