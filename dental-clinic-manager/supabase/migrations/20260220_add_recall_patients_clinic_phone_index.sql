-- ============================================
-- 리콜 환자 중복 조회 성능 인덱스 추가
-- Migration: 20260220_add_recall_patients_clinic_phone_index.sql
-- Created: 2026-02-20
--
-- 목적: 엑셀 업로드 시 phone_number 기반 중복 환자 조회 성능 개선
-- unique 제약 아님 (제외 환자 등 같은 번호가 존재할 수 있음)
-- ============================================

CREATE INDEX IF NOT EXISTS idx_recall_patients_clinic_phone
ON recall_patients(clinic_id, phone_number);
