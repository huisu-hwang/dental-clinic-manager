-- 급여 명세서 시스템 테이블 생성
-- 2025-12-10

-- =====================================================================
-- 1. 급여 설정 테이블 (직원별 급여 정보)
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 급여 기준 설정
  salary_type VARCHAR(20) NOT NULL DEFAULT 'gross' CHECK (salary_type IN ('gross', 'net')), -- 세전(gross) 또는 세후(net)
  base_salary INTEGER NOT NULL DEFAULT 0, -- 기본급

  -- 수당 항목 (JSONB)
  allowances JSONB DEFAULT '{}', -- { "식대": 100000, "교통비": 50000, "직책수당": 200000 }

  -- 급여일 설정
  payment_day INTEGER NOT NULL DEFAULT 25 CHECK (payment_day >= 1 AND payment_day <= 31),

  -- 4대보험 설정 (개별 설정 가능)
  national_pension BOOLEAN DEFAULT TRUE, -- 국민연금
  health_insurance BOOLEAN DEFAULT TRUE, -- 건강보험
  long_term_care BOOLEAN DEFAULT TRUE, -- 장기요양보험
  employment_insurance BOOLEAN DEFAULT TRUE, -- 고용보험

  -- 소득세 설정
  income_tax_enabled BOOLEAN DEFAULT TRUE, -- 소득세 공제 여부
  dependents_count INTEGER DEFAULT 1, -- 부양가족 수 (세액 공제 계산용)

  -- 카카오톡 발송 설정
  kakao_notification_enabled BOOLEAN DEFAULT FALSE, -- 카카오톡 알림 활성화
  kakao_phone_number VARCHAR(20), -- 카카오톡 발송용 전화번호

  -- 메모
  notes TEXT,

  -- 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  updated_by UUID REFERENCES users(id),

  -- 고유 제약 (한 직원당 하나의 설정만)
  UNIQUE(clinic_id, employee_user_id)
);

-- =====================================================================
-- 2. 급여 명세서 테이블
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_statements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  employee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payroll_setting_id UUID REFERENCES payroll_settings(id) ON DELETE SET NULL,

  -- 급여 기간
  payment_year INTEGER NOT NULL,
  payment_month INTEGER NOT NULL CHECK (payment_month >= 1 AND payment_month <= 12),
  payment_date DATE NOT NULL, -- 실제 지급일

  -- 지급 항목
  base_salary INTEGER NOT NULL DEFAULT 0, -- 기본급
  allowances JSONB DEFAULT '{}', -- 수당 상세 { "식대": 100000, "교통비": 50000 }
  overtime_pay INTEGER DEFAULT 0, -- 연장근로수당
  bonus INTEGER DEFAULT 0, -- 상여금
  other_earnings INTEGER DEFAULT 0, -- 기타 지급액
  total_earnings INTEGER NOT NULL DEFAULT 0, -- 총 지급액

  -- 공제 항목
  national_pension INTEGER DEFAULT 0, -- 국민연금 (4.5%)
  health_insurance INTEGER DEFAULT 0, -- 건강보험 (3.545%)
  long_term_care INTEGER DEFAULT 0, -- 장기요양보험 (건강보험의 12.95%)
  employment_insurance INTEGER DEFAULT 0, -- 고용보험 (0.9%)
  income_tax INTEGER DEFAULT 0, -- 소득세
  local_income_tax INTEGER DEFAULT 0, -- 지방소득세 (소득세의 10%)
  other_deductions JSONB DEFAULT '{}', -- 기타 공제 항목
  total_deductions INTEGER NOT NULL DEFAULT 0, -- 총 공제액

  -- 실수령액
  net_pay INTEGER NOT NULL DEFAULT 0,

  -- 근태 정보 (해당 월)
  work_days INTEGER DEFAULT 0, -- 근무일수
  overtime_hours DECIMAL(5,1) DEFAULT 0, -- 연장근로시간
  leave_days INTEGER DEFAULT 0, -- 휴가일수

  -- 상태
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'sent', 'viewed')),
  confirmed_at TIMESTAMPTZ, -- 확정일시
  confirmed_by UUID REFERENCES users(id),
  sent_at TIMESTAMPTZ, -- 카카오톡 발송일시
  viewed_at TIMESTAMPTZ, -- 직원 확인일시

  -- 메모
  notes TEXT,

  -- 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),

  -- 고유 제약 (한 직원의 한 달에 하나의 명세서만)
  UNIQUE(clinic_id, employee_user_id, payment_year, payment_month)
);

-- =====================================================================
-- 3. 카카오톡 발송 로그 테이블
-- =====================================================================
CREATE TABLE IF NOT EXISTS payroll_kakao_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payroll_statement_id UUID NOT NULL REFERENCES payroll_statements(id) ON DELETE CASCADE,

  -- 발송 정보
  phone_number VARCHAR(20) NOT NULL,
  template_code VARCHAR(50), -- 카카오 알림톡 템플릿 코드
  message_content TEXT,

  -- 발송 결과
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,

  -- 메타데이터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- =====================================================================
-- 4. 인덱스 생성
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_payroll_settings_clinic ON payroll_settings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payroll_settings_employee ON payroll_settings(employee_user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_statements_clinic ON payroll_statements(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payroll_statements_employee ON payroll_statements(employee_user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_statements_period ON payroll_statements(payment_year, payment_month);
CREATE INDEX IF NOT EXISTS idx_payroll_statements_status ON payroll_statements(status);
CREATE INDEX IF NOT EXISTS idx_payroll_kakao_logs_statement ON payroll_kakao_logs(payroll_statement_id);

-- =====================================================================
-- 5. RLS (Row Level Security) 정책
-- =====================================================================

-- payroll_settings RLS
ALTER TABLE payroll_settings ENABLE ROW LEVEL SECURITY;

-- 병원 소속 직원은 본인 설정 조회 가능
CREATE POLICY "Users can view own payroll settings" ON payroll_settings
  FOR SELECT USING (
    auth.uid() = employee_user_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_settings.clinic_id
      AND role IN ('owner', 'vice_director')
    )
  );

-- owner/vice_director만 급여 설정 생성/수정/삭제 가능
CREATE POLICY "Admins can insert payroll settings" ON payroll_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_settings.clinic_id
      AND role IN ('owner', 'vice_director')
    )
  );

CREATE POLICY "Admins can update payroll settings" ON payroll_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_settings.clinic_id
      AND role IN ('owner', 'vice_director')
    )
  );

CREATE POLICY "Admins can delete payroll settings" ON payroll_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_settings.clinic_id
      AND role = 'owner'
    )
  );

-- payroll_statements RLS
ALTER TABLE payroll_statements ENABLE ROW LEVEL SECURITY;

-- 본인 명세서 또는 관리자는 조회 가능
CREATE POLICY "Users can view own payroll statements" ON payroll_statements
  FOR SELECT USING (
    auth.uid() = employee_user_id OR
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_statements.clinic_id
      AND role IN ('owner', 'vice_director')
    )
  );

-- owner/vice_director만 명세서 생성/수정 가능
CREATE POLICY "Admins can insert payroll statements" ON payroll_statements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_statements.clinic_id
      AND role IN ('owner', 'vice_director')
    )
  );

CREATE POLICY "Admins can update payroll statements" ON payroll_statements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_statements.clinic_id
      AND role IN ('owner', 'vice_director')
    )
  );

-- owner만 명세서 삭제 가능
CREATE POLICY "Only owner can delete payroll statements" ON payroll_statements
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid()
      AND clinic_id = payroll_statements.clinic_id
      AND role = 'owner'
    )
  );

-- payroll_kakao_logs RLS
ALTER TABLE payroll_kakao_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage kakao logs" ON payroll_kakao_logs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM payroll_statements ps
      JOIN users u ON u.clinic_id = ps.clinic_id
      WHERE ps.id = payroll_kakao_logs.payroll_statement_id
      AND u.id = auth.uid()
      AND u.role IN ('owner', 'vice_director')
    )
  );

-- =====================================================================
-- 6. 업데이트 트리거
-- =====================================================================
CREATE OR REPLACE FUNCTION update_payroll_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_payroll_settings_updated_at
  BEFORE UPDATE ON payroll_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_updated_at();

CREATE TRIGGER trigger_payroll_statements_updated_at
  BEFORE UPDATE ON payroll_statements
  FOR EACH ROW
  EXECUTE FUNCTION update_payroll_updated_at();

-- =====================================================================
-- 7. 급여 명세서 자동 생성 함수 (수동 호출 또는 크론으로 사용)
-- =====================================================================
CREATE OR REPLACE FUNCTION generate_monthly_payroll_statements(
  p_clinic_id UUID,
  p_year INTEGER,
  p_month INTEGER
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
  v_setting RECORD;
  v_payment_date DATE;
  v_total_earnings INTEGER;
  v_total_deductions INTEGER;
  v_national_pension INTEGER;
  v_health_insurance INTEGER;
  v_long_term_care INTEGER;
  v_employment_insurance INTEGER;
  v_income_tax INTEGER;
  v_local_income_tax INTEGER;
  v_allowances_total INTEGER;
BEGIN
  -- 각 직원의 급여 설정을 순회
  FOR v_setting IN
    SELECT * FROM payroll_settings
    WHERE clinic_id = p_clinic_id
  LOOP
    -- 이미 해당 월의 명세서가 있으면 건너뛰기
    IF EXISTS (
      SELECT 1 FROM payroll_statements
      WHERE clinic_id = p_clinic_id
      AND employee_user_id = v_setting.employee_user_id
      AND payment_year = p_year
      AND payment_month = p_month
    ) THEN
      CONTINUE;
    END IF;

    -- 급여일 계산
    v_payment_date := make_date(p_year, p_month, LEAST(v_setting.payment_day,
      EXTRACT(DAY FROM (date_trunc('month', make_date(p_year, p_month, 1)) + interval '1 month' - interval '1 day'))::INTEGER));

    -- 수당 합계 계산
    SELECT COALESCE(SUM((value)::INTEGER), 0) INTO v_allowances_total
    FROM jsonb_each_text(v_setting.allowances);

    -- 총 지급액 계산
    v_total_earnings := v_setting.base_salary + v_allowances_total;

    -- 4대보험 계산 (세전 기준)
    IF v_setting.salary_type = 'gross' THEN
      v_national_pension := CASE WHEN v_setting.national_pension THEN ROUND(v_total_earnings * 0.045) ELSE 0 END;
      v_health_insurance := CASE WHEN v_setting.health_insurance THEN ROUND(v_total_earnings * 0.03545) ELSE 0 END;
      v_long_term_care := CASE WHEN v_setting.long_term_care THEN ROUND(v_health_insurance * 0.1295) ELSE 0 END;
      v_employment_insurance := CASE WHEN v_setting.employment_insurance THEN ROUND(v_total_earnings * 0.009) ELSE 0 END;
      v_income_tax := CASE WHEN v_setting.income_tax_enabled THEN ROUND(v_total_earnings * 0.033) ELSE 0 END; -- 간이세액
      v_local_income_tax := ROUND(v_income_tax * 0.1);
    ELSE
      -- 세후 입력인 경우 역산 (간략화된 계산)
      v_national_pension := 0;
      v_health_insurance := 0;
      v_long_term_care := 0;
      v_employment_insurance := 0;
      v_income_tax := 0;
      v_local_income_tax := 0;
    END IF;

    v_total_deductions := v_national_pension + v_health_insurance + v_long_term_care +
                          v_employment_insurance + v_income_tax + v_local_income_tax;

    -- 명세서 생성
    INSERT INTO payroll_statements (
      clinic_id,
      employee_user_id,
      payroll_setting_id,
      payment_year,
      payment_month,
      payment_date,
      base_salary,
      allowances,
      total_earnings,
      national_pension,
      health_insurance,
      long_term_care,
      employment_insurance,
      income_tax,
      local_income_tax,
      total_deductions,
      net_pay,
      status
    ) VALUES (
      p_clinic_id,
      v_setting.employee_user_id,
      v_setting.id,
      p_year,
      p_month,
      v_payment_date,
      v_setting.base_salary,
      v_setting.allowances,
      v_total_earnings,
      v_national_pension,
      v_health_insurance,
      v_long_term_care,
      v_employment_insurance,
      v_income_tax,
      v_local_income_tax,
      v_total_deductions,
      v_total_earnings - v_total_deductions,
      'draft'
    );

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
