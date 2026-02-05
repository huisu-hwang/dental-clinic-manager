-- ========================================
-- Add change_type column to protocol_versions table
-- ========================================
-- This migration adds the change_type column which tracks whether
-- a version change is 'major' or 'minor'.

-- 1. Add change_type column to protocol_versions
ALTER TABLE protocol_versions
ADD COLUMN IF NOT EXISTS change_type VARCHAR(20) DEFAULT 'minor';

-- 2. Add comment for documentation
COMMENT ON COLUMN protocol_versions.change_type IS 'Type of version change: major or minor';

-- ========================================
-- Migration Complete
-- ========================================
