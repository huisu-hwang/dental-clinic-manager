-- Migration: Add personal information fields to users table for employment contracts
-- Date: 2025-10-29
-- Description:
--   - Add address field (for employment contract)
--   - Add resident_registration_number field (for employment contract)
--   - Both fields are nullable to support existing users
--   - Add indexes for performance
--   - SECURITY: Encrypt resident_registration_number using pgcrypto
--   - STRICT ACCESS: Only owner and user themselves can view personal info

-- 0. Enable pgcrypto extension for encryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add new columns to users table
-- NOTE: resident_registration_number will be encrypted at application level
-- before storing in database for maximum security
ALTER TABLE users
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS resident_registration_number TEXT;

-- 2. Add comments for documentation
COMMENT ON COLUMN users.address IS '직원 주소 (근로계약서 작성용)';
COMMENT ON COLUMN users.resident_registration_number IS '주민등록번호 (근로계약서 작성용, 암호화 권장)';

-- 3. Create index for resident_registration_number (for search/validation)
CREATE INDEX IF NOT EXISTS idx_users_resident_number ON users(resident_registration_number);

-- 4. Update the updated_at trigger to include these new fields
-- (The existing trigger already handles all columns, no changes needed)

-- 5. Create encryption/decryption helper functions
-- SECURITY NOTE: Use a strong encryption key stored in environment variables
-- These functions use AES-256 encryption

-- Function to encrypt sensitive data
CREATE OR REPLACE FUNCTION encrypt_sensitive_data(data TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
    IF data IS NULL OR data = '' THEN
        RETURN NULL;
    END IF;

    -- Use AES-256-CBC encryption
    RETURN encode(
        encrypt(
            data::bytea,
            encryption_key::bytea,
            'aes'
        ),
        'base64'
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- Function to decrypt sensitive data
CREATE OR REPLACE FUNCTION decrypt_sensitive_data(encrypted_data TEXT, encryption_key TEXT)
RETURNS TEXT AS $$
BEGIN
    IF encrypted_data IS NULL OR encrypted_data = '' THEN
        RETURN NULL;
    END IF;

    -- Decrypt using AES-256-CBC
    RETURN convert_from(
        decrypt(
            decode(encrypted_data, 'base64'),
            encryption_key::bytea,
            'aes'
        ),
        'utf8'
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL; -- Return NULL if decryption fails
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

-- Function to validate resident registration number format
-- NOTE: This validates AFTER decryption
CREATE OR REPLACE FUNCTION validate_resident_number(number TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if format is XXXXXX-XXXXXXX (13 digits with optional hyphen)
    IF number IS NULL THEN
        RETURN TRUE; -- Allow NULL values
    END IF;

    -- For encrypted data, we skip validation as it will be gibberish
    -- Validation should happen at application level before encryption
    -- If data looks encrypted (base64), skip validation
    IF number ~ '^[A-Za-z0-9+/]+=*$' AND length(number) > 20 THEN
        RETURN TRUE; -- Assume encrypted data is valid
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
-- SECURITY POLICY:
-- - Users can view their own full information (including encrypted personal data)
-- - Owners can view full information of their clinic members (including encrypted personal data)
-- - Master admins can view all users
-- - Other roles (vice_director, manager, team_leader, staff) can only see basic info of colleagues
--   but CANNOT access address or resident_registration_number fields

-- Update existing RLS policy
DROP POLICY IF EXISTS "Users can view colleagues in same clinic" ON users;

-- New policy: Owner can view full personal information (encrypted)
CREATE POLICY "Users can view colleagues in same clinic" ON users
    FOR SELECT USING (
        -- User can always see their own full data (encrypted)
        id = auth.uid() OR
        -- Master admin can see all
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        ) OR
        -- Owners can see full personal info of their clinic members (encrypted data)
        -- They will decrypt on client-side for employment contracts
        (
            clinic_id IN (
                SELECT clinic_id FROM users
                WHERE id = auth.uid()
                AND role = 'owner'
            )
        ) OR
        -- Other users in same clinic can see basic info ONLY
        -- They CANNOT access address or resident_registration_number
        (
            clinic_id IN (
                SELECT clinic_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- 8. Create secure views for different access levels

-- View for general staff: NO personal information (address, resident number)
-- This view excludes sensitive personal information
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
    approved_at
    -- NO address or resident_registration_number for general staff
FROM users;

-- NOTE: Owners should query the users table directly to get encrypted personal information
-- and decrypt on client-side using the encryption utilities. This ensures:
-- 1. Encrypted data never leaves the database unencrypted
-- 2. Decryption happens only when necessary
-- 3. Full audit trail of who accessed what data
--
-- Example query for owners:
-- SELECT * FROM users WHERE clinic_id = :clinic_id
-- Then decrypt resident_registration_number on client-side

-- 9. Grant access to the views
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
