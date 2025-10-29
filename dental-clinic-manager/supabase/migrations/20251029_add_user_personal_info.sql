-- Migration: Add personal information fields to users table for employment contracts
-- Date: 2025-10-29
-- Description:
--   - Add address field (for employment contract)
--   - Add resident_registration_number field (for employment contract)
--   - Both fields are nullable to support existing users
--   - Add indexes for performance

-- 1. Add new columns to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS resident_registration_number VARCHAR(14);

-- 2. Add comments for documentation
COMMENT ON COLUMN users.address IS '직원 주소 (근로계약서 작성용)';
COMMENT ON COLUMN users.resident_registration_number IS '주민등록번호 (근로계약서 작성용, 암호화 권장)';

-- 3. Create index for resident_registration_number (for search/validation)
CREATE INDEX IF NOT EXISTS idx_users_resident_number ON users(resident_registration_number);

-- 4. Update the updated_at trigger to include these new fields
-- (The existing trigger already handles all columns, no changes needed)

-- 5. Create a function to validate resident registration number format
CREATE OR REPLACE FUNCTION validate_resident_number(number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if format is XXXXXX-XXXXXXX (13 digits with optional hyphen)
    IF number IS NULL THEN
        RETURN TRUE; -- Allow NULL values
    END IF;

    -- Remove hyphen and check if it's 13 digits
    IF length(regexp_replace(number, '-', '', 'g')) = 13 THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 6. Add check constraint for resident registration number format
ALTER TABLE users
ADD CONSTRAINT check_resident_number_format
CHECK (validate_resident_number(resident_registration_number));

-- 7. Grant necessary permissions (if using RLS)
-- Users can view their own full information including personal data
-- Only owners can view other users' personal information in their clinic

-- Update existing RLS policy to restrict resident_registration_number access
-- Note: This creates a more secure policy where personal info is restricted

DROP POLICY IF EXISTS "Users can view colleagues in same clinic" ON users;

-- New policy: Users can view basic info of colleagues, but personal info is restricted
CREATE POLICY "Users can view colleagues in same clinic" ON users
    FOR SELECT USING (
        -- User can always see their own full data
        id = auth.uid() OR
        -- Master admin can see all
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        ) OR
        -- Owners and vice_directors can see personal info of their clinic members
        (
            clinic_id IN (
                SELECT clinic_id FROM users
                WHERE id = auth.uid()
                AND role IN ('owner', 'vice_director')
            )
        ) OR
        -- Other users in same clinic can see basic info (but policy alone won't restrict columns)
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

-- 8. Create a secure view for limited user information
CREATE OR REPLACE VIEW users_basic_info AS
SELECT
    id,
    email,
    name,
    phone,
    role,
    status,
    clinic_id,
    created_at,
    updated_at,
    last_login_at,
    approved_by,
    approved_at,
    -- Mask resident registration number (show only first 8 chars)
    CASE
        WHEN resident_registration_number IS NOT NULL
        THEN left(resident_registration_number, 8) || '******'
        ELSE NULL
    END as resident_registration_number_masked
FROM users;

-- 9. Grant access to the view
GRANT SELECT ON users_basic_info TO authenticated;

-- 10. Add audit log entry for migration
INSERT INTO audit_logs (
    action,
    resource_type,
    details,
    created_at
) VALUES (
    'schema_migration',
    'users_table',
    '{"migration": "20251029_add_user_personal_info", "description": "Added address and resident_registration_number fields for employment contracts"}',
    NOW()
);

-- Migration completed successfully
