-- ============================================
-- 출퇴근 시간 계산 로직 수정 (타임존 문제 해결)
-- Migration: 20251201_fix_attendance_timezone_calculation.sql
-- Created: 2025-12-01
--
-- 문제: TIMESTAMPTZ를 TIME으로 변환할 때 UTC 기준이 사용되어
--       한국 시간(Asia/Seoul)과 맞지 않았음
-- 해결: AT TIME ZONE 'Asia/Seoul'을 사용하여 올바르게 변환
-- ============================================

-- 6.1 근태 상태 자동 계산 함수 (타임존 수정)
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
  korean_tz TEXT := 'Asia/Seoul';
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

  -- 예정 시간이 없으면 계산 불가 (기본값 유지)
  IF p_scheduled_start IS NULL THEN
    RETURN;
  END IF;

  -- 실제 출퇴근 시간 추출 (한국 시간으로 변환)
  actual_start := (p_check_in_time AT TIME ZONE korean_tz)::TIME;

  -- 지각 계산 (허용 범위 초과 시)
  IF actual_start > (p_scheduled_start + (tolerance_minutes || ' minutes')::INTERVAL) THEN
    late_min := GREATEST(0, EXTRACT(EPOCH FROM (actual_start - p_scheduled_start))::INTEGER / 60);
    status := 'late';
  END IF;

  -- 퇴근 기록이 있는 경우
  IF p_check_out_time IS NOT NULL THEN
    -- 실제 퇴근 시간 (한국 시간으로 변환)
    actual_end := (p_check_out_time AT TIME ZONE korean_tz)::TIME;

    -- 총 근무 시간 계산 (출퇴근 시간 차이, 분 단위)
    total_work_min := GREATEST(0, EXTRACT(EPOCH FROM (p_check_out_time - p_check_in_time))::INTEGER / 60);

    -- 예정 퇴근 시간이 있는 경우에만 조퇴/초과근무 계산
    IF p_scheduled_end IS NOT NULL THEN
      -- 조퇴 계산 (허용 범위 초과 시)
      IF actual_end < (p_scheduled_end - (tolerance_minutes || ' minutes')::INTERVAL) THEN
        early_leave_min := GREATEST(0, EXTRACT(EPOCH FROM (p_scheduled_end - actual_end))::INTEGER / 60);
        IF status != 'late' THEN
          status := 'early_leave';
        END IF;
      END IF;

      -- 초과근무 계산 (허용 범위 초과 시)
      IF actual_end > (p_scheduled_end + (tolerance_minutes || ' minutes')::INTERVAL) THEN
        overtime_min := GREATEST(0, EXTRACT(EPOCH FROM (actual_end - p_scheduled_end))::INTEGER / 60);
      END IF;
    END IF;
  END IF;

END;
$$ LANGUAGE plpgsql;

-- 6.2 출퇴근 기록 자동 계산 트리거 (재생성)
CREATE OR REPLACE FUNCTION auto_calculate_attendance()
RETURNS TRIGGER AS $$
DECLARE
  calc_result RECORD;
BEGIN
  -- 출근 시간이 있으면 계산 시도
  IF NEW.check_in_time IS NOT NULL THEN
    SELECT * INTO calc_result
    FROM calculate_attendance_status(
      NEW.check_in_time,
      NEW.check_out_time,
      NEW.scheduled_start,
      NEW.scheduled_end
    );

    NEW.late_minutes := COALESCE(calc_result.late_min, 0);
    NEW.early_leave_minutes := COALESCE(calc_result.early_leave_min, 0);
    NEW.overtime_minutes := COALESCE(calc_result.overtime_min, 0);
    NEW.total_work_minutes := calc_result.total_work_min;

    -- 수동 편집이 아닌 경우에만 상태 업데이트
    IF NOT COALESCE(NEW.is_manually_edited, false) THEN
      NEW.status := COALESCE(calc_result.status, 'present');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 재생성
DROP TRIGGER IF EXISTS trigger_auto_calculate_attendance ON attendance_records;
CREATE TRIGGER trigger_auto_calculate_attendance
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_attendance();

-- ============================================
-- 기존 데이터 재계산 함수
-- ============================================
CREATE OR REPLACE FUNCTION recalculate_all_attendance_records()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER := 0;
  rec RECORD;
  calc_result RECORD;
BEGIN
  FOR rec IN
    SELECT id, check_in_time, check_out_time, scheduled_start, scheduled_end, is_manually_edited
    FROM attendance_records
    WHERE check_in_time IS NOT NULL
  LOOP
    SELECT * INTO calc_result
    FROM calculate_attendance_status(
      rec.check_in_time,
      rec.check_out_time,
      rec.scheduled_start,
      rec.scheduled_end
    );

    UPDATE attendance_records
    SET
      late_minutes = COALESCE(calc_result.late_min, 0),
      early_leave_minutes = COALESCE(calc_result.early_leave_min, 0),
      overtime_minutes = COALESCE(calc_result.overtime_min, 0),
      total_work_minutes = calc_result.total_work_min,
      status = CASE
        WHEN COALESCE(rec.is_manually_edited, false) THEN status
        ELSE COALESCE(calc_result.status, 'present')
      END
    WHERE id = rec.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- 기존 데이터 재계산 실행
SELECT recalculate_all_attendance_records();

-- 재계산 함수 삭제 (일회성 사용)
DROP FUNCTION IF EXISTS recalculate_all_attendance_records();

-- ============================================
-- 월별 통계 업데이트 함수 개선 (평균 계산 추가)
-- ============================================
CREATE OR REPLACE FUNCTION update_monthly_statistics(
  p_user_id UUID,
  p_year INTEGER,
  p_month INTEGER
) RETURNS VOID AS $$
DECLARE
  v_clinic_id UUID;
  v_stats RECORD;
  v_total_work_days INTEGER;
  v_attendance_rate DECIMAL(5,2);
  v_avg_late DECIMAL(10,2);
  v_avg_early_leave DECIMAL(10,2);
  v_avg_overtime DECIMAL(10,2);
  v_avg_work_per_day DECIMAL(10,2);
BEGIN
  -- 사용자의 클리닉 ID 가져오기
  SELECT clinic_id INTO v_clinic_id FROM users WHERE id = p_user_id;

  -- 해당 월의 통계 계산
  SELECT
    COUNT(*) as record_count,
    COUNT(*) FILTER (WHERE check_in_time IS NOT NULL) as present_days,
    COUNT(*) FILTER (WHERE check_in_time IS NULL AND status = 'absent') as absent_days,
    COUNT(*) FILTER (WHERE status = 'leave') as leave_days,
    COUNT(*) FILTER (WHERE status = 'holiday') as holiday_days,
    COUNT(*) FILTER (WHERE late_minutes > 0) as late_count,
    COALESCE(SUM(late_minutes), 0) as total_late_minutes,
    COUNT(*) FILTER (WHERE early_leave_minutes > 0) as early_leave_count,
    COALESCE(SUM(early_leave_minutes), 0) as total_early_leave_minutes,
    COUNT(*) FILTER (WHERE overtime_minutes > 0) as overtime_count,
    COALESCE(SUM(overtime_minutes), 0) as total_overtime_minutes,
    COALESCE(SUM(total_work_minutes), 0) as total_work_minutes
  INTO v_stats
  FROM attendance_records
  WHERE user_id = p_user_id
    AND EXTRACT(YEAR FROM work_date) = p_year
    AND EXTRACT(MONTH FROM work_date) = p_month;

  -- 총 근무 예정일 계산 (출근+결근+연차, 공휴일 제외)
  v_total_work_days := GREATEST(1, v_stats.present_days + v_stats.absent_days + v_stats.leave_days);

  -- 출근율 계산
  v_attendance_rate := CASE
    WHEN v_total_work_days > 0 THEN (v_stats.present_days::DECIMAL / v_total_work_days) * 100
    ELSE 0
  END;

  -- 평균 계산
  v_avg_late := CASE WHEN v_stats.late_count > 0 THEN v_stats.total_late_minutes::DECIMAL / v_stats.late_count ELSE 0 END;
  v_avg_early_leave := CASE WHEN v_stats.early_leave_count > 0 THEN v_stats.total_early_leave_minutes::DECIMAL / v_stats.early_leave_count ELSE 0 END;
  v_avg_overtime := CASE WHEN v_stats.overtime_count > 0 THEN v_stats.total_overtime_minutes::DECIMAL / v_stats.overtime_count ELSE 0 END;
  v_avg_work_per_day := CASE WHEN v_stats.present_days > 0 THEN v_stats.total_work_minutes::DECIMAL / v_stats.present_days ELSE 0 END;

  -- 통계 테이블에 저장 (UPSERT)
  INSERT INTO attendance_statistics (
    user_id, clinic_id, year, month,
    total_work_days, present_days, absent_days, leave_days, holiday_days,
    late_count, total_late_minutes, avg_late_minutes,
    early_leave_count, total_early_leave_minutes, avg_early_leave_minutes,
    overtime_count, total_overtime_minutes, avg_overtime_minutes,
    total_work_minutes, avg_work_minutes_per_day,
    attendance_rate,
    last_calculated_at
  ) VALUES (
    p_user_id, v_clinic_id, p_year, p_month,
    v_total_work_days, v_stats.present_days, v_stats.absent_days, v_stats.leave_days, v_stats.holiday_days,
    v_stats.late_count, v_stats.total_late_minutes, v_avg_late,
    v_stats.early_leave_count, v_stats.total_early_leave_minutes, v_avg_early_leave,
    v_stats.overtime_count, v_stats.total_overtime_minutes, v_avg_overtime,
    v_stats.total_work_minutes, v_avg_work_per_day,
    v_attendance_rate,
    NOW()
  )
  ON CONFLICT (user_id, year, month)
  DO UPDATE SET
    total_work_days = EXCLUDED.total_work_days,
    present_days = EXCLUDED.present_days,
    absent_days = EXCLUDED.absent_days,
    leave_days = EXCLUDED.leave_days,
    holiday_days = EXCLUDED.holiday_days,
    late_count = EXCLUDED.late_count,
    total_late_minutes = EXCLUDED.total_late_minutes,
    avg_late_minutes = EXCLUDED.avg_late_minutes,
    early_leave_count = EXCLUDED.early_leave_count,
    total_early_leave_minutes = EXCLUDED.total_early_leave_minutes,
    avg_early_leave_minutes = EXCLUDED.avg_early_leave_minutes,
    overtime_count = EXCLUDED.overtime_count,
    total_overtime_minutes = EXCLUDED.total_overtime_minutes,
    avg_overtime_minutes = EXCLUDED.avg_overtime_minutes,
    total_work_minutes = EXCLUDED.total_work_minutes,
    avg_work_minutes_per_day = EXCLUDED.avg_work_minutes_per_day,
    attendance_rate = EXCLUDED.attendance_rate,
    last_calculated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Migration Complete
-- ============================================
