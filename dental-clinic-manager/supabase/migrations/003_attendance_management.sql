-- ============================================
-- 출퇴근 관리 시스템 (Attendance Management System)
-- Migration: 003_attendance_management.sql
-- Created: 2025-10-29
-- ============================================

-- ============================================
-- 1. 근무 스케줄 설정 (Work Schedules)
-- ============================================
CREATE TABLE IF NOT EXISTS work_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=일요일, 1=월요일, ..., 6=토요일
  start_time TIME NOT NULL, -- 출근 시간 (예: 09:00:00)
  end_time TIME NOT NULL, -- 퇴근 시간 (예: 18:00:00)
  is_work_day BOOLEAN DEFAULT true, -- 근무일 여부 (false면 휴무)
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE, -- 적용 시작일
  effective_until DATE, -- 적용 종료일 (NULL이면 무기한)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  CONSTRAINT valid_date_range CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

-- 중복 스케줄 방지: 같은 사용자의 같은 요일, 같은 기간에 겹치는 스케줄 방지
CREATE UNIQUE INDEX idx_work_schedules_unique ON work_schedules(user_id, day_of_week, effective_from)
  WHERE effective_until IS NULL;

-- 성능 최적화 인덱스
CREATE INDEX idx_work_schedules_user_clinic ON work_schedules(user_id, clinic_id);
CREATE INDEX idx_work_schedules_effective_dates ON work_schedules(effective_from, effective_until);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_work_schedules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_work_schedules_updated_at
  BEFORE UPDATE ON work_schedules
  FOR EACH ROW
  EXECUTE FUNCTION update_work_schedules_updated_at();

-- ============================================
-- 2. QR 코드 관리 (Attendance QR Codes)
-- ============================================
CREATE TABLE IF NOT EXISTS attendance_qr_codes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  qr_code TEXT NOT NULL UNIQUE, -- QR 코드 값 (UUID 또는 암호화된 문자열)
  valid_date DATE NOT NULL DEFAULT CURRENT_DATE, -- 유효 날짜 (당일만 유효)
  latitude DECIMAL(10, 8), -- 병원 위도 (예: 37.12345678)
  longitude DECIMAL(11, 8), -- 병원 경도 (예: 127.12345678)
  radius_meters INTEGER DEFAULT 100, -- 인증 허용 반경 (미터 단위)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (CURRENT_DATE + INTERVAL '1 day'), -- 자정에 만료
  CONSTRAINT positive_radius CHECK (radius_meters > 0)
);

-- 병원별 날짜별 QR 코드 유일성 보장
CREATE UNIQUE INDEX idx_attendance_qr_clinic_date ON attendance_qr_codes(clinic_id, valid_date)
  WHERE is_active = true;

-- QR 코드 검색 최적화
CREATE INDEX idx_attendance_qr_code ON attendance_qr_codes(qr_code) WHERE is_active = true;
CREATE INDEX idx_attendance_qr_valid_date ON attendance_qr_codes(valid_date, is_active);

-- ============================================
-- 3. 출퇴근 기록 (Attendance Records)
-- ============================================
CREATE TABLE IF NOT EXISTS attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE, -- 근무 날짜

  -- 출근 정보
  check_in_time TIMESTAMPTZ, -- 출근 시간
  check_in_latitude DECIMAL(10, 8), -- 출근 위도
  check_in_longitude DECIMAL(11, 8), -- 출근 경도
  check_in_device_info TEXT, -- 출근 기기 정보 (선택)

  -- 퇴근 정보
  check_out_time TIMESTAMPTZ, -- 퇴근 시간
  check_out_latitude DECIMAL(10, 8), -- 퇴근 위도
  check_out_longitude DECIMAL(11, 8), -- 퇴근 경도
  check_out_device_info TEXT, -- 퇴근 기기 정보 (선택)

  -- 예정 시간 (스케줄에서 복사)
  scheduled_start TIME, -- 예정 출근 시간
  scheduled_end TIME, -- 예정 퇴근 시간

  -- 근태 계산 결과
  late_minutes INTEGER DEFAULT 0, -- 지각 시간 (분)
  early_leave_minutes INTEGER DEFAULT 0, -- 조퇴 시간 (분)
  overtime_minutes INTEGER DEFAULT 0, -- 초과근무 시간 (분)
  total_work_minutes INTEGER, -- 총 근무 시간 (분)

  -- 근태 상태
  status VARCHAR(20) DEFAULT 'present' CHECK (status IN ('present', 'late', 'early_leave', 'absent', 'leave', 'holiday')),

  -- 기타
  notes TEXT, -- 특이사항 또는 메모
  is_manually_edited BOOLEAN DEFAULT false, -- 수동 수정 여부
  edited_by UUID REFERENCES users(id), -- 수정자
  edited_at TIMESTAMPTZ, -- 수정 시간

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT valid_check_times CHECK (check_out_time IS NULL OR check_out_time > check_in_time)
);

-- 사용자별 날짜별 유일성 보장 (하루에 하나의 출퇴근 기록)
CREATE UNIQUE INDEX idx_attendance_records_user_date ON attendance_records(user_id, work_date);

-- 성능 최적화 인덱스
CREATE INDEX idx_attendance_records_user ON attendance_records(user_id, work_date DESC);
CREATE INDEX idx_attendance_records_clinic ON attendance_records(clinic_id, work_date DESC);
CREATE INDEX idx_attendance_records_status ON attendance_records(status, work_date);
CREATE INDEX idx_attendance_records_check_in ON attendance_records(check_in_time);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_attendance_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_attendance_records_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_records_updated_at();

-- ============================================
-- 4. 근태 통계 (Attendance Statistics)
-- ============================================
CREATE TABLE IF NOT EXISTS attendance_statistics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),

  -- 근무 일수
  total_work_days INTEGER DEFAULT 0, -- 총 근무 예정일수
  present_days INTEGER DEFAULT 0, -- 출근 일수
  absent_days INTEGER DEFAULT 0, -- 결근 일수
  leave_days INTEGER DEFAULT 0, -- 연차 사용 일수
  holiday_days INTEGER DEFAULT 0, -- 공휴일 일수

  -- 지각 통계
  late_count INTEGER DEFAULT 0, -- 지각 횟수
  total_late_minutes INTEGER DEFAULT 0, -- 총 지각 시간 (분)
  avg_late_minutes DECIMAL(10, 2) DEFAULT 0, -- 평균 지각 시간 (분)

  -- 조퇴 통계
  early_leave_count INTEGER DEFAULT 0, -- 조퇴 횟수
  total_early_leave_minutes INTEGER DEFAULT 0, -- 총 조퇴 시간 (분)
  avg_early_leave_minutes DECIMAL(10, 2) DEFAULT 0, -- 평균 조퇴 시간 (분)

  -- 초과근무 통계
  overtime_count INTEGER DEFAULT 0, -- 초과근무 횟수
  total_overtime_minutes INTEGER DEFAULT 0, -- 총 초과근무 시간 (분)
  avg_overtime_minutes DECIMAL(10, 2) DEFAULT 0, -- 평균 초과근무 시간 (분)

  -- 근무 시간 통계
  total_work_minutes INTEGER DEFAULT 0, -- 총 근무 시간 (분)
  avg_work_minutes_per_day DECIMAL(10, 2) DEFAULT 0, -- 일평균 근무 시간 (분)

  -- 출근율
  attendance_rate DECIMAL(5, 2) DEFAULT 0, -- 출근율 (%) = (present_days / total_work_days) * 100

  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 사용자별 년월 유일성 보장
CREATE UNIQUE INDEX idx_attendance_stats_user_year_month ON attendance_statistics(user_id, year, month);

-- 성능 최적화 인덱스
CREATE INDEX idx_attendance_stats_clinic ON attendance_statistics(clinic_id, year, month);
CREATE INDEX idx_attendance_stats_year_month ON attendance_statistics(year, month);

-- 수정 시간 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_attendance_statistics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_attendance_statistics_updated_at
  BEFORE UPDATE ON attendance_statistics
  FOR EACH ROW
  EXECUTE FUNCTION update_attendance_statistics_updated_at();

-- ============================================
-- 5. RLS (Row Level Security) 정책
-- ============================================

-- work_schedules RLS
ALTER TABLE work_schedules ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 클리닉 스케줄 조회 가능
CREATE POLICY "Users can view own clinic schedules" ON work_schedules
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 관리자는 스케줄 생성/수정 가능 (권한은 애플리케이션 레벨에서 체크)
CREATE POLICY "Managers can manage schedules" ON work_schedules
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- attendance_qr_codes RLS
ALTER TABLE attendance_qr_codes ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 클리닉 QR 코드 조회 가능
CREATE POLICY "Users can view own clinic qr codes" ON attendance_qr_codes
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 관리자만 QR 코드 생성 가능
CREATE POLICY "Admins can manage qr codes" ON attendance_qr_codes
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- attendance_records RLS
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 클리닉 출퇴근 기록 조회 가능
CREATE POLICY "Users can view own clinic attendance" ON attendance_records
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 사용자는 자신의 출퇴근 기록 생성 가능
CREATE POLICY "Users can create own attendance" ON attendance_records
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 사용자는 자신의 출퇴근 기록 수정 가능 (같은 날만)
CREATE POLICY "Users can update own attendance" ON attendance_records
  FOR UPDATE
  USING (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 관리자는 모든 출퇴근 기록 수정/삭제 가능
CREATE POLICY "Admins can manage all attendance" ON attendance_records
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- attendance_statistics RLS
ALTER TABLE attendance_statistics ENABLE ROW LEVEL SECURITY;

-- 사용자는 자신의 클리닉 통계 조회 가능
CREATE POLICY "Users can view own clinic statistics" ON attendance_statistics
  FOR SELECT
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 시스템 또는 관리자만 통계 생성/수정 가능
CREATE POLICY "System can manage statistics" ON attendance_statistics
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- ============================================
-- 6. 헬퍼 함수 (Helper Functions)
-- ============================================

-- 6.1 근태 상태 자동 계산 함수
CREATE OR REPLACE FUNCTION calculate_attendance_status(
  p_check_in_time TIMESTAMPTZ,
  p_check_out_time TIMESTAMPTZ,
  p_scheduled_start TIME,
  p_scheduled_end TIME,
  OUT late_min INTEGER,
  OUT early_leave_min INTEGER,
  OUT overtime_min INTEGER,
  OUT total_work_min INTEGER,
  OUT status VARCHAR
) AS $$
DECLARE
  actual_start TIME;
  actual_end TIME;
  tolerance_minutes INTEGER := 5; -- 5분 허용 범위
BEGIN
  -- 초기화
  late_min := 0;
  early_leave_min := 0;
  overtime_min := 0;
  total_work_min := 0;
  status := 'present';

  -- 출근 기록이 없으면 결근
  IF p_check_in_time IS NULL THEN
    status := 'absent';
    RETURN;
  END IF;

  -- 실제 출퇴근 시간 추출
  actual_start := p_check_in_time::TIME;

  -- 지각 계산 (허용 범위 초과 시)
  IF actual_start > (p_scheduled_start + (tolerance_minutes || ' minutes')::INTERVAL) THEN
    late_min := EXTRACT(EPOCH FROM (actual_start - p_scheduled_start)) / 60;
    status := 'late';
  END IF;

  -- 퇴근 기록이 있는 경우
  IF p_check_out_time IS NOT NULL THEN
    actual_end := p_check_out_time::TIME;

    -- 총 근무 시간 계산
    total_work_min := EXTRACT(EPOCH FROM (p_check_out_time - p_check_in_time)) / 60;

    -- 조퇴 계산 (허용 범위 초과 시)
    IF actual_end < (p_scheduled_end - (tolerance_minutes || ' minutes')::INTERVAL) THEN
      early_leave_min := EXTRACT(EPOCH FROM (p_scheduled_end - actual_end)) / 60;
      IF status = 'late' THEN
        status := 'late'; -- 지각이 우선
      ELSE
        status := 'early_leave';
      END IF;
    END IF;

    -- 초과근무 계산 (허용 범위 초과 시)
    IF actual_end > (p_scheduled_end + (tolerance_minutes || ' minutes')::INTERVAL) THEN
      overtime_min := EXTRACT(EPOCH FROM (actual_end - p_scheduled_end)) / 60;
    END IF;
  END IF;

END;
$$ LANGUAGE plpgsql;

-- 6.2 출퇴근 기록 자동 계산 트리거
CREATE OR REPLACE FUNCTION auto_calculate_attendance()
RETURNS TRIGGER AS $$
DECLARE
  calc_result RECORD;
BEGIN
  -- 예정 시간이 있고, 출근 시간이 있으면 계산
  IF NEW.scheduled_start IS NOT NULL AND NEW.check_in_time IS NOT NULL THEN
    SELECT * INTO calc_result
    FROM calculate_attendance_status(
      NEW.check_in_time,
      NEW.check_out_time,
      NEW.scheduled_start,
      NEW.scheduled_end
    );

    NEW.late_minutes := calc_result.late_min;
    NEW.early_leave_minutes := calc_result.early_leave_min;
    NEW.overtime_minutes := calc_result.overtime_min;
    NEW.total_work_minutes := calc_result.total_work_min;
    NEW.status := calc_result.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_calculate_attendance
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_attendance();

-- 6.3 월별 통계 자동 업데이트 함수
CREATE OR REPLACE FUNCTION update_monthly_statistics(
  p_user_id UUID,
  p_year INTEGER,
  p_month INTEGER
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_stats RECORD;
BEGIN
  -- 사용자의 클리닉 ID 가져오기
  SELECT clinic_id INTO v_clinic_id FROM users WHERE id = p_user_id;

  -- 해당 월의 통계 계산
  SELECT
    COUNT(*) FILTER (WHERE check_in_time IS NOT NULL) as present_days,
    COUNT(*) FILTER (WHERE check_in_time IS NULL AND status = 'absent') as absent_days,
    COUNT(*) FILTER (WHERE status = 'leave') as leave_days,
    COUNT(*) FILTER (WHERE status = 'holiday') as holiday_days,
    COUNT(*) FILTER (WHERE status = 'late') as late_count,
    COALESCE(SUM(late_minutes), 0) as total_late_minutes,
    COUNT(*) FILTER (WHERE status = 'early_leave') as early_leave_count,
    COALESCE(SUM(early_leave_minutes), 0) as total_early_leave_minutes,
    COUNT(*) FILTER (WHERE overtime_minutes > 0) as overtime_count,
    COALESCE(SUM(overtime_minutes), 0) as total_overtime_minutes,
    COALESCE(SUM(total_work_minutes), 0) as total_work_minutes
  INTO v_stats
  FROM attendance_records
  WHERE user_id = p_user_id
    AND EXTRACT(YEAR FROM work_date) = p_year
    AND EXTRACT(MONTH FROM work_date) = p_month;

  -- 통계 테이블에 저장 (UPSERT)
  INSERT INTO attendance_statistics (
    user_id, clinic_id, year, month,
    present_days, absent_days, leave_days, holiday_days,
    late_count, total_late_minutes,
    early_leave_count, total_early_leave_minutes,
    overtime_count, total_overtime_minutes,
    total_work_minutes,
    last_calculated_at
  ) VALUES (
    p_user_id, v_clinic_id, p_year, p_month,
    v_stats.present_days, v_stats.absent_days, v_stats.leave_days, v_stats.holiday_days,
    v_stats.late_count, v_stats.total_late_minutes,
    v_stats.early_leave_count, v_stats.total_early_leave_minutes,
    v_stats.overtime_count, v_stats.total_overtime_minutes,
    v_stats.total_work_minutes,
    NOW()
  )
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET
    present_days = EXCLUDED.present_days,
    absent_days = EXCLUDED.absent_days,
    leave_days = EXCLUDED.leave_days,
    holiday_days = EXCLUDED.holiday_days,
    late_count = EXCLUDED.late_count,
    total_late_minutes = EXCLUDED.total_late_minutes,
    early_leave_count = EXCLUDED.early_leave_count,
    total_early_leave_minutes = EXCLUDED.total_early_leave_minutes,
    overtime_count = EXCLUDED.overtime_count,
    total_overtime_minutes = EXCLUDED.total_overtime_minutes,
    total_work_minutes = EXCLUDED.total_work_minutes,
    last_calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 7. 초기 데이터 및 설정
-- ============================================

-- 코멘트 추가 (테이블 설명)
COMMENT ON TABLE work_schedules IS '직원별 근무 스케줄 설정 (요일별 출퇴근 시간)';
COMMENT ON TABLE attendance_qr_codes IS '병원별 일일 QR 코드 관리';
COMMENT ON TABLE attendance_records IS '직원 출퇴근 기록 및 근태 현황';
COMMENT ON TABLE attendance_statistics IS '월별 근태 통계 (집계 테이블)';

-- 컬럼 코멘트
COMMENT ON COLUMN work_schedules.day_of_week IS '0=일요일, 1=월요일, 2=화요일, 3=수요일, 4=목요일, 5=금요일, 6=토요일';
COMMENT ON COLUMN attendance_records.status IS 'present=정상출근, late=지각, early_leave=조퇴, absent=결근, leave=연차, holiday=공휴일';

-- ============================================
-- Migration Complete
-- ============================================
