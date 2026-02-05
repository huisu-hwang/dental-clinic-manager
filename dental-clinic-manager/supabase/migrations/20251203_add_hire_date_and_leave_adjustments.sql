-- ============================================
-- 입사일 및 연차 수동 조정 테이블 추가
-- Migration: 20251203_add_hire_date_and_leave_adjustments.sql
-- Created: 2025-12-03
-- ============================================

-- ============================================
-- 1. users 테이블에 hire_date 컬럼 추가
-- ============================================
ALTER TABLE users
ADD COLUMN IF NOT EXISTS hire_date DATE;

COMMENT ON COLUMN users.hire_date IS '입사일 (연차 계산 기준일)';

-- ============================================
-- 2. 연차 수동 조정 테이블 (Leave Adjustments)
-- 원장/실장이 이미 소진한 연차나 추가 연차를 입력할 때 사용
-- ============================================
CREATE TABLE IF NOT EXISTS leave_adjustments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  -- 조정 내용
  adjustment_type VARCHAR(20) NOT NULL CHECK (adjustment_type IN ('deduct', 'add', 'set')),
  -- deduct: 차감 (이미 사용한 연차 입력), add: 추가, set: 설정
  days DECIMAL(4,1) NOT NULL, -- 조정 일수
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100), -- 적용 연도

  -- 상세 정보
  reason TEXT NOT NULL, -- 조정 사유
  leave_type_id UUID REFERENCES leave_types(id), -- 연차 종류 (선택)
  use_date DATE, -- 사용일자 (이미 소진한 연차의 경우)

  -- 조정자 정보
  adjusted_by UUID NOT NULL REFERENCES users(id),
  adjusted_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 성능 최적화 인덱스
CREATE INDEX idx_leave_adjustments_user ON leave_adjustments(user_id, year);
CREATE INDEX idx_leave_adjustments_clinic ON leave_adjustments(clinic_id, year);
CREATE INDEX idx_leave_adjustments_date ON leave_adjustments(adjusted_at DESC);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_leave_adjustments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_adjustments_updated_at
  BEFORE UPDATE ON leave_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_adjustments_updated_at();

-- ============================================
-- 3. RLS (Row Level Security) 정책
-- ============================================
ALTER TABLE leave_adjustments ENABLE ROW LEVEL SECURITY;

-- 같은 클리닉 사용자는 조정 내역 조회 가능
CREATE POLICY "Users can view own clinic adjustments" ON leave_adjustments
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 원장/실장만 연차 조정 가능
CREATE POLICY "Managers can insert adjustments" ON leave_adjustments
  FOR INSERT
  WITH CHECK (
    adjusted_by = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Managers can update adjustments" ON leave_adjustments
  FOR UPDATE
  USING (
    adjusted_by = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Managers can delete adjustments" ON leave_adjustments
  FOR DELETE
  USING (
    adjusted_by = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- ============================================
-- 4. update_leave_balance 함수 수정 (조정 내역 반영)
-- ============================================
CREATE OR REPLACE FUNCTION update_leave_balance(
  p_user_id UUID,
  p_year INTEGER
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_policy_id UUID;
  v_hire_date DATE;
  v_years_of_service DECIMAL(4,1);
  v_total_days INTEGER;
  v_used_days DECIMAL(4,1);
  v_pending_days DECIMAL(4,1);
  v_adjustment_days DECIMAL(4,1);
  v_remaining_days DECIMAL(4,1);
BEGIN
  -- 사용자 정보 가져오기
  SELECT clinic_id, hire_date INTO v_clinic_id, v_hire_date
  FROM users WHERE id = p_user_id;

  -- hire_date가 없으면 created_at 사용
  IF v_hire_date IS NULL THEN
    SELECT created_at::DATE INTO v_hire_date FROM users WHERE id = p_user_id;
  END IF;

  -- 활성 정책 가져오기
  SELECT id INTO v_policy_id
  FROM leave_policies
  WHERE clinic_id = v_clinic_id AND is_active = true AND is_default = true
  LIMIT 1;

  -- 근속 연수 계산
  v_years_of_service := calculate_years_of_service(v_hire_date);

  -- 연차 일수 계산
  v_total_days := calculate_annual_leave_days(v_years_of_service, v_policy_id);

  -- 사용한 연차 계산 (approved 상태만)
  SELECT COALESCE(SUM(lr.total_days), 0) INTO v_used_days
  FROM leave_requests lr
  JOIN leave_types lt ON lr.leave_type_id = lt.id
  WHERE lr.user_id = p_user_id
    AND EXTRACT(YEAR FROM lr.start_date) = p_year
    AND lr.status = 'approved'
    AND lt.deduct_from_annual = true;

  -- 수동 조정 연차 계산 (차감은 +, 추가는 -)
  SELECT COALESCE(SUM(
    CASE
      WHEN adjustment_type = 'deduct' THEN days
      WHEN adjustment_type = 'add' THEN -days
      ELSE 0
    END
  ), 0) INTO v_adjustment_days
  FROM leave_adjustments
  WHERE user_id = p_user_id AND year = p_year;

  -- 승인 대기 중인 연차 계산
  SELECT COALESCE(SUM(lr.total_days), 0) INTO v_pending_days
  FROM leave_requests lr
  JOIN leave_types lt ON lr.leave_type_id = lt.id
  WHERE lr.user_id = p_user_id
    AND EXTRACT(YEAR FROM lr.start_date) = p_year
    AND lr.status = 'pending'
    AND lt.deduct_from_annual = true;

  -- 잔여 연차 계산 (조정 반영)
  v_remaining_days := v_total_days - v_used_days - v_adjustment_days - v_pending_days;

  -- UPSERT
  INSERT INTO employee_leave_balances (
    user_id, clinic_id, year,
    total_days, used_days, pending_days, remaining_days,
    years_of_service, hire_date,
    last_calculated_at
  ) VALUES (
    p_user_id, v_clinic_id, p_year,
    v_total_days, v_used_days + v_adjustment_days, v_pending_days, v_remaining_days,
    v_years_of_service, v_hire_date,
    NOW()
  )
  ON CONFLICT (user_id, year)
  DO UPDATE SET
    total_days = EXCLUDED.total_days,
    used_days = EXCLUDED.used_days,
    pending_days = EXCLUDED.pending_days,
    remaining_days = EXCLUDED.remaining_days,
    years_of_service = EXCLUDED.years_of_service,
    hire_date = EXCLUDED.hire_date,
    last_calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 5. 연차 조정 시 잔여 연차 자동 업데이트 트리거
-- ============================================
CREATE OR REPLACE FUNCTION trigger_update_balance_on_adjustment()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM update_leave_balance(NEW.user_id, NEW.year);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_leave_balance(OLD.user_id, OLD.year);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_adjustments_balance
  AFTER INSERT OR UPDATE OR DELETE ON leave_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_balance_on_adjustment();

-- ============================================
-- 6. 코멘트 추가
-- ============================================
COMMENT ON TABLE leave_adjustments IS '연차 수동 조정 테이블 (이미 소진한 연차, 추가 부여 등)';
COMMENT ON COLUMN leave_adjustments.adjustment_type IS 'deduct=차감(이미 사용), add=추가 부여, set=잔여일 직접 설정';

-- ============================================
-- Migration Complete
-- ============================================
