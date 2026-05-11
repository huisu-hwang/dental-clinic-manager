-- ============================================
-- 일회성 보정 — 2026-04-14 a1703141 커밋 이전에 서명·완료된 계약서 3건의
-- contract_data.salary_base_type 누락(NULL) 값을 'net'(세후) 으로 명시 보정.
--
-- 배경:
--  - 당시 ContractDetail 의 제4조 헤더는 하드코딩 "(세후)" 였으므로 PDF/화면
--    원본 표기와 일치하는 명시적 값은 'net' 이다.
--  - 직후 표시 폴백 패치(2026-05-11 보강분)에 의해서도 NULL 은 '세후'로 표시되어
--    화면상 차이는 이미 해소되어 있으나, 데이터 무결성 측면에서 명시적 값을
--    보유하기 위한 administrative correction.
--
-- 대상 (모두 status='completed'):
--   fdc352bf-9c22-4c9c-9f40-2d0ffaa7a3da  이진희 (2025-11-07 완료, 360만원)
--   7358af09-35a8-425d-b0c1-1c0768473961  김혜린 (2026-01-27 완료, 400만원)
--   1d42d4f2-b1ff-4f8c-8caa-efd7deb4d6bb  김지성 (2026-03-03 완료, 300만원)
--
-- 절차:
--  1) 같은 트랜잭션 내에서 불변성 트리거 enforce_contract_immutability_trg 만
--     일시 비활성화 (audit 트리거 track_contract_changes 는 그대로 작동하여
--     변경 이력이 contract_change_history 에 자동 기록됨)
--  2) 명시한 3건에 한해 salary_base_type='net' jsonb_set 적용 (이미 값이 있으면
--     NOOP — idempotent)
--  3) 트리거 재활성화
--
-- Migration: 20260511_backfill_pre_a1703141_salary_type.sql
-- Created: 2026-05-11
-- ============================================

BEGIN;

ALTER TABLE employment_contracts
  DISABLE TRIGGER enforce_contract_immutability_trg;

UPDATE employment_contracts
SET contract_data = jsonb_set(contract_data, '{salary_base_type}', '"net"'::jsonb, true)
WHERE id IN (
  'fdc352bf-9c22-4c9c-9f40-2d0ffaa7a3da',  -- 이진희
  '7358af09-35a8-425d-b0c1-1c0768473961',  -- 김혜린
  '1d42d4f2-b1ff-4f8c-8caa-efd7deb4d6bb'   -- 김지성
)
AND (contract_data->>'salary_base_type') IS DISTINCT FROM 'net';

ALTER TABLE employment_contracts
  ENABLE TRIGGER enforce_contract_immutability_trg;

-- 4) audit trail 보강 — track_contract_changes(log_contract_change) 트리거는
--    auth.uid() 가 NULL 인 service_role 호출에서는 INSERT 가 실패하는 구조라
--    이번 administrative UPDATE 의 흔적이 자동 기록되지 않는다.
--    보정 사실 자체가 향후 추적 가능하도록 contract_change_history 에 1건씩
--    명시 INSERT 한다. master_admin 이 없는 환경에서는 owner 로 폴백.
INSERT INTO contract_change_history (
  contract_id, changed_by, change_type, old_data, new_data, change_description
)
SELECT
  c.id,
  COALESCE(
    (SELECT id FROM users WHERE role = 'master_admin' ORDER BY created_at ASC LIMIT 1),
    (SELECT id FROM users WHERE role = 'owner'        ORDER BY created_at ASC LIMIT 1)
  ),
  'updated',
  jsonb_build_object('contract_data', jsonb_build_object('salary_base_type', NULL)),
  jsonb_build_object('contract_data', jsonb_build_object('salary_base_type', 'net')),
  'administrative correction (2026-05-11): salary_base_type backfilled from NULL to ''net'' to match originally signed PDF content. See migration 20260511_backfill_pre_a1703141_salary_type.sql.'
FROM employment_contracts c
WHERE c.id IN (
  'fdc352bf-9c22-4c9c-9f40-2d0ffaa7a3da',
  '7358af09-35a8-425d-b0c1-1c0768473961',
  '1d42d4f2-b1ff-4f8c-8caa-efd7deb4d6bb'
)
AND NOT EXISTS (
  SELECT 1 FROM contract_change_history h
  WHERE h.contract_id = c.id
    AND h.change_description LIKE 'administrative correction (2026-05-11)%'
);

COMMIT;
