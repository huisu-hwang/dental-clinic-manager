-- ============================================================
-- 현금 출납 기록 테이블 생성
-- Created: 2025-12-23
-- ============================================================

-- cash_ledger 테이블: 날짜별 현금 출납 현황
CREATE TABLE IF NOT EXISTS cash_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- 전일 이월액 (화폐 종류별 갯수)
  carried_forward JSONB NOT NULL DEFAULT '{
    "bill_50000": 0,
    "bill_10000": 0,
    "bill_5000": 0,
    "bill_1000": 0,
    "coin_500": 0,
    "coin_100": 0,
    "coin_50": 0,
    "coin_10": 0
  }'::jsonb,
  carried_forward_total BIGINT NOT NULL DEFAULT 0,

  -- 금일 잔액 (화폐 종류별 갯수)
  closing_balance JSONB NOT NULL DEFAULT '{
    "bill_50000": 0,
    "bill_10000": 0,
    "bill_5000": 0,
    "bill_1000": 0,
    "coin_500": 0,
    "coin_100": 0,
    "coin_50": 0,
    "coin_10": 0
  }'::jsonb,
  closing_balance_total BIGINT NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 날짜 + 클리닉 조합은 유일해야 함
  UNIQUE(clinic_id, date)
);

-- cash_ledger_history 테이블: 현금 출납 수정 이력
CREATE TABLE IF NOT EXISTS cash_ledger_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,

  -- 기록 유형: 전일 이월액 또는 금일 잔액
  ledger_type TEXT NOT NULL CHECK (ledger_type IN ('carried_forward', 'closing_balance')),

  -- 화폐 종류별 갯수
  denominations JSONB NOT NULL DEFAULT '{
    "bill_50000": 0,
    "bill_10000": 0,
    "bill_5000": 0,
    "bill_1000": 0,
    "coin_500": 0,
    "coin_100": 0,
    "coin_50": 0,
    "coin_10": 0
  }'::jsonb,
  total_amount BIGINT NOT NULL DEFAULT 0,

  -- 작성자 정보
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL DEFAULT '알 수 없음',

  -- 과거 날짜 수정 여부
  is_past_date_edit BOOLEAN NOT NULL DEFAULT FALSE,

  edited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_cash_ledger_clinic_date ON cash_ledger(clinic_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_history_clinic_date ON cash_ledger_history(clinic_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_history_edited_at ON cash_ledger_history(edited_at DESC);

-- ============================================================
-- RLS (Row Level Security) 정책
-- ============================================================

-- cash_ledger 테이블 RLS 활성화
ALTER TABLE cash_ledger ENABLE ROW LEVEL SECURITY;

-- cash_ledger 조회 정책: 같은 클리닉 사용자만 조회 가능
CREATE POLICY "cash_ledger_select_policy" ON cash_ledger
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- cash_ledger 삽입 정책: 같은 클리닉 사용자만 삽입 가능
CREATE POLICY "cash_ledger_insert_policy" ON cash_ledger
  FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- cash_ledger 수정 정책: 같은 클리닉 사용자만 수정 가능
CREATE POLICY "cash_ledger_update_policy" ON cash_ledger
  FOR UPDATE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- cash_ledger 삭제 정책: 같은 클리닉 사용자만 삭제 가능
CREATE POLICY "cash_ledger_delete_policy" ON cash_ledger
  FOR DELETE
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- cash_ledger_history 테이블 RLS 활성화
ALTER TABLE cash_ledger_history ENABLE ROW LEVEL SECURITY;

-- cash_ledger_history 조회 정책: 같은 클리닉 사용자만 조회 가능
CREATE POLICY "cash_ledger_history_select_policy" ON cash_ledger_history
  FOR SELECT
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- cash_ledger_history 삽입 정책: 같은 클리닉 사용자만 삽입 가능
CREATE POLICY "cash_ledger_history_insert_policy" ON cash_ledger_history
  FOR INSERT
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- ============================================================
-- Realtime 활성화 (실시간 구독 지원)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE cash_ledger;

-- ============================================================
-- 업데이트 시 updated_at 자동 갱신 트리거
-- ============================================================

CREATE OR REPLACE FUNCTION update_cash_ledger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cash_ledger_updated_at_trigger
  BEFORE UPDATE ON cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION update_cash_ledger_updated_at();
