-- ============================================
-- employee_leave_balances 테이블에 누락된 컬럼 추가
-- Migration: 20260417_add_leave_period_columns.sql
-- Created: 2026-04-17
--
-- 문제: initializeBalance 함수에서 leave_period_start, leave_period_end 컬럼을
--       upsert 하려고 했으나 해당 컬럼이 DB에 존재하지 않아 400 오류 발생
--       → 연차 잔여일이 올바르게 계산되어도 DB에 저장되지 않아 1일로 고정됨
-- 해결: 누락된 컬럼 추가
-- ============================================

ALTER TABLE employee_leave_balances
  ADD COLUMN IF NOT EXISTS leave_period_start DATE,
  ADD COLUMN IF NOT EXISTS leave_period_end DATE;
