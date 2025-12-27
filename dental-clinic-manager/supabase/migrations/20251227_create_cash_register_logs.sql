-- ============================================================================
-- Migration: Cash Register Logs (현금 출납 기록)
-- Created: 2025-12-27
-- Purpose:
--   1. Create cash_register_logs table for daily cash tracking
--   2. Add RLS policies for clinic-based data isolation
--   3. Update save_daily_report RPC function to include cash register data
-- ============================================================================

-- ====================
-- 1. Create cash_register_logs table
-- ====================

CREATE TABLE IF NOT EXISTS cash_register_logs (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- 화폐별 개수
    bill_50000 INTEGER DEFAULT 0,     -- 5만원권 개수
    bill_10000 INTEGER DEFAULT 0,     -- 1만원권 개수
    bill_5000 INTEGER DEFAULT 0,      -- 5천원권 개수
    bill_1000 INTEGER DEFAULT 0,      -- 1천원권 개수
    coin_500 INTEGER DEFAULT 0,       -- 500원 동전 개수
    coin_100 INTEGER DEFAULT 0,       -- 100원 동전 개수

    -- 계산된 총액 (자동 계산 필드)
    total_cash BIGINT DEFAULT 0,      -- 화폐 개수로 계산된 현금 총액

    -- 이월액 및 잔액
    previous_balance BIGINT DEFAULT 0,    -- 전일 이월액
    current_balance BIGINT DEFAULT 0,     -- 금일 잔액
    balance_difference BIGINT DEFAULT 0,  -- 차액 (current_balance - previous_balance)

    -- 비고
    notes TEXT,

    -- 타임스탬프
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- 유니크 제약: 날짜 + 클리닉별 하나의 레코드만 허용
    UNIQUE(date, clinic_id)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_cash_register_logs_clinic_date
    ON cash_register_logs(clinic_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_cash_register_logs_date
    ON cash_register_logs(date DESC);

-- ====================
-- 2. RLS 활성화 및 정책 설정
-- ====================

ALTER TABLE cash_register_logs ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있는 경우)
DROP POLICY IF EXISTS "Clinic data isolation for cash_register_logs" ON cash_register_logs;

-- 클리닉별 데이터 격리 정책
CREATE POLICY "Clinic data isolation for cash_register_logs" ON cash_register_logs
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- ====================
-- 3. Update RPC function to include cash register logs
-- ====================

-- 기존 함수 삭제 후 재생성
DROP FUNCTION IF EXISTS save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB);

/**
 * save_daily_report_v2
 *
 * 일일 보고서를 트랜잭션으로 저장하는 RPC 함수 (현금 출납 기록 포함)
 *
 * 기능:
 * - 5개 테이블 (daily_reports, consult_logs, gift_logs, happy_call_logs, cash_register_logs)을 원자적으로 업데이트
 * - DELETE + INSERT 패턴 사용 (UPSERT 효과)
 * - 에러 발생 시 자동 롤백
 * - 성능 로깅 포함
 * - SECURITY INVOKER: 호출자 권한으로 실행 (RLS 자동 적용)
 *
 * 파라미터:
 * - p_clinic_id: 병원 ID (UUID)
 * - p_date: 보고서 날짜 (TEXT, YYYY-MM-DD 형식)
 * - p_daily_report: daily_reports 테이블 데이터 (JSONB)
 * - p_consult_logs: consult_logs 배열 (JSONB)
 * - p_gift_logs: gift_logs 배열 (JSONB)
 * - p_happy_call_logs: happy_call_logs 배열 (JSONB)
 * - p_cash_register: cash_register_logs 데이터 (JSONB, optional)
 *
 * 반환값:
 * - success: 성공 여부
 * - consult_count: 삽입된 consult_logs 개수
 * - gift_count: 삽입된 gift_logs 개수
 * - happy_call_count: 삽입된 happy_call_logs 개수
 * - cash_register_saved: cash_register_logs 저장 여부
 * - execution_time_ms: 실행 시간 (밀리초)
 */
CREATE OR REPLACE FUNCTION save_daily_report_v2(
  p_clinic_id UUID,
  p_date TEXT,
  p_daily_report JSONB,
  p_consult_logs JSONB,
  p_gift_logs JSONB,
  p_happy_call_logs JSONB,
  p_cash_register JSONB DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  start_time TIMESTAMP;
  end_time TIMESTAMP;
  consult_count INT := 0;
  gift_count INT := 0;
  happy_call_count INT := 0;
  cash_register_saved BOOLEAN := FALSE;
  v_total_cash BIGINT;
  v_balance_diff BIGINT;
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
  DELETE FROM cash_register_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;

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
  -- 6. cash_register_logs 삽입 (새로 추가)
  -- ============================================================

  IF p_cash_register IS NOT NULL THEN
    -- 총액 계산
    v_total_cash := (
      COALESCE((p_cash_register->>'bill_50000')::int, 0) * 50000 +
      COALESCE((p_cash_register->>'bill_10000')::int, 0) * 10000 +
      COALESCE((p_cash_register->>'bill_5000')::int, 0) * 5000 +
      COALESCE((p_cash_register->>'bill_1000')::int, 0) * 1000 +
      COALESCE((p_cash_register->>'coin_500')::int, 0) * 500 +
      COALESCE((p_cash_register->>'coin_100')::int, 0) * 100
    );

    -- 차액 계산: 금일 잔액 - 전일 이월액
    v_balance_diff := COALESCE((p_cash_register->>'current_balance')::bigint, 0) -
                      COALESCE((p_cash_register->>'previous_balance')::bigint, 0);

    INSERT INTO cash_register_logs (
      date, clinic_id,
      bill_50000, bill_10000, bill_5000, bill_1000, coin_500, coin_100,
      total_cash, previous_balance, current_balance, balance_difference, notes,
      created_at, updated_at
    ) VALUES (
      p_date::date, p_clinic_id,
      COALESCE((p_cash_register->>'bill_50000')::int, 0),
      COALESCE((p_cash_register->>'bill_10000')::int, 0),
      COALESCE((p_cash_register->>'bill_5000')::int, 0),
      COALESCE((p_cash_register->>'bill_1000')::int, 0),
      COALESCE((p_cash_register->>'coin_500')::int, 0),
      COALESCE((p_cash_register->>'coin_100')::int, 0),
      v_total_cash,
      COALESCE((p_cash_register->>'previous_balance')::bigint, 0),
      COALESCE((p_cash_register->>'current_balance')::bigint, 0),
      v_balance_diff,
      p_cash_register->>'notes',
      NOW(), NOW()
    );

    cash_register_saved := TRUE;
    RAISE NOTICE '[save_daily_report_v2] Inserted cash register log with total_cash: %', v_total_cash;
  END IF;

  -- ============================================================
  -- 성공 및 성능 로깅
  -- ============================================================

  end_time := clock_timestamp();

  RAISE NOTICE '[save_daily_report_v2] Success: % consult, % gift, % happy_call, cash_register: % in %ms',
    consult_count, gift_count, happy_call_count, cash_register_saved,
    EXTRACT(MILLISECONDS FROM (end_time - start_time));

  -- ============================================================
  -- 결과 반환
  -- ============================================================

  RETURN jsonb_build_object(
    'success', true,
    'consult_count', consult_count,
    'gift_count', gift_count,
    'happy_call_count', happy_call_count,
    'cash_register_saved', cash_register_saved,
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

GRANT EXECUTE ON FUNCTION save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- ====================
-- 5. Add updated_at trigger
-- ====================

CREATE OR REPLACE FUNCTION update_cash_register_logs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_cash_register_logs_updated_at_trigger ON cash_register_logs;

CREATE TRIGGER update_cash_register_logs_updated_at_trigger
    BEFORE UPDATE ON cash_register_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_register_logs_updated_at();

-- ====================
-- Migration complete
-- ====================

COMMENT ON TABLE cash_register_logs IS '일일 현금 출납 기록 테이블';
COMMENT ON COLUMN cash_register_logs.bill_50000 IS '5만원권 개수';
COMMENT ON COLUMN cash_register_logs.bill_10000 IS '1만원권 개수';
COMMENT ON COLUMN cash_register_logs.bill_5000 IS '5천원권 개수';
COMMENT ON COLUMN cash_register_logs.bill_1000 IS '1천원권 개수';
COMMENT ON COLUMN cash_register_logs.coin_500 IS '500원 동전 개수';
COMMENT ON COLUMN cash_register_logs.coin_100 IS '100원 동전 개수';
COMMENT ON COLUMN cash_register_logs.total_cash IS '화폐 개수 기반 계산된 현금 총액';
COMMENT ON COLUMN cash_register_logs.previous_balance IS '전일 이월액';
COMMENT ON COLUMN cash_register_logs.current_balance IS '금일 잔액';
COMMENT ON COLUMN cash_register_logs.balance_difference IS '차액 (금일 잔액 - 전일 이월액)';
