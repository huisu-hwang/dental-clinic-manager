-- Migration: Add recall_booking_names column to daily_reports table
-- Date: 2025-11-11
-- Description: 예약 성공 환자 명을 기록하기 위한 컬럼 추가

-- Add recall_booking_names column to daily_reports table
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS recall_booking_names TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN daily_reports.recall_booking_names IS '예약 성공 환자 명 (쉼표로 구분, 예: 홍길동, 김철수, 이영희)';
