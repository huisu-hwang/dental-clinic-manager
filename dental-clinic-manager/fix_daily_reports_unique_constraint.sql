-- ============================================================================
-- Fix daily_reports UNIQUE constraint issue
-- Date: 2025-11-21
-- Issue: duplicate key value violates unique constraint "daily_reports_date_key"
--
-- Problem: The current schema has UNIQUE constraint on 'date' column only,
--          which prevents multiple clinics from creating reports on the same date.
--
-- Solution: Remove single-column UNIQUE constraint and add composite UNIQUE
--          constraint on (clinic_id, date) to allow each clinic to have
--          one report per date.
-- ============================================================================

-- ============================================================================
-- Step 1: Check current constraints
-- ============================================================================
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE rel.relname = 'daily_reports'
  AND nsp.nspname = 'public';

-- Expected to see: "daily_reports_date_key" UNIQUE (date)

-- ============================================================================
-- Step 2: Drop the incorrect UNIQUE constraint on 'date'
-- ============================================================================
ALTER TABLE daily_reports
DROP CONSTRAINT IF EXISTS daily_reports_date_key;

-- Also check for other possible constraint names
ALTER TABLE daily_reports
DROP CONSTRAINT IF EXISTS daily_reports_date_unique;

-- ============================================================================
-- Step 3: Add composite UNIQUE constraint on (clinic_id, date)
-- ============================================================================
-- This ensures each clinic can have only one report per date,
-- but multiple clinics can create reports on the same date
ALTER TABLE daily_reports
ADD CONSTRAINT daily_reports_clinic_date_key
UNIQUE (clinic_id, date);

-- ============================================================================
-- Step 4: Verify the new constraint
-- ============================================================================
SELECT
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE rel.relname = 'daily_reports'
  AND nsp.nspname = 'public'
  AND con.contype = 'u'; -- u = UNIQUE constraint

-- Expected result: "daily_reports_clinic_date_key" UNIQUE (clinic_id, date)

-- ============================================================================
-- Step 5: Test query - verify data integrity
-- ============================================================================
-- Check if there are any duplicate (clinic_id, date) combinations
SELECT
  clinic_id,
  date,
  COUNT(*) as count
FROM daily_reports
GROUP BY clinic_id, date
HAVING COUNT(*) > 1;

-- Expected result: No rows (no duplicates)

-- ============================================================================
-- Step 6: Check that multiple clinics can have reports on the same date
-- ============================================================================
SELECT
  date,
  COUNT(DISTINCT clinic_id) as clinic_count,
  COUNT(*) as report_count
FROM daily_reports
GROUP BY date
ORDER BY date DESC
LIMIT 10;

-- This should show multiple clinics with reports on the same dates

-- ============================================================================
-- Instructions:
-- 1. Copy this entire SQL script
-- 2. Go to Supabase SQL Editor (https://supabase.com/dashboard/project/YOUR_PROJECT/sql)
-- 3. Paste and run the script
-- 4. Verify Steps 4 and 5 show the expected results
-- 5. Test creating daily reports from multiple clinics on the same date
-- ============================================================================

-- ============================================================================
-- Rollback (if needed - DO NOT RUN unless you need to revert)
-- ============================================================================
/*
-- Remove composite constraint
ALTER TABLE daily_reports
DROP CONSTRAINT IF EXISTS daily_reports_clinic_date_key;

-- Re-add single date constraint (NOT RECOMMENDED - this causes the bug)
ALTER TABLE daily_reports
ADD CONSTRAINT daily_reports_date_key
UNIQUE (date);
*/
