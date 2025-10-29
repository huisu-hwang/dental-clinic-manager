-- Fix profile update function - make audit_logs optional and add address/ssn fields
-- This fixes the "saving..." freeze issue

-- Drop the old function
DROP FUNCTION IF EXISTS update_own_profile(UUID, TEXT, TEXT);

-- Create updated function with more fields and optional audit logging
CREATE OR REPLACE FUNCTION update_own_profile(
  p_user_id UUID,
  p_name TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_ssn TEXT DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  email TEXT,
  name TEXT,
  phone TEXT,
  address TEXT,
  ssn TEXT,
  role TEXT,
  clinic_id UUID,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_authenticated_user_id UUID;
  v_updated_record RECORD;
BEGIN
  -- Get the authenticated user ID
  v_authenticated_user_id := auth.uid();

  -- Security check: User can only update their own profile
  IF v_authenticated_user_id IS NOT NULL AND v_authenticated_user_id != p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: You can only update your own profile';
  END IF;

  -- If auth.uid() is null (legacy users), verify the user exists and is active
  IF v_authenticated_user_id IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM users
      WHERE id = p_user_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'User not found or inactive';
    END IF;
  END IF;

  -- Perform the update
  UPDATE users
  SET
    name = COALESCE(p_name, users.name),
    phone = COALESCE(p_phone, users.phone),
    address = COALESCE(p_address, users.address),
    ssn = COALESCE(p_ssn, users.ssn),
    updated_at = NOW()
  WHERE users.id = p_user_id
  RETURNING * INTO v_updated_record;

  -- Return the updated record
  RETURN QUERY
  SELECT
    v_updated_record.id,
    v_updated_record.email,
    v_updated_record.name,
    v_updated_record.phone,
    v_updated_record.address,
    v_updated_record.ssn,
    v_updated_record.role,
    v_updated_record.clinic_id,
    v_updated_record.status,
    v_updated_record.created_at,
    v_updated_record.updated_at;

  -- Try to log the update (optional - won't fail if audit_logs doesn't exist)
  BEGIN
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at)
    VALUES (
      p_user_id,
      'UPDATE_PROFILE',
      'users',
      p_user_id,
      jsonb_build_object(
        'name', p_name,
        'phone', p_phone,
        'address', p_address,
        'ssn_updated', CASE WHEN p_ssn IS NOT NULL THEN true ELSE false END
      ),
      NOW()
    );
  EXCEPTION
    WHEN OTHERS THEN
      -- Ignore audit log errors - they shouldn't block profile updates
      RAISE NOTICE 'Audit log failed but profile update succeeded: %', SQLERRM;
  END;

END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_own_profile TO authenticated;
GRANT EXECUTE ON FUNCTION update_own_profile TO anon;

-- Add address and ssn columns to users table if they don't exist
DO $$
BEGIN
  -- Add address column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'address'
  ) THEN
    ALTER TABLE users ADD COLUMN address TEXT;
  END IF;

  -- Add ssn column (encrypted storage recommended in production)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'ssn'
  ) THEN
    ALTER TABLE users ADD COLUMN ssn TEXT;
  END IF;
END $$;

COMMENT ON FUNCTION update_own_profile IS
'Secure profile update function with optional audit logging. Includes address and SSN fields.';
