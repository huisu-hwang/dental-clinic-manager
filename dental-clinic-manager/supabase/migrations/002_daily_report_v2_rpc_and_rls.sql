-- ============================================================================
-- Migration: Daily Report V2 - RPC Function and RLS Policy Fix
-- Created: 2025-11-08
-- Purpose:
--   1. Remove old insecure RLS policies (USING (true))
--   2. Ensure clinic-based RLS policies are active
--   3. Create save_daily_report_v2 RPC function for atomic transactions
-- ============================================================================

-- ====================
-- 1. Remove old insecure RLS policies
-- ====================

-- Drop old policies from supabase-schema.sql (if they exist)
DROP POLICY IF EXISTS "Enable read access for all users" ON daily_reports;
DROP POLICY IF EXISTS "Enable insert access for all users" ON daily_reports;
DROP POLICY IF EXISTS "Enable update access for all users" ON daily_reports;
DROP POLICY IF EXISTS "Enable delete access for all users" ON daily_reports;

DROP POLICY IF EXISTS "Enable read access for all users" ON consult_logs;
DROP POLICY IF EXISTS "Enable insert access for all users" ON consult_logs;
DROP POLICY IF EXISTS "Enable update access for all users" ON consult_logs;
DROP POLICY IF EXISTS "Enable delete access for all users" ON consult_logs;

DROP POLICY IF EXISTS "Enable read access for all users" ON gift_logs;
DROP POLICY IF EXISTS "Enable insert access for all users" ON gift_logs;
DROP POLICY IF EXISTS "Enable update access for all users" ON gift_logs;
DROP POLICY IF EXISTS "Enable delete access for all users" ON gift_logs;

DROP POLICY IF EXISTS "Enable all operations for everyone" ON happy_call_logs;

-- ====================
-- 2. Ensure clinic-based RLS policies exist (from 001_multi_tenant_schema.sql)
-- ====================

-- These policies should already exist from migration 001, but we ensure they're present
DO $$
BEGIN
    -- daily_reports policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'daily_reports'
        AND policyname = 'Clinic data isolation for daily_reports'
    ) THEN
        CREATE POLICY "Clinic data isolation for daily_reports" ON daily_reports
            FOR ALL USING (
                clinic_id IN (
                    SELECT clinic_id FROM users WHERE id = auth.uid()
                ) OR
                auth.uid() IN (
                    SELECT id FROM users WHERE role = 'master_admin'
                )
            );
    END IF;

    -- consult_logs policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'consult_logs'
        AND policyname = 'Clinic data isolation for consult_logs'
    ) THEN
        CREATE POLICY "Clinic data isolation for consult_logs" ON consult_logs
            FOR ALL USING (
                clinic_id IN (
                    SELECT clinic_id FROM users WHERE id = auth.uid()
                ) OR
                auth.uid() IN (
                    SELECT id FROM users WHERE role = 'master_admin'
                )
            );
    END IF;

    -- gift_logs policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'gift_logs'
        AND policyname = 'Clinic data isolation for gift_logs'
    ) THEN
        CREATE POLICY "Clinic data isolation for gift_logs" ON gift_logs
            FOR ALL USING (
                clinic_id IN (
                    SELECT clinic_id FROM users WHERE id = auth.uid()
                ) OR
                auth.uid() IN (
                    SELECT id FROM users WHERE role = 'master_admin'
                )
            );
    END IF;

    -- happy_call_logs policy
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'happy_call_logs'
        AND policyname = 'Clinic data isolation for happy_call_logs'
    ) THEN
        CREATE POLICY "Clinic data isolation for happy_call_logs" ON happy_call_logs
            FOR ALL USING (
                clinic_id IN (
                    SELECT clinic_id FROM users WHERE id = auth.uid()
                ) OR
                auth.uid() IN (
                    SELECT id FROM users WHERE role = 'master_admin'
                )
            );
    END IF;
END $$;

-- ====================
-- 3. Create RPC function for atomic daily report save
-- ====================

/**
 * save_daily_report_v2
 *
 * 일일 보고서를 트랜잭션으로 저장하는 RPC 함수
 *
 * 기능:
 * - 4개 테이블 (daily_reports, consult_logs, gift_logs, happy_call_logs)을 원자적으로 업데이트
 * - DELETE + INSERT 패턴 사용 (UPSERT 효과)
 * - 에러 발생 시 자동 롤백
 * - 성능 로깅 포함
 * - SECURITY INVOKER: 호출자 권한으로 실행 (RLS 자동 적용)
 *
 * 파라미터:
 * - p_clinic_id: 병원 ID (UUID)
 * - p_date: 보고서 날짜 (DATE)
 * - p_daily_report: daily_reports 테이블 데이터 (JSONB)
 * - p_consult_logs: consult_logs 배열 (JSONB)
 * - p_gift_logs: gift_logs 배열 (JSONB)
 * - p_happy_call_logs: happy_call_logs 배열 (JSONB)
 *
 * 반환값:
 * - success: 성공 여부
 * - consult_count: 삽입된 consult_logs 개수
 * - gift_count: 삽입된 gift_logs 개수
 * - happy_call_count: 삽입된 happy_call_logs 개수
 * - execution_time_ms: 실행 시간 (밀리초)
 */
CREATE OR REPLACE FUNCTION save_daily_report_v2(
  p_clinic_id UUID,
  p_date DATE,
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

  -- 미래 날짜 방지
  IF p_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot save future date';
  END IF;

  -- ============================================================
  -- 트랜잭션 시작 (함수 내에서 자동으로 트랜잭션 처리됨)
  -- ============================================================

  RAISE NOTICE '[save_daily_report_v2] Starting transaction for clinic % date %', p_clinic_id, p_date;

  -- ============================================================
  -- 1. 기존 데이터 삭제 (UPSERT 효과)
  -- ============================================================

  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = p_date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = p_date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = p_date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = p_date;

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

-- ====================
-- 4. Grant permissions
-- ====================

GRANT EXECUTE ON FUNCTION save_daily_report_v2 TO authenticated;

-- ====================
-- Migration complete
-- ====================

COMMENT ON FUNCTION save_daily_report_v2 IS '일일 보고서를 트랜잭션으로 저장하는 RPC 함수 (v2)';
