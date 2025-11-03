-- ========================================
-- Add version_id to protocol_steps table
-- ========================================
-- This migration adds version_id column to protocol_steps to link steps
-- to specific protocol versions instead of just the protocol itself.

-- 1. Add version_id column
ALTER TABLE protocol_steps
ADD COLUMN IF NOT EXISTS version_id UUID REFERENCES protocol_versions(id) ON DELETE CASCADE;

-- 2. Create index for performance
CREATE INDEX IF NOT EXISTS idx_protocol_steps_version_id ON protocol_steps(version_id);

-- 3. Update RLS policies to include version_id checks
-- Drop existing policies
DROP POLICY IF EXISTS "Users can view protocol steps from their clinic" ON protocol_steps;
DROP POLICY IF EXISTS "Users can insert protocol steps for their clinic" ON protocol_steps;
DROP POLICY IF EXISTS "Users can update protocol steps for their clinic" ON protocol_steps;
DROP POLICY IF EXISTS "Users can delete protocol steps for their clinic" ON protocol_steps;

-- Recreate policies with version_id support
CREATE POLICY "Users can view protocol steps from their clinic" ON protocol_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert protocol steps for their clinic" ON protocol_steps
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update protocol steps for their clinic" ON protocol_steps
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete protocol steps for their clinic" ON protocol_steps
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM protocol_versions pv
      JOIN protocols p ON p.id = pv.protocol_id
      WHERE pv.id = protocol_steps.version_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- 4. Add comment
COMMENT ON COLUMN protocol_steps.version_id IS 'Links the step to a specific protocol version';

-- ========================================
-- Migration Complete
-- ========================================
