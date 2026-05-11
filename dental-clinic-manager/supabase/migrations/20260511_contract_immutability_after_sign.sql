-- ============================================
-- 근로계약서 — 서명 단계 이후 contract_data 변경 차단 (불변성)
-- 사용자 보고: a1703141 커밋(2026-04-14)에서 표시 로직만 바뀌었음에도
-- 서명 완료된 계약서의 본문 표기가 "세후 → 세전"으로 보이는 사실상의 문구 변경 발생.
-- 향후 동일/유사한 사고를 막기 위해, status 가 서명 단계 이후이면
-- contract_data JSONB 자체의 변경을 DB 레벨에서 거부한다.
--
-- 허용:
--   - status 자체 전이 (예: pending_*_signature → completed, → cancelled)
--   - status='draft' 인 동안의 자유로운 편집
--
-- 차단:
--   - status IN ('pending_employee_signature','pending_employer_signature','completed')
--     인 row에서 contract_data 의 내용이 달라지면 EXCEPTION
--
-- Migration: 20260511_contract_immutability_after_sign.sql
-- Created: 2026-05-11
-- ============================================

CREATE OR REPLACE FUNCTION enforce_contract_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- 이전 상태(OLD)가 서명 단계 이후일 때만 검사
  IF OLD.status IN ('pending_employee_signature', 'pending_employer_signature', 'completed') THEN
    -- contract_data 가 실제로 바뀌면 차단
    IF (OLD.contract_data IS DISTINCT FROM NEW.contract_data) THEN
      RAISE EXCEPTION
        '서명 단계 이후의 계약서 본문(contract_data)은 변경할 수 없습니다. (contract_id=%, status=%)',
        OLD.id, OLD.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_contract_immutability_trg ON employment_contracts;
CREATE TRIGGER enforce_contract_immutability_trg
  BEFORE UPDATE ON employment_contracts
  FOR EACH ROW
  EXECUTE FUNCTION enforce_contract_immutability();

COMMENT ON FUNCTION enforce_contract_immutability IS
  '근로계약서 본문(contract_data) 불변성 강제 — 서명 단계 이후에는 status 외 변경을 거부';
