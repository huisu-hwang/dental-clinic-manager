-- ============================================================================
-- Migration: Fix save_daily_report_v2 date type casting issue
-- Created: 2025-12-23
-- Purpose: Fix "operator does not exist: text = date" error
--          by properly handling date field in jsonb_populate_record
-- ============================================================================

CREATE OR REPLACE FUNCTION save_daily_report_v2(
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
  v_daily_report JSONB;
BEGIN
  start_time := clock_timestamp();

  -- ============================================================
  -- 입력 검증
  -- ============================================================

  IF p_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id is required';
  END IF;

  IF p_date IS NULL THEN
    RAISE EXCEPTION 'date is required';
  END IF;

  -- 날짜 변환 (TEXT -> DATE)
  v_date := p_date::date;

  -- 미래 날짜 방지 (테스트를 위해 1일 여유 허용)
  IF v_date > CURRENT_DATE + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Cannot save future date';
  END IF;

  -- p_daily_report에서 date 필드를 DATE 타입으로 변환하여 새 JSONB 생성
  -- 또는 date 필드를 제거하고 별도로 처리
  v_daily_report := p_daily_report - 'date';  -- date 필드 제거

  -- ============================================================
  -- 트랜잭션 시작 (함수 내에서 자동으로 트랜잭션 처리됨)
  -- ============================================================

  RAISE NOTICE '[save_daily_report_v2] Starting transaction for clinic % date %', p_clinic_id, v_date;

  -- ============================================================
  -- 1. 기존 데이터 삭제 (UPSERT 효과)
  -- ============================================================

  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = v_date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = v_date;

  -- ============================================================
  -- 2. daily_reports 삽입 (date 필드는 v_date 사용)
  -- ============================================================

  INSERT INTO daily_reports (
    clinic_id,
    date,
    recall_count,
    recall_booking_count,
    recall_booking_names
  ) VALUES (
    p_clinic_id,
    v_date,
    COALESCE((v_daily_report->>'recall_count')::int, 0),
    COALESCE((v_daily_report->>'recall_booking_count')::int, 0),
    COALESCE(v_daily_report->>'recall_booking_names', '')
  );

  -- ============================================================
  -- 3. consult_logs 삽입 (배열 처리)
  -- ============================================================

  IF p_consult_logs IS NOT NULL AND jsonb_array_length(p_consult_logs) > 0 THEN
    INSERT INTO consult_logs (clinic_id, date, patient_name, consult_content, consult_status, remarks)
    SELECT
      p_clinic_id,
      v_date,
      item->>'patient_name',
      item->>'consult_content',
      item->>'consult_status',
      item->>'remarks'
    FROM jsonb_array_elements(p_consult_logs) AS item;
    GET DIAGNOSTICS consult_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % consult logs', consult_count;
  END IF;

  -- ============================================================
  -- 4. gift_logs 삽입
  -- ============================================================

  IF p_gift_logs IS NOT NULL AND jsonb_array_length(p_gift_logs) > 0 THEN
    INSERT INTO gift_logs (clinic_id, date, patient_name, gift_type, quantity, naver_review, notes)
    SELECT
      p_clinic_id,
      v_date,
      item->>'patient_name',
      item->>'gift_type',
      COALESCE((item->>'quantity')::int, 1),
      item->>'naver_review',
      item->>'notes'
    FROM jsonb_array_elements(p_gift_logs) AS item;
    GET DIAGNOSTICS gift_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % gift logs', gift_count;
  END IF;

  -- ============================================================
  -- 5. happy_call_logs 삽입
  -- ============================================================

  IF p_happy_call_logs IS NOT NULL AND jsonb_array_length(p_happy_call_logs) > 0 THEN
    INSERT INTO happy_call_logs (clinic_id, date, patient_name, treatment, notes)
    SELECT
      p_clinic_id,
      v_date,
      item->>'patient_name',
      item->>'treatment',
      item->>'notes'
    FROM jsonb_array_elements(p_happy_call_logs) AS item;
    GET DIAGNOSTICS happy_call_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % happy call logs', happy_call_count;
  END IF;

  -- ============================================================
  -- 성공 및 성능 로깅
  -- ============================================================

  end_time := clock_timestamp();

  RAISE NOTICE '[save_daily_report_v2] Success: % consult, % gift, % happy_call in %ms',
    consult_count, gift_count, happy_call_count,
    EXTRACT(MILLISECONDS FROM (end_time - start_time));

  -- ============================================================
  -- 결과 반환
  -- ============================================================

  RETURN jsonb_build_object(
    'success', true,
    'consult_count', consult_count,
    'gift_count', gift_count,
    'happy_call_count', happy_call_count,
    'execution_time_ms', EXTRACT(MILLISECONDS FROM (end_time - start_time))
  );

  -- 트랜잭션 종료 (자동 COMMIT, 에러 시 자동 ROLLBACK)

EXCEPTION
  WHEN OTHERS THEN
    -- 에러 발생 시 자동 롤백되고 에러 메시지 반환
    RAISE EXCEPTION '[save_daily_report_v2] Error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY INVOKER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION save_daily_report_v2 TO authenticated;

COMMENT ON FUNCTION save_daily_report_v2 IS '일일 보고서를 트랜잭션으로 저장하는 RPC 함수 (v2) - date 타입 캐스팅 수정';
