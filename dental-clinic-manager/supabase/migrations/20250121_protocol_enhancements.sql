-- ========================================
-- Protocol Enhancement Migration
-- ========================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========================================
-- 1. Protocol Steps Table
-- ========================================
CREATE TABLE IF NOT EXISTS protocol_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  version_id UUID REFERENCES protocol_versions(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  reference_materials JSONB DEFAULT '[]'::jsonb,
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_protocol_steps_protocol_id ON protocol_steps(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_steps_version_id ON protocol_steps(version_id);
CREATE INDEX IF NOT EXISTS idx_protocol_steps_order ON protocol_steps(protocol_id, step_order);

-- ========================================
-- 2. Protocol Media Table
-- ========================================
CREATE TABLE IF NOT EXISTS protocol_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  step_id UUID REFERENCES protocol_steps(id) ON DELETE CASCADE,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('image', 'video', 'document', 'link')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_protocol_media_protocol_id ON protocol_media(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_media_step_id ON protocol_media(step_id);

-- ========================================
-- 3. Tag Suggestions Table
-- ========================================
CREATE TABLE IF NOT EXISTS tag_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  tag_name VARCHAR(50) NOT NULL,
  category_id UUID REFERENCES protocol_categories(id) ON DELETE SET NULL,
  usage_count INTEGER DEFAULT 1,
  last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(clinic_id, tag_name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tag_suggestions_clinic_id ON tag_suggestions(clinic_id);
CREATE INDEX IF NOT EXISTS idx_tag_suggestions_usage ON tag_suggestions(clinic_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_tag_suggestions_category ON tag_suggestions(category_id);

-- ========================================
-- 4. Protocol Templates Table
-- ========================================
CREATE TABLE IF NOT EXISTS protocol_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category_id UUID REFERENCES protocol_categories(id) ON DELETE SET NULL,
  template_content JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_steps JSONB DEFAULT '[]'::jsonb,
  is_public BOOLEAN DEFAULT false,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_protocol_templates_clinic_id ON protocol_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_protocol_templates_public ON protocol_templates(is_public) WHERE is_public = true;

-- ========================================
-- 5. Row Level Security (RLS) Policies
-- ========================================

-- Enable RLS on all new tables
ALTER TABLE protocol_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_templates ENABLE ROW LEVEL SECURITY;

-- Protocol Steps Policies
CREATE POLICY "Users can view protocol steps from their clinic"
  ON protocol_steps FOR SELECT
  TO authenticated
  USING (
    protocol_id IN (
      SELECT id FROM protocols
      WHERE clinic_id = auth.jwt() ->> 'clinic_id'
    )
  );

CREATE POLICY "Users can manage protocol steps for their clinic"
  ON protocol_steps FOR ALL
  TO authenticated
  USING (
    protocol_id IN (
      SELECT id FROM protocols
      WHERE clinic_id = auth.jwt() ->> 'clinic_id'
    )
  );

-- Protocol Media Policies
CREATE POLICY "Users can view protocol media from their clinic"
  ON protocol_media FOR SELECT
  TO authenticated
  USING (
    protocol_id IN (
      SELECT id FROM protocols
      WHERE clinic_id = auth.jwt() ->> 'clinic_id'
    )
  );

CREATE POLICY "Users can manage protocol media for their clinic"
  ON protocol_media FOR ALL
  TO authenticated
  USING (
    protocol_id IN (
      SELECT id FROM protocols
      WHERE clinic_id = auth.jwt() ->> 'clinic_id'
    )
  );

-- Tag Suggestions Policies
CREATE POLICY "Users can view tag suggestions from their clinic"
  ON tag_suggestions FOR SELECT
  TO authenticated
  USING (clinic_id = auth.jwt() ->> 'clinic_id');

CREATE POLICY "Users can manage tag suggestions for their clinic"
  ON tag_suggestions FOR ALL
  TO authenticated
  USING (clinic_id = auth.jwt() ->> 'clinic_id');

-- Protocol Templates Policies
CREATE POLICY "Users can view templates from their clinic or public templates"
  ON protocol_templates FOR SELECT
  TO authenticated
  USING (
    clinic_id = auth.jwt() ->> 'clinic_id' OR
    is_public = true
  );

CREATE POLICY "Users can manage templates for their clinic"
  ON protocol_templates FOR ALL
  TO authenticated
  USING (clinic_id = auth.jwt() ->> 'clinic_id');

-- ========================================
-- 6. Helper Functions
-- ========================================

-- Function to increment tag usage count
CREATE OR REPLACE FUNCTION increment_tag_usage(
  p_clinic_id UUID,
  p_tags TEXT[]
)
RETURNS VOID AS $$
BEGIN
  UPDATE tag_suggestions
  SET
    usage_count = usage_count + 1,
    last_used = NOW()
  WHERE
    clinic_id = p_clinic_id AND
    tag_name = ANY(p_tags);
END;
$$ LANGUAGE plpgsql;

-- Function to get recommended tags
CREATE OR REPLACE FUNCTION get_recommended_tags(
  p_clinic_id UUID,
  p_category_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  tag_name VARCHAR(50),
  usage_count INTEGER,
  source VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.tag_name,
    ts.usage_count,
    CASE
      WHEN ts.category_id = p_category_id THEN 'category'::VARCHAR(20)
      ELSE 'frequent'::VARCHAR(20)
    END as source
  FROM tag_suggestions ts
  WHERE ts.clinic_id = p_clinic_id
    AND (p_category_id IS NULL OR ts.category_id = p_category_id)
  ORDER BY
    CASE WHEN ts.category_id = p_category_id THEN 0 ELSE 1 END,
    ts.usage_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- 7. Update Triggers
-- ========================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to tables with updated_at column
CREATE TRIGGER update_protocol_steps_updated_at
  BEFORE UPDATE ON protocol_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_protocol_templates_updated_at
  BEFORE UPDATE ON protocol_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 8. Sample Data for Testing (Optional)
-- ========================================
-- Uncomment below to insert sample medical tag suggestions

/*
INSERT INTO tag_suggestions (clinic_id, tag_name, usage_count)
SELECT
  c.id,
  tag_name,
  FLOOR(RANDOM() * 20 + 1)::INTEGER
FROM clinics c
CROSS JOIN (
  VALUES
    ('임플란트'),
    ('신경치료'),
    ('크라운'),
    ('발치'),
    ('스케일링'),
    ('교정'),
    ('미백'),
    ('충치'),
    ('잇몸치료'),
    ('보철')
) AS tags(tag_name)
ON CONFLICT (clinic_id, tag_name) DO NOTHING;
*/

-- ========================================
-- Migration Complete
-- ========================================