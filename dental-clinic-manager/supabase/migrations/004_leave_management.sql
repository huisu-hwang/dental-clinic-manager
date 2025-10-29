-- ============================================
-- 연차 관리 시스템 (Leave Management System)
-- Migration: 004_leave_management.sql
-- Created: 2025-10-29
-- ============================================

-- ============================================
-- 1. 연차 정책 설정 (Leave Policies)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  policy_name VARCHAR(100) NOT NULL, -- 정책 이름
  description TEXT, -- 정책 설명

  -- 기본 연차 설정
  base_annual_days INTEGER DEFAULT 15, -- 기본 연차 일수

  -- 근속연수별 연차 일수 (JSONB 배열)
  -- [{"min_years": 0, "max_years": 1, "days": 11, "rule": "monthly"}, ...]
  days_per_year JSONB DEFAULT '[
    {"min_years": 0, "max_years": 1, "days": 11, "rule": "monthly", "description": "1년 미만: 월 1일 (최대 11일)"},
    {"min_years": 1, "max_years": 3, "days": 15, "description": "1년 이상: 15일"},
    {"min_years": 3, "max_years": 5, "days": 16, "description": "3년 이상: 16일"},
    {"min_years": 5, "max_years": 7, "days": 17, "description": "5년 이상: 17일"},
    {"min_years": 7, "max_years": 9, "days": 18, "description": "7년 이상: 18일"},
    {"min_years": 9, "max_years": 11, "days": 19, "description": "9년 이상: 19일"},
    {"min_years": 11, "max_years": 13, "days": 20, "description": "11년 이상: 20일"},
    {"min_years": 13, "max_years": 15, "days": 21, "description": "13년 이상: 21일"},
    {"min_years": 15, "max_years": 17, "days": 22, "description": "15년 이상: 22일"},
    {"min_years": 17, "max_years": 19, "days": 23, "description": "17년 이상: 23일"},
    {"min_years": 19, "max_years": 21, "days": 24, "description": "19년 이상: 24일"},
    {"min_years": 21, "max_years": 100, "days": 25, "description": "21년 이상: 25일 (최대)"}
  ]'::JSONB,

  -- 이월 정책
  carryover_enabled BOOLEAN DEFAULT false, -- 이월 허용 여부
  carryover_max_days INTEGER, -- 최대 이월 일수
  carryover_expiry_months INTEGER DEFAULT 12, -- 이월 연차 만료 개월 (기본 12개월)

  -- 출근율 요건
  min_attendance_rate DECIMAL(5,2) DEFAULT 80.00, -- 최소 출근율 (%) - 연차 발생 조건

  -- 활성화 상태
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- 기본 정책 여부

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- 병원별로 하나의 활성 기본 정책만 허용
CREATE UNIQUE INDEX idx_leave_policies_default ON leave_policies(clinic_id)
  WHERE is_default = true AND is_active = true;

-- 성능 최적화 인덱스
CREATE INDEX idx_leave_policies_clinic ON leave_policies(clinic_id, is_active);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_leave_policies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_policies_updated_at
  BEFORE UPDATE ON leave_policies
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_policies_updated_at();

-- ============================================
-- 2. 연차 종류 (Leave Types)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL, -- 연차 종류 이름 (예: 연차, 반차, 병가, 경조사)
  code VARCHAR(20) NOT NULL, -- 코드 (annual, half_day, sick, family_event, compensatory, unpaid)
  description TEXT, -- 설명

  -- 연차 차감 설정
  is_paid BOOLEAN DEFAULT true, -- 유급 여부
  deduct_from_annual BOOLEAN DEFAULT true, -- 연차에서 차감 여부
  deduct_days DECIMAL(3,1) DEFAULT 1.0, -- 차감 일수 (반차는 0.5)

  -- 신청 요건
  requires_proof BOOLEAN DEFAULT false, -- 증빙 자료 필요 여부
  proof_description TEXT, -- 필요한 증빙 설명 (예: 진단서, 청첩장 등)
  max_consecutive_days INTEGER, -- 최대 연속 사용 일수
  min_notice_days INTEGER DEFAULT 0, -- 최소 사전 신청 일수 (예: 3일 전)

  -- UI 설정
  color VARCHAR(7) DEFAULT '#3B82F6', -- 캘린더 표시 색상
  icon VARCHAR(50), -- 아이콘 (선택)
  display_order INTEGER DEFAULT 0, -- 표시 순서

  -- 활성화 상태
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 병원별 코드 유일성 보장
CREATE UNIQUE INDEX idx_leave_types_clinic_code ON leave_types(clinic_id, code);

-- 성능 최적화 인덱스
CREATE INDEX idx_leave_types_clinic ON leave_types(clinic_id, is_active);
CREATE INDEX idx_leave_types_display_order ON leave_types(display_order);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_leave_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_types_updated_at
  BEFORE UPDATE ON leave_types
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_types_updated_at();

-- ============================================
-- 3. 승인 프로세스 설정 (Leave Approval Workflows)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_approval_workflows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  workflow_name VARCHAR(100) NOT NULL, -- 워크플로우 이름
  description TEXT, -- 설명

  -- 승인 단계 (JSONB 배열)
  -- [{"step": 1, "role": "manager", "description": "실장 승인"}, {"step": 2, "role": "owner", "description": "원장 최종 승인"}]
  steps JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- 활성화 상태
  is_default BOOLEAN DEFAULT false, -- 기본 워크플로우 여부
  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- 병원별로 하나의 활성 기본 워크플로우만 허용
CREATE UNIQUE INDEX idx_leave_workflows_default ON leave_approval_workflows(clinic_id)
  WHERE is_default = true AND is_active = true;

-- 성능 최적화 인덱스
CREATE INDEX idx_leave_workflows_clinic ON leave_approval_workflows(clinic_id, is_active);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_leave_workflows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_workflows_updated_at
  BEFORE UPDATE ON leave_approval_workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_workflows_updated_at();

-- ============================================
-- 4. 직원별 연차 현황 (Employee Leave Balances)
-- ============================================
CREATE TABLE IF NOT EXISTS employee_leave_balances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),

  -- 연차 현황
  total_days DECIMAL(4,1) DEFAULT 0, -- 총 부여 연차 일수
  used_days DECIMAL(4,1) DEFAULT 0, -- 사용한 연차 일수
  pending_days DECIMAL(4,1) DEFAULT 0, -- 승인 대기 중인 연차 일수
  remaining_days DECIMAL(4,1) DEFAULT 0, -- 잔여 연차 일수 (total - used - pending)

  -- 이월 연차
  carryover_days DECIMAL(4,1) DEFAULT 0, -- 이월 연차 일수
  carryover_used DECIMAL(4,1) DEFAULT 0, -- 사용한 이월 연차
  carryover_expiry_date DATE, -- 이월 연차 만료일

  -- 근속 정보
  years_of_service DECIMAL(4,1) DEFAULT 0, -- 근속 연수
  hire_date DATE, -- 입사일

  -- 계산 정보
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자별 년도 유일성 보장
CREATE UNIQUE INDEX idx_employee_leave_balances_user_year ON employee_leave_balances(user_id, year);

-- 성능 최적화 인덱스
CREATE INDEX idx_employee_leave_balances_clinic ON employee_leave_balances(clinic_id, year);
CREATE INDEX idx_employee_leave_balances_user ON employee_leave_balances(user_id);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_employee_leave_balances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_employee_leave_balances_updated_at
  BEFORE UPDATE ON employee_leave_balances
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_leave_balances_updated_at();

-- ============================================
-- 5. 연차 신청 (Leave Requests)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  leave_type_id UUID NOT NULL REFERENCES leave_types(id),

  -- 신청 기간
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  half_day_type VARCHAR(10) CHECK (half_day_type IN ('AM', 'PM', NULL)), -- 반차 타입 (오전/오후)
  total_days DECIMAL(3,1) NOT NULL, -- 신청 일수

  -- 신청 내용
  reason TEXT, -- 신청 사유
  proof_file_url TEXT, -- 증빙 파일 URL (Supabase Storage)
  emergency BOOLEAN DEFAULT false, -- 긴급 신청 여부

  -- 승인 상태
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'withdrawn')),
  workflow_id UUID REFERENCES leave_approval_workflows(id),
  current_step INTEGER DEFAULT 1, -- 현재 승인 단계
  total_steps INTEGER, -- 총 승인 단계 수

  -- 최종 결과
  final_approver_id UUID REFERENCES users(id), -- 최종 승인/반려자
  final_decision_at TIMESTAMPTZ, -- 최종 결정 시간
  rejection_reason TEXT, -- 반려 사유

  -- 타임스탬프
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_date_range CHECK (end_date >= start_date),
  CONSTRAINT positive_days CHECK (total_days > 0)
);

-- 성능 최적화 인덱스
CREATE INDEX idx_leave_requests_user ON leave_requests(user_id, status, start_date DESC);
CREATE INDEX idx_leave_requests_clinic ON leave_requests(clinic_id, status, start_date);
CREATE INDEX idx_leave_requests_status ON leave_requests(status, submitted_at DESC);
CREATE INDEX idx_leave_requests_dates ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_requests_type ON leave_requests(leave_type_id);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_leave_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_requests_updated_at
  BEFORE UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_leave_requests_updated_at();

-- ============================================
-- 6. 연차 승인 히스토리 (Leave Approvals)
-- ============================================
CREATE TABLE IF NOT EXISTS leave_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,

  -- 승인 단계
  step_number INTEGER NOT NULL, -- 승인 단계 번호
  step_name VARCHAR(100), -- 승인 단계 이름 (예: "실장 승인", "원장 최종 승인")

  -- 승인자 정보
  approver_id UUID NOT NULL REFERENCES users(id), -- 승인자
  approver_role VARCHAR(50), -- 승인자 역할 (manager, owner 등)
  approver_name VARCHAR(100), -- 승인자 이름 (캐싱)

  -- 승인 결과
  action VARCHAR(20) NOT NULL CHECK (action IN ('approved', 'rejected', 'forwarded')), -- 승인, 반려, 전달
  comment TEXT, -- 승인/반려 코멘트
  acted_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 성능 최적화 인덱스
CREATE INDEX idx_leave_approvals_request ON leave_approvals(leave_request_id, step_number);
CREATE INDEX idx_leave_approvals_approver ON leave_approvals(approver_id, acted_at DESC);

-- ============================================
-- 7. RLS (Row Level Security) 정책
-- ============================================

-- leave_policies RLS
ALTER TABLE leave_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic policies" ON leave_policies
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage policies" ON leave_policies
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- leave_types RLS
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic leave types" ON leave_types
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage leave types" ON leave_types
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- leave_approval_workflows RLS
ALTER TABLE leave_approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic workflows" ON leave_approval_workflows
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage workflows" ON leave_approval_workflows
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- employee_leave_balances RLS
ALTER TABLE employee_leave_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic balances" ON employee_leave_balances
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "System can manage balances" ON employee_leave_balances
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- leave_requests RLS
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own clinic requests" ON leave_requests
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can create own requests" ON leave_requests
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Users can update own requests" ON leave_requests
  FOR UPDATE
  USING (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage all requests" ON leave_requests
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- leave_approvals RLS
ALTER TABLE leave_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view approvals for own clinic requests" ON leave_approvals
  FOR SELECT
  USING (
    leave_request_id IN (
      SELECT id FROM leave_requests
      WHERE clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "Approvers can create approvals" ON leave_approvals
  FOR INSERT
  WITH CHECK (
    approver_id = auth.uid()
  );

-- ============================================
-- 8. 헬퍼 함수 (Helper Functions)
-- ============================================

-- 8.1 근속 연수 계산 함수
CREATE OR REPLACE FUNCTION calculate_years_of_service(
  p_hire_date DATE,
  p_reference_date DATE DEFAULT CURRENT_DATE
) RETURNS DECIMAL(4,1) AS $$
BEGIN
  RETURN ROUND(
    EXTRACT(YEAR FROM AGE(p_reference_date, p_hire_date)) +
    (EXTRACT(MONTH FROM AGE(p_reference_date, p_hire_date)) / 12.0),
    1
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 8.2 연차 일수 계산 함수
CREATE OR REPLACE FUNCTION calculate_annual_leave_days(
  p_years_of_service DECIMAL,
  p_policy_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_days_config JSONB;
  v_config_item JSONB;
  v_result INTEGER := 15; -- 기본값
BEGIN
  -- 정책에서 days_per_year 가져오기
  SELECT days_per_year INTO v_days_config
  FROM leave_policies
  WHERE id = p_policy_id;

  -- JSONB 배열 순회
  FOR v_config_item IN SELECT * FROM jsonb_array_elements(v_days_config)
  LOOP
    IF p_years_of_service >= (v_config_item->>'min_years')::DECIMAL AND
       p_years_of_service < (v_config_item->>'max_years')::DECIMAL THEN
      v_result := (v_config_item->>'days')::INTEGER;
      EXIT;
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 8.3 연차 잔여 업데이트 함수
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
  v_remaining_days DECIMAL(4,1);
BEGIN
  -- 사용자 정보 가져오기
  SELECT clinic_id INTO v_clinic_id FROM users WHERE id = p_user_id;

  -- 활성 정책 가져오기
  SELECT id INTO v_policy_id
  FROM leave_policies
  WHERE clinic_id = v_clinic_id AND is_active = true AND is_default = true
  LIMIT 1;

  -- 입사일 가져오기 (users 테이블에 hire_date 필드가 있다고 가정, 없으면 created_at 사용)
  SELECT created_at::DATE INTO v_hire_date FROM users WHERE id = p_user_id;

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

  -- 승인 대기 중인 연차 계산
  SELECT COALESCE(SUM(lr.total_days), 0) INTO v_pending_days
  FROM leave_requests lr
  JOIN leave_types lt ON lr.leave_type_id = lt.id
  WHERE lr.user_id = p_user_id
    AND EXTRACT(YEAR FROM lr.start_date) = p_year
    AND lr.status = 'pending'
    AND lt.deduct_from_annual = true;

  -- 잔여 연차 계산
  v_remaining_days := v_total_days - v_used_days - v_pending_days;

  -- UPSERT
  INSERT INTO employee_leave_balances (
    user_id, clinic_id, year,
    total_days, used_days, pending_days, remaining_days,
    years_of_service, hire_date,
    last_calculated_at
  ) VALUES (
    p_user_id, v_clinic_id, p_year,
    v_total_days, v_used_days, v_pending_days, v_remaining_days,
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
    last_calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 8.4 연차 신청 시 잔여 연차 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION trigger_update_leave_balance()
RETURNS TRIGGER AS $$
BEGIN
  -- 신청, 승인, 반려, 취소 시 잔여 연차 업데이트
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM update_leave_balance(NEW.user_id, EXTRACT(YEAR FROM NEW.start_date)::INTEGER);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM update_leave_balance(OLD.user_id, EXTRACT(YEAR FROM OLD.start_date)::INTEGER);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_leave_requests_balance
  AFTER INSERT OR UPDATE OR DELETE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION trigger_update_leave_balance();

-- 8.5 연차 신청 검증 함수
CREATE OR REPLACE FUNCTION validate_leave_request(
  p_user_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_total_days DECIMAL,
  p_leave_type_id UUID
) RETURNS TABLE(is_valid BOOLEAN, error_message TEXT) AS $$
DECLARE
  v_remaining_days DECIMAL(4,1);
  v_deduct_from_annual BOOLEAN;
  v_overlapping_count INTEGER;
BEGIN
  -- 연차 종류 확인
  SELECT lt.deduct_from_annual INTO v_deduct_from_annual
  FROM leave_types lt
  WHERE lt.id = p_leave_type_id;

  -- 연차 차감이 필요한 경우 잔여 연차 확인
  IF v_deduct_from_annual THEN
    SELECT remaining_days INTO v_remaining_days
    FROM employee_leave_balances
    WHERE user_id = p_user_id AND year = EXTRACT(YEAR FROM p_start_date);

    IF v_remaining_days IS NULL THEN
      RETURN QUERY SELECT false, '연차 정보를 찾을 수 없습니다.';
      RETURN;
    END IF;

    IF v_remaining_days < p_total_days THEN
      RETURN QUERY SELECT false, '잔여 연차가 부족합니다. (잔여: ' || v_remaining_days || '일)';
      RETURN;
    END IF;
  END IF;

  -- 겹치는 연차 신청 확인
  SELECT COUNT(*) INTO v_overlapping_count
  FROM leave_requests
  WHERE user_id = p_user_id
    AND status IN ('pending', 'approved')
    AND (
      (start_date <= p_start_date AND end_date >= p_start_date) OR
      (start_date <= p_end_date AND end_date >= p_end_date) OR
      (start_date >= p_start_date AND end_date <= p_end_date)
    );

  IF v_overlapping_count > 0 THEN
    RETURN QUERY SELECT false, '이미 신청된 기간과 겹칩니다.';
    RETURN;
  END IF;

  -- 모든 검증 통과
  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 9. 초기 데이터 삽입
-- ============================================

-- 9.1 기본 연차 종류 삽입 (모든 클리닉에 자동 생성)
-- 주의: 실제 운영 시에는 애플리케이션 레벨에서 클리닉 생성 시 삽입하는 것이 좋습니다.
-- 여기서는 예시로 기본 템플릿을 보여줍니다.

-- 기본 연차 종류 템플릿 함수
CREATE OR REPLACE FUNCTION create_default_leave_types(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 연차 (Annual Leave)
  INSERT INTO leave_types (clinic_id, name, code, description, is_paid, deduct_from_annual, deduct_days, color, display_order)
  VALUES (p_clinic_id, '연차', 'annual', '일반 연차 휴가', true, true, 1.0, '#3B82F6', 1)
  ON CONFLICT DO NOTHING;

  -- 반차 (Half-day Leave)
  INSERT INTO leave_types (clinic_id, name, code, description, is_paid, deduct_from_annual, deduct_days, color, display_order)
  VALUES (p_clinic_id, '반차', 'half_day', '반일 연차 (오전/오후)', true, true, 0.5, '#10B981', 2)
  ON CONFLICT DO NOTHING;

  -- 병가 (Sick Leave)
  INSERT INTO leave_types (clinic_id, name, code, description, is_paid, deduct_from_annual, deduct_days, requires_proof, proof_description, color, display_order)
  VALUES (p_clinic_id, '병가', 'sick', '질병으로 인한 휴가', true, true, 1.0, true, '진단서 또는 소견서', '#F59E0B', 3)
  ON CONFLICT DO NOTHING;

  -- 경조사 (Family Event Leave)
  INSERT INTO leave_types (clinic_id, name, code, description, is_paid, deduct_from_annual, deduct_days, requires_proof, proof_description, color, display_order)
  VALUES (p_clinic_id, '경조사', 'family_event', '경조사 휴가 (결혼, 상 등)', true, false, 1.0, true, '청첩장, 부고 등', '#8B5CF6', 4)
  ON CONFLICT DO NOTHING;

  -- 대체휴가 (Compensatory Leave)
  INSERT INTO leave_types (clinic_id, name, code, description, is_paid, deduct_from_annual, deduct_days, color, display_order)
  VALUES (p_clinic_id, '대체휴가', 'compensatory', '휴일 근무 대체 휴가', true, false, 1.0, '#06B6D4', 5)
  ON CONFLICT DO NOTHING;

  -- 무급휴가 (Unpaid Leave)
  INSERT INTO leave_types (clinic_id, name, code, description, is_paid, deduct_from_annual, deduct_days, color, display_order)
  VALUES (p_clinic_id, '무급휴가', 'unpaid', '무급 개인 사유 휴가', false, false, 1.0, '#6B7280', 6)
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 9.2 기본 승인 프로세스 생성 함수
CREATE OR REPLACE FUNCTION create_default_approval_workflow(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  -- 기본 2단계 승인 프로세스 (실장 -> 원장)
  INSERT INTO leave_approval_workflows (clinic_id, workflow_name, description, steps, is_default, is_active)
  VALUES (
    p_clinic_id,
    '기본 승인 프로세스',
    '실장 승인 후 원장 최종 승인',
    '[
      {"step": 1, "role": "manager", "description": "실장 1차 승인"},
      {"step": 2, "role": "owner", "description": "원장 최종 승인"}
    ]'::JSONB,
    true,
    true
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 9.3 기본 연차 정책 생성 함수
CREATE OR REPLACE FUNCTION create_default_leave_policy(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO leave_policies (
    clinic_id,
    policy_name,
    description,
    is_default,
    is_active
  )
  VALUES (
    p_clinic_id,
    '기본 연차 정책 (근로기준법)',
    '근로기준법에 따른 기본 연차 정책',
    true,
    true
  )
  ON CONFLICT DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 10. 코멘트 추가
-- ============================================

COMMENT ON TABLE leave_policies IS '병원별 연차 정책 설정 (근속연수별 연차 일수, 이월 정책 등)';
COMMENT ON TABLE leave_types IS '연차 종류 정의 (연차, 반차, 병가, 경조사 등)';
COMMENT ON TABLE leave_approval_workflows IS '연차 승인 프로세스 설정 (커스터마이징 가능)';
COMMENT ON TABLE employee_leave_balances IS '직원별 연차 잔여 현황 (년도별)';
COMMENT ON TABLE leave_requests IS '연차 신청 내역';
COMMENT ON TABLE leave_approvals IS '연차 승인/반려 히스토리';

COMMENT ON COLUMN leave_requests.status IS 'pending=승인대기, approved=승인완료, rejected=반려, cancelled=취소, withdrawn=철회';
COMMENT ON COLUMN leave_types.code IS 'annual=연차, half_day=반차, sick=병가, family_event=경조사, compensatory=대체휴가, unpaid=무급휴가';

-- ============================================
-- Migration Complete
-- ============================================
