-- Fix RLS policy for users table to allow UPDATE
-- This migration adds missing UPDATE policies for the users table

-- Drop existing SELECT-only policy if needed (we'll recreate it properly)
-- The original policy only allowed SELECT, not UPDATE

-- Add UPDATE policy: Users can update their own profile
CREATE POLICY "Users can update their own profile" ON users
    FOR UPDATE
    USING (
        -- User can only update their own record
        id = auth.uid()
    )
    WITH CHECK (
        -- Ensure they can only update their own record
        id = auth.uid()
    );

-- Add UPDATE policy for clinic admins: Admins can update users in their clinic
CREATE POLICY "Clinic admins can update users in their clinic" ON users
    FOR UPDATE
    USING (
        -- Check if the current user is an admin (owner, vice_director) in the same clinic
        auth.uid() IN (
            SELECT u.id FROM users u
            WHERE u.clinic_id = users.clinic_id
            AND u.role IN ('owner', 'vice_director', 'master_admin')
        )
    )
    WITH CHECK (
        -- Same check for the updated data
        auth.uid() IN (
            SELECT u.id FROM users u
            WHERE u.clinic_id = users.clinic_id
            AND u.role IN ('owner', 'vice_director', 'master_admin')
        )
    );

-- Add INSERT policy for user registration
CREATE POLICY "Allow user registration" ON users
    FOR INSERT
    WITH CHECK (
        -- Allow insert during registration (will need additional application logic)
        true
    );

-- Note: Master admins already have full access through the existing policies
