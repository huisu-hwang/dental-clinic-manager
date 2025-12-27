-- ============================================================================
-- Migration: Update Cash Register Logs (전일/금일 분리 버전)
-- Created: 2025-12-27
-- Purpose: 전일 이월액과 금일 잔액 각각 화폐별 개수 입력으로 변경
-- ============================================================================

-- ====================
-- 1. Drop existing table and recreate with new columns
-- ====================

DROP TABLE IF EXISTS cash_register_logs;

CREATE TABLE cash_register_logs (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL,
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,

    -- 전일 이월액 - 화폐별 개수
    prev_bill_50000 INTEGER DEFAULT 0,     -- 전일 5만원권 개수
    prev_bill_10000 INTEGER DEFAULT 0,     -- 전일 1만원권 개수
    prev_bill_5000 INTEGER DEFAULT 0,      -- 전일 5천원권 개수
    prev_bill_1000 INTEGER DEFAULT 0,      -- 전일 1천원권 개수
    prev_coin_500 INTEGER DEFAULT 0,       -- 전일 500원 동전 개수
    prev_coin_100 INTEGER DEFAULT 0,       -- 전일 100원 동전 개수
    previous_balance BIGINT DEFAULT 0,     -- 전일 이월액 총액 (자동 계산)

    -- 금일 잔액 - 화폐별 개수
    curr_bill_50000 INTEGER DEFAULT 0,     -- 금일 5만원권 개수
    curr_bill_10000 INTEGER DEFAULT 0,     -- 금일 1만원권 개수
    curr_bill_5000 INTEGER DEFAULT 0,      -- 금일 5천원권 개수
    curr_bill_1000 INTEGER DEFAULT 0,      -- 금일 1천원권 개수
    curr_coin_500 INTEGER DEFAULT 0,       -- 금일 500원 동전 개수
    curr_coin_100 INTEGER DEFAULT 0,       -- 금일 100원 동전 개수
    current_balance BIGINT DEFAULT 0,      -- 금일 잔액 총액 (자동 계산)

    -- 차액
    balance_difference BIGINT DEFAULT 0,   -- 차액 (current_balance - previous_balance)

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

DROP POLICY IF EXISTS "Clinic data isolation for cash_register_logs" ON cash_register_logs;

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
-- 3. Update RPC function
-- ====================

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
) RETURNS JSONB AS $$
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

  DELETE FROM daily_reports WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM consult_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM gift_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM happy_call_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;
  DELETE FROM cash_register_logs WHERE clinic_id = p_clinic_id AND date = p_date::date;

  INSERT INTO daily_reports
  SELECT * FROM jsonb_populate_record(null::daily_reports, p_daily_report);

  IF p_consult_logs IS NOT NULL AND jsonb_array_length(p_consult_logs) > 0 THEN
    INSERT INTO consult_logs
    SELECT * FROM jsonb_populate_recordset(null::consult_logs, p_consult_logs);
    GET DIAGNOSTICS consult_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % consult logs', consult_count;
  END IF;

  IF p_gift_logs IS NOT NULL AND jsonb_array_length(p_gift_logs) > 0 THEN
    INSERT INTO gift_logs
    SELECT * FROM jsonb_populate_recordset(null::gift_logs, p_gift_logs);
    GET DIAGNOSTICS gift_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % gift logs', gift_count;
  END IF;

  IF p_happy_call_logs IS NOT NULL AND jsonb_array_length(p_happy_call_logs) > 0 THEN
    INSERT INTO happy_call_logs
    SELECT * FROM jsonb_populate_recordset(null::happy_call_logs, p_happy_call_logs);
    GET DIAGNOSTICS happy_call_count = ROW_COUNT;
    RAISE NOTICE '[save_daily_report_v2] Inserted % happy call logs', happy_call_count;
  END IF;

  IF p_cash_register IS NOT NULL THEN
    -- 전일 이월액 총액 계산
    v_previous_balance := (
      COALESCE((p_cash_register->>'prev_bill_50000')::int, 0) * 50000 +
      COALESCE((p_cash_register->>'prev_bill_10000')::int, 0) * 10000 +
      COALESCE((p_cash_register->>'prev_bill_5000')::int, 0) * 5000 +
      COALESCE((p_cash_register->>'prev_bill_1000')::int, 0) * 1000 +
      COALESCE((p_cash_register->>'prev_coin_500')::int, 0) * 500 +
      COALESCE((p_cash_register->>'prev_coin_100')::int, 0) * 100
    );

    -- 금일 잔액 총액 계산
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
$$ LANGUAGE plpgsql SECURITY INVOKER;

GRANT EXECUTE ON FUNCTION save_daily_report_v2(UUID, TEXT, JSONB, JSONB, JSONB, JSONB, JSONB) TO authenticated;

-- ====================
-- 4. Add updated_at trigger
-- ====================

DROP TRIGGER IF EXISTS update_cash_register_logs_updated_at_trigger ON cash_register_logs;

CREATE TRIGGER update_cash_register_logs_updated_at_trigger
    BEFORE UPDATE ON cash_register_logs
    FOR EACH ROW
    EXECUTE FUNCTION update_cash_register_logs_updated_at();

-- ====================
-- 5. Column comments
-- ====================

COMMENT ON TABLE cash_register_logs IS '일일 현금 출납 기록 테이블 (전일/금일 분리 버전)';
COMMENT ON COLUMN cash_register_logs.prev_bill_50000 IS '전일 5만원권 개수';
COMMENT ON COLUMN cash_register_logs.prev_bill_10000 IS '전일 1만원권 개수';
COMMENT ON COLUMN cash_register_logs.prev_bill_5000 IS '전일 5천원권 개수';
COMMENT ON COLUMN cash_register_logs.prev_bill_1000 IS '전일 1천원권 개수';
COMMENT ON COLUMN cash_register_logs.prev_coin_500 IS '전일 500원 동전 개수';
COMMENT ON COLUMN cash_register_logs.prev_coin_100 IS '전일 100원 동전 개수';
COMMENT ON COLUMN cash_register_logs.previous_balance IS '전일 이월액 총액 (자동 계산)';
COMMENT ON COLUMN cash_register_logs.curr_bill_50000 IS '금일 5만원권 개수';
COMMENT ON COLUMN cash_register_logs.curr_bill_10000 IS '금일 1만원권 개수';
COMMENT ON COLUMN cash_register_logs.curr_bill_5000 IS '금일 5천원권 개수';
COMMENT ON COLUMN cash_register_logs.curr_bill_1000 IS '금일 1천원권 개수';
COMMENT ON COLUMN cash_register_logs.curr_coin_500 IS '금일 500원 동전 개수';
COMMENT ON COLUMN cash_register_logs.curr_coin_100 IS '금일 100원 동전 개수';
COMMENT ON COLUMN cash_register_logs.current_balance IS '금일 잔액 총액 (자동 계산)';
COMMENT ON COLUMN cash_register_logs.balance_difference IS '차액 (금일 잔액 - 전일 이월액)';
