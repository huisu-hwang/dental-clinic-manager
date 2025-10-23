-- ========================================
-- Protocol Tables Creation
-- ========================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. Protocol Categories Table
-- ========================================
CREATE TABLE IF NOT EXISTS protocol_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  color VARCHAR(20) DEFAULT '#3B82F6',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(clinic_id, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_protocol_categories_clinic_id ON protocol_categories(clinic_id);
CREATE INDEX IF NOT EXISTS idx_protocol_categories_display_order ON protocol_categories(clinic_id, display_order);

-- ========================================
-- 2. Protocols Table
-- ========================================
CREATE TABLE IF NOT EXISTS protocols (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  category_id UUID REFERENCES protocol_categories(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  current_version_id UUID,
  tags TEXT[] DEFAULT '{}',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_protocols_clinic_id ON protocols(clinic_id);
CREATE INDEX IF NOT EXISTS idx_protocols_category_id ON protocols(category_id);
CREATE INDEX IF NOT EXISTS idx_protocols_status ON protocols(status);
CREATE INDEX IF NOT EXISTS idx_protocols_created_by ON protocols(created_by);
CREATE INDEX IF NOT EXISTS idx_protocols_deleted_at ON protocols(deleted_at) WHERE deleted_at IS NULL;

-- ========================================
-- 3. Protocol Versions Table
-- ========================================
CREATE TABLE IF NOT EXISTS protocol_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol_id UUID NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
  version_number VARCHAR(20) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  change_summary TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(protocol_id, version_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_protocol_versions_protocol_id ON protocol_versions(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_versions_version_number ON protocol_versions(protocol_id, version_number DESC);

-- Add foreign key constraint for current_version_id (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_protocols_current_version'
  ) THEN
    ALTER TABLE protocols
      ADD CONSTRAINT fk_protocols_current_version
      FOREIGN KEY (current_version_id)
      REFERENCES protocol_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ========================================
-- 4. Row Level Security (RLS) Policies
-- ========================================

-- Enable RLS
ALTER TABLE protocol_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_versions ENABLE ROW LEVEL SECURITY;

-- Protocol Categories Policies
DROP POLICY IF EXISTS "Users can view protocol categories from their clinic" ON protocol_categories;
CREATE POLICY "Users can view protocol categories from their clinic"
  ON protocol_categories FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert protocol categories for their clinic" ON protocol_categories;
CREATE POLICY "Users can insert protocol categories for their clinic"
  ON protocol_categories FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update protocol categories for their clinic" ON protocol_categories;
CREATE POLICY "Users can update protocol categories for their clinic"
  ON protocol_categories FOR UPDATE
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete protocol categories for their clinic" ON protocol_categories;
CREATE POLICY "Users can delete protocol categories for their clinic"
  ON protocol_categories FOR DELETE
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- Protocols Policies
DROP POLICY IF EXISTS "Users can view protocols from their clinic" ON protocols;
CREATE POLICY "Users can view protocols from their clinic"
  ON protocols FOR SELECT
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert protocols for their clinic" ON protocols;
CREATE POLICY "Users can insert protocols for their clinic"
  ON protocols FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update protocols for their clinic" ON protocols;
CREATE POLICY "Users can update protocols for their clinic"
  ON protocols FOR UPDATE
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete protocols for their clinic" ON protocols;
CREATE POLICY "Users can delete protocols for their clinic"
  ON protocols FOR DELETE
  TO authenticated
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- Protocol Versions Policies
DROP POLICY IF EXISTS "Users can view protocol versions from their clinic" ON protocol_versions;
CREATE POLICY "Users can view protocol versions from their clinic"
  ON protocol_versions FOR SELECT
  TO authenticated
  USING (
    protocol_id IN (
      SELECT id FROM protocols
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Users can insert protocol versions for their clinic" ON protocol_versions;
CREATE POLICY "Users can insert protocol versions for their clinic"
  ON protocol_versions FOR INSERT
  TO authenticated
  WITH CHECK (
    protocol_id IN (
      SELECT id FROM protocols
      WHERE clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- ========================================
-- 5. Update Triggers
-- ========================================

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS update_protocol_categories_updated_at ON protocol_categories;
CREATE TRIGGER update_protocol_categories_updated_at
  BEFORE UPDATE ON protocol_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_protocols_updated_at ON protocols;
CREATE TRIGGER update_protocols_updated_at
  BEFORE UPDATE ON protocols
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 6. Insert Default Categories for All Clinics
-- ========================================

-- Function to create default protocol categories for a clinic
CREATE OR REPLACE FUNCTION create_default_protocol_categories(p_clinic_id UUID)
RETURNS VOID AS $$
BEGIN
  -- Insert default categories if they don't exist
  INSERT INTO protocol_categories (clinic_id, name, description, color, display_order)
  VALUES
    (p_clinic_id, '임플란트', '임플란트 시술 관련 프로토콜', '#3B82F6', 1),
    (p_clinic_id, '보철', '보철 치료 관련 프로토콜', '#10B981', 2),
    (p_clinic_id, '치주', '치주 치료 관련 프로토콜', '#F59E0B', 3),
    (p_clinic_id, '보존', '보존 치료 관련 프로토콜', '#EF4444', 4),
    (p_clinic_id, '교정', '교정 치료 관련 프로토콜', '#8B5CF6', 5),
    (p_clinic_id, '구강외과', '구강외과 시술 관련 프로토콜', '#EC4899', 6),
    (p_clinic_id, '소아치과', '소아 치과 관련 프로토콜', '#06B6D4', 7),
    (p_clinic_id, '예방', '예방 치료 관련 프로토콜', '#F97316', 8)
  ON CONFLICT (clinic_id, name) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Create default categories for all existing clinics
DO $$
DECLARE
  clinic_record RECORD;
BEGIN
  FOR clinic_record IN SELECT id FROM clinics LOOP
    PERFORM create_default_protocol_categories(clinic_record.id);
  END LOOP;
END $$;

-- Trigger to automatically create default categories for new clinics
CREATE OR REPLACE FUNCTION trigger_create_default_protocol_categories()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM create_default_protocol_categories(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_default_categories_on_clinic_creation ON clinics;
CREATE TRIGGER create_default_categories_on_clinic_creation
  AFTER INSERT ON clinics
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_default_protocol_categories();

-- ========================================
-- Migration Complete
-- ========================================
