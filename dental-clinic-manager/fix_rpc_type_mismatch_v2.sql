-- ============================================================================
-- Fix: RPC 함수 타입 불일치 문제 해결 (v2)
-- Date: 2025-11-08
-- Issue: operator does not exist: text = date
-- Issue 2: Function overloading conflict (두 개의 save_daily_report_v2 함수 존재)
-- Solution:
--   1. 이전 함수 명시적 DROP
--   2. p_date 파라미터를 TEXT로 변경하고 SQL 내에서 ::date 캐스팅 사용
-- ============================================================================

-- 1. 이전 함수 삭제 (모든 시그니처)
DROP FUNCTION IF EXISTS save_daily_report_v2(UUID, DATE, JSONB, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB);

-- 2. 새 함수 생성 (TEXT 파라미터 사용)
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

  -- 미래 날짜 방지 (테스트를 위해 1일 여유 허용)
  IF p_date::date > CURRENT_DATE + INTERVAL '1 day' THEN
    RAISE EXCEPTION 'Cannot save future date';
  END IF;

  -- ============================================================
  -- 트랜잭션 시작 (함수 내에서 자동으로 트랜잭션 처리됨)
  -- ============================================================

  RAISE NOTICE '[save_daily_report_v2] Starting transaction for clinic % date %', p_clinic_id, p_date;

  -- ============================================================
  -- 1. 기존 데이터 삭제 (UPSERT 효과)
  -- ============================================================

  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;

  -- ============================================================
  -- 2. daily_reports 삽입
  -- ============================================================

  INSERT INTO daily_reports
  SELECT * FROM jsonb_populate_record(null::daily_reports, p_daily_report);

  -- ============================================================
  -- 3. consult_logs 삽입 (배열 처리)
  -- ============================================================

  IF p_consult_logs IS NOT NULL AND jsonb_array_length(p_consult_logs) > 0 THEN
    INSERT INTO consult_logs
    SELECT * FROM jsonb_populate_recordset(null::consult_logs, p_consult_logs);
    GET DIAGNOSTICS consult_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % consult logs', consult_count;
  END IF;

  -- ============================================================
  -- 4. gift_logs 삽입
  -- ============================================================

  IF p_gift_logs IS NOT NULL AND jsonb_array_length(p_gift_logs) > 0 THEN
    INSERT INTO gift_logs
    SELECT * FROM jsonb_populate_recordset(null::gift_logs, p_gift_logs);
    GET DIAGNOSTICS gift_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % gift logs', gift_count;
  END IF;

  -- ============================================================
  -- 5. happy_call_logs 삽입
  -- ============================================================

  IF p_happy_call_logs IS NOT NULL AND jsonb_array_length(p_happy_call_logs) > 0 THEN
    INSERT INTO happy_call_logs
    SELECT * FROM jsonb_populate_recordset(null::happy_call_logs, p_happy_call_logs);
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

-- 3. 권한 부여
GRANT EXECUTE ON FUNCTION save_daily_report_v2 TO authenticated;

-- ============================================================================
-- 적용 완료
-- ============================================================================
