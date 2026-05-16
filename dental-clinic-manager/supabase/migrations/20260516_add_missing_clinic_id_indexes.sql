-- ============================================
-- Add missing clinic_id indexes (perf)
-- Created: 2026-05-16
--
-- 진단 결과: 15개 테이블에 clinic_id 인덱스가 없어 .eq('clinic_id', ...) 필터마다
-- seq scan 비용 발생. 페이지 진입 시 다수 테이블 동시 조회로 누적 지연.
-- CONCURRENTLY 미사용: Supabase migration runner 가 단일 트랜잭션으로 묶기 때문.
-- 대상 테이블은 모두 충분히 작아 락 영향 짧음 (수십~수백 row).
-- ============================================

CREATE INDEX IF NOT EXISTS idx_consult_logs_clinic_id              ON consult_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_clinic_id        ON user_notifications(clinic_id);
CREATE INDEX IF NOT EXISTS idx_happy_call_logs_clinic_id           ON happy_call_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_gift_inventory_clinic_id            ON gift_inventory(clinic_id);
CREATE INDEX IF NOT EXISTS idx_payments_clinic_id                  ON payments(clinic_id);
CREATE INDEX IF NOT EXISTS idx_tooth_conditions_clinic_id          ON tooth_conditions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_medical_records_clinic_id           ON medical_records(clinic_id);
CREATE INDEX IF NOT EXISTS idx_treatment_plans_clinic_id           ON treatment_plans(clinic_id);
CREATE INDEX IF NOT EXISTS idx_patient_images_clinic_id            ON patient_images(clinic_id);
CREATE INDEX IF NOT EXISTS idx_insurance_claims_clinic_id          ON insurance_claims(clinic_id);
CREATE INDEX IF NOT EXISTS idx_bulk_sms_recipients_clinic_id       ON bulk_sms_recipients(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_email_integrations_clinic_id ON clinic_email_integrations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_dentweb_query_results_clinic_id     ON dentweb_query_results(clinic_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_clinic_id          ON user_invitations(clinic_id);
CREATE INDEX IF NOT EXISTS idx_work_schedules_clinic_id            ON work_schedules(clinic_id);

-- gift_logs: 100% seq_scan 발견. clinic_id 인덱스가 있는지 다시 확인.
-- 인덱스가 있어도 통계상 seq 가 더 빠른 경우(작은 테이블)면 무시되니 검증용.
CREATE INDEX IF NOT EXISTS idx_gift_logs_clinic_id_date            ON gift_logs(clinic_id, date DESC);
