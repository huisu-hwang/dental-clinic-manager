-- ============================================================================
-- Migration: Fix clinic_id missing in gift_logs, consult_logs, happy_call_logs
-- Created: 2026-01-03
-- Purpose: RPC 함수에서 로그 저장 시 clinic_id가 누락되는 버그 수정
--          jsonb_populate_recordset 대신 명시적 INSERT 사용
-- ============================================================================

-- Drop existing function first (all overloads)
DROP FUNCTION IF EXISTS save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION save_daily_report_v2(
  p_clinic_id UUID,
  p_date TEXT,
  p_daily_report JSONB,
  p_consult_logs JSONB,
  p_gift_logs JSONB,
  p_happy_call_logs JSONB,
  p_cash_register JSONB DEFAULT NULL
) RETURNS JSONB AS $function$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  consult_count INT := 0;
  gift_count INT := 0;
  happy_call_count INT := 0;
  cash_register_saved BOOLEAN := FALSE;
  v_previous_balance BIGINT;
  v_current_balance BIGINT;
  v_balance_diff BIGINT;
BEGIN
  start_time := clock_timestamp();

  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'date is required';
  END IF;

  IF p_date::date > CURRENT_DATE + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Cannot save future date';
  END IF;

  RAISE NOTICE '[save_daily_report_v2] Starting transaction for clinic % date %', p_clinic_id, p_date;

  -- ============================================================
  -- 1. 기존 데이터 삭제 (UPSERT 효과)
  -- ============================================================
  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM cash_register_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;

  -- ============================================================
  -- 2. daily_reports 삽입
  -- ============================================================
  INSERT INTO daily_reports
  SELECT * FROM jsonb_populate_record(null::daily_reports, p_daily_report);

  -- ============================================================
  -- 3. consult_logs 삽입 (명시적으로 clinic_id 설정)
  -- ============================================================
  IF p_consult_logs IS NOT NULL AND jsonb_array_length(p_consult_logs) > 0 THEN
    WITH logs AS (
      SELECT jsonb_array_elements(p_consult_logs) AS log
    )
    INSERT INTO consult_logs (date, patient_name, consult_content, consult_status, remarks, clinic_id)
    SELECT
      (log->>'date')::date,
      log->>'patient_name',
      log->>'consult_content',
      log->>'consult_status',
      log->>'remarks',
      p_clinic_id
    FROM logs;
    GET DIAGNOSTICS consult_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % consult logs with clinic_id %', consult_count, p_clinic_id;
  END IF;

  -- ============================================================
  -- 4. gift_logs 삽입 (명시적으로 clinic_id 및 quantity 설정)
  -- ============================================================
  IF p_gift_logs IS NOT NULL AND jsonb_array_length(p_gift_logs) > 0 THEN
    WITH logs AS (
      SELECT jsonb_array_elements(p_gift_logs) AS log
    )
    INSERT INTO gift_logs (date, patient_name, gift_type, quantity, naver_review, notes, clinic_id)
    SELECT
      (log->>'date')::date,
      log->>'patient_name',
      log->>'gift_type',
      COALESCE((log->>'quantity')::integer, 1),
      log->>'naver_review',
      log->>'notes',
      p_clinic_id
    FROM logs;
    GET DIAGNOSTICS gift_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % gift logs with clinic_id %, quantity values preserved', gift_count, p_clinic_id;
  END IF;

  -- ============================================================
  -- 5. happy_call_logs 삽입 (명시적으로 clinic_id 설정)
  -- ============================================================
  IF p_happy_call_logs IS NOT NULL AND jsonb_array_length(p_happy_call_logs) > 0 THEN
    WITH logs AS (
      SELECT jsonb_array_elements(p_happy_call_logs) AS log
    )
    INSERT INTO happy_call_logs (date, patient_name, treatment, notes, clinic_id)
    SELECT
      (log->>'date')::date,
      log->>'patient_name',
      log->>'treatment',
      log->>'notes',
      p_clinic_id
    FROM logs;
    GET DIAGNOSTICS happy_call_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % happy call logs with clinic_id %', happy_call_count, p_clinic_id;
  END IF;

  -- ============================================================
  -- 6. cash_register_logs 삽입
  -- ============================================================
  IF p_cash_register IS NOT NULL THEN
    v_previous_balance := (
      COALESCE((p_cash_register->>'prev_bill_50000')::int, 0) * 50000 +
      COALESCE((p_cash_register->>'prev_bill_10000')::int, 0) * 10000 +
      COALESCE((p_cash_register->>'prev_bill_5000')::int, 0) * 5000 +
      COALESCE((p_cash_register->>'prev_bill_1000')::int, 0) * 1000 +
      COALESCE((p_cash_register->>'prev_coin_500')::int, 0) * 500 +
      COALESCE((p_cash_register->>'prev_coin_100')::int, 0) * 100
    );

    v_current_balance := (
      COALESCE((p_cash_register->>'curr_bill_50000')::int, 0) * 50000 +
      COALESCE((p_cash_register->>'curr_bill_10000')::int, 0) * 10000 +
      COALESCE((p_cash_register->>'curr_bill_5000')::int, 0) * 5000 +
      COALESCE((p_cash_register->>'curr_bill_1000')::int, 0) * 1000 +
      COALESCE((p_cash_register->>'curr_coin_500')::int, 0) * 500 +
      COALESCE((p_cash_register->>'curr_coin_100')::int, 0) * 100
    );

    v_balance_diff := v_current_balance - v_previous_balance;

    INSERT INTO cash_register_logs (
      date, clinic_id,
      prev_bill_50000, prev_bill_10000, prev_bill_5000, prev_bill_1000, prev_coin_500, prev_coin_100,
      previous_balance,
      curr_bill_50000, curr_bill_10000, curr_bill_5000, curr_bill_1000, curr_coin_500, curr_coin_100,
      current_balance,
      balance_difference, notes,
      created_at, updated_at
    ) VALUES (
      p_date::date, p_clinic_id,
      COALESCE((p_cash_register->>'prev_bill_50000')::int, 0),
      COALESCE((p_cash_register->>'prev_bill_10000')::int, 0),
      COALESCE((p_cash_register->>'prev_bill_5000')::int, 0),
      COALESCE((p_cash_register->>'prev_bill_1000')::int, 0),
      COALESCE((p_cash_register->>'prev_coin_500')::int, 0),
      COALESCE((p_cash_register->>'prev_coin_100')::int, 0),
      v_previous_balance,
      COALESCE((p_cash_register->>'curr_bill_50000')::int, 0),
      COALESCE((p_cash_register->>'curr_bill_10000')::int, 0),
      COALESCE((p_cash_register->>'curr_bill_5000')::int, 0),
      COALESCE((p_cash_register->>'curr_bill_1000')::int, 0),
      COALESCE((p_cash_register->>'curr_coin_500')::int, 0),
      COALESCE((p_cash_register->>'curr_coin_100')::int, 0),
      v_current_balance,
      v_balance_diff,
      p_cash_register->>'notes',
      NOW(), NOW()
    );

    cash_register_saved := TRUE;
    RAISE NOTICE '[save_daily_report_v2] Inserted cash register log with previous_balance: %, current_balance: %', v_previous_balance, v_current_balance;
  END IF;

  -- ============================================================
  -- 7. 성공 및 성능 로깅
  -- ============================================================
  end_time := clock_timestamp();

  RAISE NOTICE '[save_daily_report_v2] Success: % consult, % gift, % happy_call, cash_register: % in %ms',
    consult_count, gift_count, happy_call_count, cash_register_saved,
    EXTRACT(MILLISECONDS FROM (end_time - start_time));

  RETURN jsonb_build_object(
    'success', true,
    'consult_count', consult_count,
    'gift_count', gift_count,
    'happy_call_count', happy_call_count,
    'cash_register_saved', cash_register_saved,
    'execution_time_ms', EXTRACT(MILLISECONDS FROM (end_time - start_time))
  );

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION '[save_daily_report_v2] Error: %', SQLERRM;
END;
$function$ LANGUAGE plpgsql SECURITY INVOKER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- Add comment
COMMENT ON FUNCTION save_daily_report_v2 IS '일일 보고서를 트랜잭션으로 저장하는 RPC 함수 (v2) - clinic_id 명시적 설정 버전';
