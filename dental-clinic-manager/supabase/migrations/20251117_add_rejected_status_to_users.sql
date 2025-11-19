-- Add 'rejected' status to users table
-- Update CHECK constraint to include rejected status

-- 1. Drop existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

-- 2. Add new constraint with 'rejected' status
ALTER TABLE users
ADD CONSTRAINT users_status_check
CHECK (status IN ('pending', 'active', 'suspended', 'rejected'));

-- 3. Add comment for documentation
COMMENT ON COLUMN users.status IS
'User status: pending=승인대기, active=활성, suspended=정지, rejected=거절됨';
