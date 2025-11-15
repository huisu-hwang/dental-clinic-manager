-- Verify and fix attendance_records RLS policies
-- Date: 2025-11-15
-- Issue: attendance_records 쿼리가 사용자 인증으로 빈 배열 반환

-- =====================================================================
-- 1. Check if RLS is enabled
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE 'RLS Status for attendance_records:';
END $$;

SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'attendance_records';

-- =====================================================================
-- 2. List current RLS policies
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE 'Current RLS Policies:';
END $$;

SELECT
    policyname,
    cmd,
    qual as using_clause,
    with_check
FROM pg_policies
WHERE tablename = 'attendance_records'
ORDER BY policyname;

-- =====================================================================
-- 3. Re-create RLS policies if missing
-- =====================================================================

-- Enable RLS if not enabled
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (if any)
DROP POLICY IF EXISTS "Users can view own clinic attendance" ON attendance_records;
DROP POLICY IF EXISTS "Users can create own attendance" ON attendance_records;
DROP POLICY IF EXISTS "Users can update own attendance" ON attendance_records;
DROP POLICY IF EXISTS "Admins can manage all attendance" ON attendance_records;

-- SELECT: 사용자는 자신의 클리닉 출퇴근 기록 조회 가능
CREATE POLICY "Users can view own clinic attendance" ON attendance_records
  FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- INSERT: 사용자는 자신의 출퇴근 기록 생성 가능
CREATE POLICY "Users can create own attendance" ON attendance_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- UPDATE: 사용자는 자신의 출퇴근 기록 수정 가능
CREATE POLICY "Users can update own attendance" ON attendance_records
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid() AND
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- ALL: 관리자는 모든 출퇴근 기록 관리 가능
CREATE POLICY "Admins can manage all attendance" ON attendance_records
  FOR ALL
  TO authenticated
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- =====================================================================
-- 4. Verify policies were created
-- =====================================================================

DO $$
BEGIN
    RAISE NOTICE 'Policies after recreation:';
END $$;

SELECT
    policyname,
    cmd,
    roles,
    qual as using_clause
FROM pg_policies
WHERE tablename = 'attendance_records'
ORDER BY policyname;
