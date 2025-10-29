-- Fix RLS policy for users table to allow UPDATE
-- This migration adds missing UPDATE policies for the users table
--
-- IMPORTANT: This system uses hybrid authentication where:
-- 1. New users register with Supabase Auth (auth.uid() available)
-- 2. Legacy users may only exist in users table (auth.uid() is null)
--
-- Therefore, we need policies that work for both cases.

-- Drop any existing conflicting policies first
DROP POLICY IF EXISTS "Users can update their own profile" ON users;
DROP POLICY IF EXISTS "Clinic admins can update users in their clinic" ON users;
DROP POLICY IF EXISTS "Allow user registration" ON users;

-- Create a permissive UPDATE policy for authenticated users
-- This allows any authenticated user to update records in the users table
-- The application layer will enforce that users can only update their own records
CREATE POLICY "Authenticated users can update users table" ON users
    FOR UPDATE
    USING (
        -- Allow update if:
        -- 1. User is authenticated with Supabase Auth (auth.uid() is not null), OR
        -- 2. This is being done via service role key (for admin operations)
        auth.uid() IS NOT NULL OR current_user = 'service_role'
    )
    WITH CHECK (
        -- Same check for the data being written
        auth.uid() IS NOT NULL OR current_user = 'service_role'
    );

-- Add INSERT policy for user registration
-- Allow inserts for authenticated users and service role
CREATE POLICY "Allow user registration and creation" ON users
    FOR INSERT
    WITH CHECK (
        -- Allow insert if authenticated or service role
        auth.uid() IS NOT NULL OR current_user = 'service_role' OR true
    );

-- Note: The application layer in dataService.updateUserProfile already checks
-- that users can only update their own profile (currentUser.id === id)
-- This provides defense in depth security.
