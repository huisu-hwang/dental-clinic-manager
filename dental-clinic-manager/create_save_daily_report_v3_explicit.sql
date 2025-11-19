-- ============================================================================
-- RPC Function: save_daily_report_v3 (Explicit INSERT version)
-- Date: 2025-11-08
-- Root Cause: jsonb_populate_record has implicit TEXT = DATE comparison issue
-- Solution: Use explicit INSERT statements instead of jsonb_populate_record
-- ============================================================================

DROP FUNCTION IF EXISTS public.save_daily_report_v3 CASCADE;

CREATE FUNCTION save_daily_report_v3(
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
  v_date DATE;
BEGIN
  start_time := clock_timestamp();

  -- Input validation
  IF p_clinic_id IS NULL THEN RAISE EXCEPTION 'clinic_id is required'; END IF;
  IF p_date IS NULL THEN RAISE EXCEPTION 'date is required'; END IF;

  -- Convert TEXT to DATE explicitly
  v_date := p_date::date;

  -- Prevent future dates
  IF v_date > CURRENT_DATE + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Cannot save future date';
  END IF;

  RAISE NOTICE '[save_daily_report_v3] Starting for clinic % date %', p_clinic_id, v_date;

  -- Delete existing data
  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = v_date;

  -- Insert daily_reports with EXPLICIT column mapping
  INSERT INTO daily_reports (
    clinic_id,
    date,
    naver_review_count,
    consult_proceed,
    consult_hold,
    recall_count,
    recall_booking_count,
    special_notes
  ) VALUES (
    p_clinic_id,
    v_date,  -- Use v_date instead of extracting from JSONB
    (p_daily_report->>'naver_review_count')::int,
    (p_daily_report->>'consult_proceed')::int,
    (p_daily_report->>'consult_hold')::int,
    (p_daily_report->>'recall_count')::int,
    (p_daily_report->>'recall_booking_count')::int,
    p_daily_report->>'special_notes'
  );

  -- Insert consult_logs with EXPLICIT column mapping
  IF p_consult_logs IS NOT NULL AND jsonb_array_length(p_consult_logs) > 0 THEN
    INSERT INTO consult_logs (
      clinic_id,
      date,
      patient_name,
      consult_content,
      proceed,
      notes
    )
    SELECT
      p_clinic_id,
      v_date,  -- Use v_date instead of extracting from JSONB
      item->>'patient_name',
      item->>'consult_content',
      item->>'proceed',
      item->>'notes'
    FROM jsonb_array_elements(p_consult_logs) AS item;

    GET DIAGNOSTICS consult_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v3] Inserted % consult logs', consult_count;
  END IF;

  -- Insert gift_logs with EXPLICIT column mapping
  IF p_gift_logs IS NOT NULL AND jsonb_array_length(p_gift_logs) > 0 THEN
    INSERT INTO gift_logs (
      clinic_id,
      date,
      patient_name,
      gift_type,
      quantity,
      naver_review,
      notes
    )
    SELECT
      p_clinic_id,
      v_date,  -- Use v_date instead of extracting from JSONB
      item->>'patient_name',
      item->>'gift_type',
      (item->>'quantity')::int,
      item->>'naver_review',
      item->>'notes'
    FROM jsonb_array_elements(p_gift_logs) AS item;

    GET DIAGNOSTICS gift_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v3] Inserted % gift logs', gift_count;
  END IF;

  -- Insert happy_call_logs with EXPLICIT column mapping
  IF p_happy_call_logs IS NOT NULL AND jsonb_array_length(p_happy_call_logs) > 0 THEN
    INSERT INTO happy_call_logs (
      clinic_id,
      date,
      patient_name,
      treatment,
      notes
    )
    SELECT
      p_clinic_id,
      v_date,  -- Use v_date instead of extracting from JSONB
      item->>'patient_name',
      item->>'treatment',
      item->>'notes'
    FROM jsonb_array_elements(p_happy_call_logs) AS item;

    GET DIAGNOSTICS happy_call_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v3] Inserted % happy call logs', happy_call_count;
  END IF;

  end_time := clock_timestamp();

  RAISE NOTICE '[save_daily_report_v3] Success: % consult, % gift, % happy_call in %ms',
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
    RAISE EXCEPTION '[save_daily_report_v3] Error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION save_daily_report_v3 TO authenticated;

-- Verify
SELECT proname, oidvectortypes(proargtypes) as arguments
FROM pg_proc
WHERE proname = 'save_daily_report_v3'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================================================
-- Key Changes:
-- 1. Replaced jsonb_populate_record with explicit INSERT ... VALUES
-- 2. Use v_date variable directly instead of extracting from JSONB
-- 3. Explicit column mapping for all tables
-- 4. This eliminates ALL implicit TEXT = DATE comparisons
-- ============================================================================
