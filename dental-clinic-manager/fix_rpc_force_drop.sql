-- ============================================================================
-- Fix: RPC 함수 강제 삭제 및 재생성
-- Date: 2025-11-08
-- Issue: Function overloading conflict 해결을 위한 강제 삭제
-- ============================================================================

-- 1. 모든 save_daily_report_v2 함수 강제 삭제 (CASCADE)
-- public 스키마의 모든 버전 삭제
DROP FUNCTION IF EXISTS public.save_daily_report_v2 CASCADE;

-- 혹시 남아있을 수 있는 다른 시그니처들도 삭제
DO $$
DECLARE
    func_record RECORD;
BEGIN
    FOR func_record IN
        SELECT proname, oidvectortypes(proargtypes) as argtypes
        FROM pg_proc
        WHERE proname = 'save_daily_report_v2'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS public.%I(%s) CASCADE',
                      func_record.proname,
                      func_record.argtypes);
        RAISE NOTICE 'Dropped function: %(%)', func_record.proname, func_record.argtypes;
    END LOOP;
END $$;

-- 2. 새 함수 생성 (TEXT 파라미터 사용)
CREATE FUNCTION save_daily_report_v2(
  p_clinic_id UUID,
  p_date TEXT,
  p_daily_report JSONB,
  p_consult_logs JSONB,
  p_gift_logs JSONB,
  p_happy_call_logs JSONB
) RETURNS JSONB AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  consult_count INT := 0;
  gift_count INT := 0;
  happy_call_count INT := 0;
BEGIN
  start_time := clock_timestamp();

  -- 입력 검증
  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'date is required';
  END IF;

  -- 미래 날짜 방지 (테스트를 위해 1일 여유 허용)
  IF p_date::date > CURRENT_DATE + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Cannot save future date';
  END IF;

  RAISE NOTICE '[save_daily_report_v2] Starting transaction for clinic % date %', p_clinic_id, p_date;

  -- 기존 데이터 삭제
  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;

  -- daily_reports 삽입
  INSERT INTO daily_reports
  SELECT * FROM jsonb_populate_record(null::daily_reports, p_daily_report);

  -- consult_logs 삽입
  IF p_consult_logs IS NOT NULL AND jsonb_array_length(p_consult_logs) > 0 THEN
    INSERT INTO consult_logs
    SELECT * FROM jsonb_populate_recordset(null::consult_logs, p_consult_logs);
    GET DIAGNOSTICS consult_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % consult logs', consult_count;
  END IF;

  -- gift_logs 삽입
  IF p_gift_logs IS NOT NULL AND jsonb_array_length(p_gift_logs) > 0 THEN
    INSERT INTO gift_logs
    SELECT * FROM jsonb_populate_recordset(null::gift_logs, p_gift_logs);
    GET DIAGNOSTICS gift_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % gift logs', gift_count;
  END IF;

  -- happy_call_logs 삽입
  IF p_happy_call_logs IS NOT NULL AND jsonb_array_length(p_happy_call_logs) > 0 THEN
    INSERT INTO happy_call_logs
    SELECT * FROM jsonb_populate_recordset(null::happy_call_logs, p_happy_call_logs);
    GET DIAGNOSTICS happy_call_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % happy call logs', happy_call_count;
  END IF;

  end_time := clock_timestamp();

  RAISE NOTICE '[save_daily_report_v2] Success: % consult, % gift, % happy_call in %ms',
    consult_count, gift_count, happy_call_count,
    EXTRACT(MILLISECONDS FROM (end_time - start_time));

  RETURN jsonb_build_object(
    'success', true,
    'consult_count', consult_count,
    'gift_count', gift_count,
    'happy_call_count', happy_call_count,
    'execution_time_ms', EXTRACT(MILLISECONDS FROM (end_time - start_time))
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '[save_daily_report_v2] Error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- 3. 권한 부여
GRANT EXECUTE ON FUNCTION save_daily_report_v2 TO authenticated;

-- 4. 확인
SELECT proname, oidvectortypes(proargtypes) as arguments
FROM pg_proc
WHERE proname = 'save_daily_report_v2'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================================================
-- 완료
-- ============================================================================
