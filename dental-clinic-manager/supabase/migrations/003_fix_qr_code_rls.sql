-- ============================================================================
-- Migration: Fix QR Code RLS Policy
-- Created: 2025-11-08
-- Purpose:
--   1. Allow authenticated users to read QR codes for attendance.
--   2. Allow only admins or managers to create (insert) new QR codes.
--   3. Enable RLS on the attendance_qr_codes table.
-- ============================================================================

-- 1. Enable RLS on the table if not already enabled
ALTER TABLE public.attendance_qr_codes ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies to ensure a clean slate
DROP POLICY IF EXISTS "Allow authenticated users to read QR codes" ON public.attendance_qr_codes;
DROP POLICY IF EXISTS "Allow admins and managers to create QR codes" ON public.attendance_qr_codes;

-- 3. Policy: Allow authenticated users to read QR codes
-- All logged-in users need to be able to read the QR code to validate it.
CREATE POLICY "Allow authenticated users to read QR codes"
ON public.attendance_qr_codes
FOR SELECT
TO authenticated
USING (true);

-- 4. Policy: Allow admins and managers to create (insert) QR codes
-- Only users with 'admin' or 'manager' roles can generate new QR codes.
CREATE POLICY "Allow admins and managers to create QR codes"
ON public.attendance_qr_codes
FOR INSERT
TO authenticated
WITH CHECK (
  (get_my_claim('role'))::text IN ('admin', 'manager')
);
