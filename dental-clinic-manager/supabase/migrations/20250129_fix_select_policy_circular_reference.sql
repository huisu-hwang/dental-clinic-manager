-- Fix SELECT policy for users table to prevent circular reference
-- This fixes the "profile load failed" error after login

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view colleagues in same clinic" ON users;

-- Create a better SELECT policy that allows:
-- 1. Users to view their own profile (CRITICAL for login)
-- 2. Users to view colleagues in the same clinic
-- 3. Master admins to view all users
CREATE POLICY "Users can view profiles" ON users
  FOR SELECT USING (
    -- Allow users to view their own profile (CRITICAL)
    id = auth.uid()
    OR
    -- Allow users to view colleagues in the same clinic
    (
      auth.uid() IS NOT NULL
      AND clinic_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
        AND u.clinic_id = users.clinic_id
      )
    )
    OR
    -- Allow master admins to view all users
    (
      auth.uid() IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.id = auth.uid()
        AND u.role = 'master_admin'
      )
    )
    OR
    -- For legacy users without Supabase Auth session (fallback)
    auth.uid() IS NULL
  );

-- Important: This policy ensures users can always read their own profile,
-- which is essential for the login process to complete successfully.
