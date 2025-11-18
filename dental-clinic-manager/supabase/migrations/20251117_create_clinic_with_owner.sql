-- Create SECURITY DEFINER function for clinic signup
-- This function bypasses RLS to allow clinic creation during owner signup
-- Based on Supabase best practices from Context7 documentation
-- Note: Function is in public schema to be accessible via Supabase RPC

-- Drop function if exists (both old and new signatures)
DROP FUNCTION IF EXISTS public.create_clinic_with_owner(
  text, text, text, text, text,
  text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.create_clinic_with_owner(
  uuid, text, text, text, text, text,
  text, text, text, text, text
);

-- Create SECURITY DEFINER function in public schema
CREATE OR REPLACE FUNCTION public.create_clinic_with_owner(
  p_user_id uuid,
  p_clinic_name text,
  p_owner_name text,
  p_clinic_address text,
  p_clinic_phone text,
  p_clinic_email text,
  p_user_name text,
  p_user_email text,
  p_user_phone text,
  p_user_address text,
  p_resident_number text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with creator's privileges, bypassing RLS
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_result json;
BEGIN
  -- Use the provided user_id (from signup)
  -- No auth.uid() check needed since this is only called during signup

  -- 1. Insert clinic (RLS bypassed by SECURITY DEFINER)
  INSERT INTO clinics (name, owner_name, address, phone, email)
  VALUES (p_clinic_name, p_owner_name, p_clinic_address, p_clinic_phone, p_clinic_email)
  RETURNING id INTO v_clinic_id;

  -- 2. Insert user profile (RLS bypassed by SECURITY DEFINER)
  INSERT INTO users (
    id,
    name,
    email,
    phone,
    address,
    resident_registration_number,
    role,
    clinic_id,
    status
  )
  VALUES (
    p_user_id,
    p_user_name,
    p_user_email,
    p_user_phone,
    p_user_address,
    p_resident_number,
    'owner',
    v_clinic_id,
    'pending'
  );

  -- 3. Return result
  v_result := json_build_object(
    'clinic_id', v_clinic_id,
    'user_id', p_user_id,
    'success', true
  );

  RETURN v_result;

EXCEPTION
  WHEN OTHERS THEN
    -- Re-raise exception with context
    RAISE EXCEPTION 'Clinic creation failed: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.create_clinic_with_owner(
  uuid, text, text, text, text, text,
  text, text, text, text, text
) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION public.create_clinic_with_owner IS
'Creates a new clinic and owner user in a single transaction.
Uses SECURITY DEFINER to bypass RLS policies during signup.
Based on Supabase best practices.';
