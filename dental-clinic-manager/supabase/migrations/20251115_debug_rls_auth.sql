-- Debug RLS auth.uid() and subquery
-- Date: 2025-11-15
-- Purpose: auth.uid()가 제대로 작동하는지 확인

-- =====================================================================
-- 1. Check current user (황희수로 로그인한 상태에서 실행)
-- =====================================================================

SELECT
    auth.uid() as current_user_id,
    auth.email() as current_email,
    auth.role() as current_role;

-- =====================================================================
-- 2. Check what the subquery returns
-- =====================================================================

SELECT clinic_id
FROM users
WHERE id = auth.uid();

-- =====================================================================
-- 3. Check if the attendance record matches
-- =====================================================================

SELECT
    ar.id as record_id,
    ar.user_id,
    ar.clinic_id as record_clinic_id,
    ar.work_date,
    ar.status,
    (SELECT clinic_id FROM users WHERE id = auth.uid()) as my_clinic_id,
    ar.clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid()) as policy_check
FROM attendance_records ar
WHERE ar.work_date = '2025-11-15';

-- =====================================================================
-- 4. Manual RLS policy test
-- =====================================================================

-- Test: 황희수가 볼 수 있는 출근 기록
SELECT
    ar.*,
    'Should be visible by policy' as note
FROM attendance_records ar
WHERE
    ar.work_date = '2025-11-15'
    AND ar.clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid());
