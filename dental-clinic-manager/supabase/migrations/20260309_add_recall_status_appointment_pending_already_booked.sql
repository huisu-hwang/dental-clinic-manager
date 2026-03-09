-- ============================================
-- 리콜 상태 enum에 appointment_pending, already_booked 추가
-- 예약보류(appointment_pending): 예약 일정 미확정
-- 이미예약(already_booked): 이미 다른 곳에서 예약됨
-- Created: 2026-03-09
-- ============================================

ALTER TYPE patient_recall_status ADD VALUE IF NOT EXISTS 'appointment_pending';
ALTER TYPE patient_recall_status ADD VALUE IF NOT EXISTS 'already_booked';
