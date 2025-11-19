-- ============================================================================
-- New RPC Function: save_daily_report_v3
-- Date: 2025-11-08
-- Purpose: Bypass PostgREST cache issues by creating new function with v3 name
-- Changes from v2:
--   1. Function name changed to save_daily_report_v3
--   2. Ensured p_date is TEXT with explicit ::date casting everywhere
--   3. Fresh function to avoid any caching issues
-- ============================================================================

-- Drop old v3 if exists (clean slate)
DROP FUNCTION IF EXISTS public.save_daily_report_v3 CASCADE;

-- Create new v3 function
CREATE FUNCTION save_daily_report_v3(
  p_clinic_id UUID,
  p_date TEXT,  -- TEXT parameter, will cast to DATE internally
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
  v_date DATE;  -- Store converted date
BEGIN
  start_time := clock_timestamp();

  -- ============================================================
  -- Input validation
  -- ============================================================

  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'date is required';
  END IF;

  -- Convert TEXT to DATE explicitly
  BEGIN
    v_date := p_date::date;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION 'Invalid date format: %', p_date;
  END;

  -- Prevent future dates (allow 1 day grace for testing)
  IF v_date > CURRENT_DATE + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Cannot save future date';
  END IF;

  RAISE NOTICE '[save_daily_report_v3] Starting transaction for clinic % date %', p_clinic_id, v_date;

  -- ============================================================
  -- 1. Delete existing data (UPSERT effect)
  -- ============================================================

  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = v_date;

  -- ============================================================
  -- 2. Insert daily_reports
  -- ============================================================

  INSERT INTO daily_reports
  SELECT * FROM jsonb_populate_record(null::daily_reports, p_daily_report);

  -- ============================================================
  -- 3. Insert consult_logs (array)
  -- ============================================================

  IF p_consult_logs IS NOT NULL AND jsonb_array_length(p_consult_logs) > 0 THEN
    INSERT INTO consult_logs
    SELECT * FROM jsonb_populate_recordset(null::consult_logs, p_consult_logs);
    GET DIAGNOSTICS consult_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v3] Inserted % consult logs', consult_count;
  END IF;

  -- ============================================================
  -- 4. Insert gift_logs
  -- ============================================================

  IF p_gift_logs IS NOT NULL AND jsonb_array_length(p_gift_logs) > 0 THEN
    INSERT INTO gift_logs
    SELECT * FROM jsonb_populate_recordset(null::gift_logs, p_gift_logs);
    GET DIAGNOSTICS gift_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v3] Inserted % gift logs', gift_count;
  END IF;

  -- ============================================================
  -- 5. Insert happy_call_logs
  -- ============================================================

  IF p_happy_call_logs IS NOT NULL AND jsonb_array_length(p_happy_call_logs) > 0 THEN
    INSERT INTO happy_call_logs
    SELECT * FROM jsonb_populate_recordset(null::happy_call_logs, p_happy_call_logs);
    GET DIAGNOSTICS happy_call_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v3] Inserted % happy call logs', happy_call_count;
  END IF;

  -- ============================================================
  -- Success logging
  -- ============================================================

  end_time := clock_timestamp();

  RAISE NOTICE '[save_daily_report_v3] Success: % consult, % gift, % happy_call in %ms',
    consult_count, gift_count, happy_call_count,
    EXTRACT(MILLISECONDS FROM (end_time - start_time));

  -- ============================================================
  -- Return result
  -- ============================================================

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

-- Grant permissions
GRANT EXECUTE ON FUNCTION save_daily_report_v3 TO authenticated;

-- Verify function was created
SELECT
  proname as function_name,
  oidvectortypes(proargtypes) as arguments
FROM pg_proc
WHERE proname = 'save_daily_report_v3'
AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- ============================================================================
-- Instructions:
-- 1. Copy this entire SQL script
-- 2. Go to Supabase SQL Editor
-- 3. Paste and run
-- 4. Update the Server Action to use save_daily_report_v3
-- ============================================================================
