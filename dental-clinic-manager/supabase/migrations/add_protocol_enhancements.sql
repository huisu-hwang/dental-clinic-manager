-- ========================================
-- 진료 프로토콜 고도화를 위한 스키마 업데이트
-- ========================================

-- 1. protocols 테이블에서 불필요한 컬럼 제거 (이미 존재하지 않을 수 있음)
-- ALTER TABLE protocols DROP COLUMN IF EXISTS estimated_time;
-- ALTER TABLE protocols DROP COLUMN IF EXISTS difficulty_level;

-- 2. 프로토콜 단계 테이블 생성
CREATE TABLE IF NOT EXISTS protocol_steps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL, -- Tiptap 리치 콘텐츠 (이미지 포함)
  reference_materials JSONB DEFAULT '[]'::jsonb,
  is_optional BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_step_order UNIQUE(protocol_id, step_order)
);

-- 3. 미디어 파일 관리 테이블
CREATE TABLE IF NOT EXISTS protocol_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  protocol_id UUID REFERENCES protocols(id) ON DELETE CASCADE,
  step_id UUID REFERENCES protocol_steps(id) ON DELETE CASCADE,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('image', 'video', 'document', 'link')),
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100),
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 태그 추천용 통계 테이블
CREATE TABLE IF NOT EXISTS tag_suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL,
  tag_name TEXT NOT NULL,
  category_id UUID REFERENCES protocol_categories(id) ON DELETE SET NULL,
  usage_count INTEGER DEFAULT 1,
  last_used TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(clinic_id, tag_name)
);

-- 5. 프로토콜 템플릿 테이블
CREATE TABLE IF NOT EXISTS protocol_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,
  is_shared BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_protocol_steps_order ON protocol_steps(protocol_id, step_order);
CREATE INDEX IF NOT EXISTS idx_tag_suggestions_clinic ON tag_suggestions(clinic_id, usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_protocol_media_protocol ON protocol_media(protocol_id);
CREATE INDEX IF NOT EXISTS idx_protocol_templates_clinic ON protocol_templates(clinic_id);

-- 7. Row Level Security (RLS) 정책
ALTER TABLE protocol_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE protocol_templates ENABLE ROW LEVEL SECURITY;

-- protocol_steps RLS 정책
CREATE POLICY "Users can view protocol steps from their clinic" ON protocol_steps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM protocols p
      WHERE p.id = protocol_steps.protocol_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can insert protocol steps for their clinic" ON protocol_steps
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM protocols p
      WHERE p.id = protocol_steps.protocol_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can update protocol steps for their clinic" ON protocol_steps
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM protocols p
      WHERE p.id = protocol_steps.protocol_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can delete protocol steps for their clinic" ON protocol_steps
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM protocols p
      WHERE p.id = protocol_steps.protocol_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- protocol_media RLS 정책
CREATE POLICY "Users can view protocol media from their clinic" ON protocol_media
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM protocols p
      WHERE p.id = protocol_media.protocol_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "Users can manage protocol media for their clinic" ON protocol_media
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM protocols p
      WHERE p.id = protocol_media.protocol_id
      AND p.clinic_id IN (
        SELECT clinic_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- tag_suggestions RLS 정책
CREATE POLICY "Users can view tag suggestions from their clinic" ON tag_suggestions
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tag suggestions for their clinic" ON tag_suggestions
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- protocol_templates RLS 정책
CREATE POLICY "Users can view templates from their clinic or shared" ON protocol_templates
  FOR SELECT USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    ) OR is_shared = true
  );

CREATE POLICY "Users can manage templates for their clinic" ON protocol_templates
  FOR ALL USING (
    clinic_id IN (
      SELECT clinic_id FROM users WHERE id = auth.uid()
    )
  );

-- 8. 함수: 단계 순서 자동 조정
CREATE OR REPLACE FUNCTION reorder_protocol_steps(
  p_protocol_id UUID,
  p_step_id UUID,
  p_new_order INTEGER
) RETURNS VOID AS $$
DECLARE
  v_old_order INTEGER;
BEGIN
  -- 현재 순서 가져오기
  SELECT step_order INTO v_old_order
  FROM protocol_steps
  WHERE id = p_step_id AND protocol_id = p_protocol_id;

  -- 순서 조정
  IF v_old_order < p_new_order THEN
    -- 아래로 이동
    UPDATE protocol_steps
    SET step_order = step_order - 1
    WHERE protocol_id = p_protocol_id
      AND step_order > v_old_order
      AND step_order <= p_new_order;
  ELSIF v_old_order > p_new_order THEN
    -- 위로 이동
    UPDATE protocol_steps
    SET step_order = step_order + 1
    WHERE protocol_id = p_protocol_id
      AND step_order >= p_new_order
      AND step_order < v_old_order;
  END IF;

  -- 대상 단계 순서 업데이트
  UPDATE protocol_steps
  SET step_order = p_new_order, updated_at = NOW()
  WHERE id = p_step_id;
END;
$$ LANGUAGE plpgsql;

-- 9. 함수: 태그 사용 통계 업데이트
CREATE OR REPLACE FUNCTION update_tag_statistics(
  p_clinic_id UUID,
  p_tags TEXT[],
  p_category_id UUID DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
  INSERT INTO tag_suggestions (clinic_id, tag_name, category_id, usage_count, last_used)
  SELECT
    p_clinic_id,
    unnest(p_tags),
    p_category_id,
    1,
    NOW()
  ON CONFLICT (clinic_id, tag_name)
  DO UPDATE SET
    usage_count = tag_suggestions.usage_count + 1,
    last_used = NOW(),
    category_id = COALESCE(p_category_id, tag_suggestions.category_id);
END;
$$ LANGUAGE plpgsql;

-- 10. 트리거: protocol_steps 업데이트 시간 자동 갱신
CREATE OR REPLACE FUNCTION update_protocol_steps_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_protocol_steps_updated_at
  BEFORE UPDATE ON protocol_steps
  FOR EACH ROW
  EXECUTE FUNCTION update_protocol_steps_timestamp();

-- 11. 트리거: protocol_templates 업데이트 시간 자동 갱신
CREATE OR REPLACE FUNCTION update_protocol_templates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_protocol_templates_updated_at
  BEFORE UPDATE ON protocol_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_protocol_templates_timestamp();

-- 12. Storage 버킷 생성 (이미 존재하지 않을 경우)
-- 참고: 이 부분은 Supabase 대시보드에서 직접 생성해야 할 수 있습니다.
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('protocol-media', 'protocol-media', true)
-- ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE protocol_steps IS '프로토콜의 단계별 내용을 저장하는 테이블';
COMMENT ON TABLE protocol_media IS '프로토콜에 첨부된 미디어 파일 정보를 관리하는 테이블';
COMMENT ON TABLE tag_suggestions IS '태그 사용 통계 및 추천을 위한 테이블';
COMMENT ON TABLE protocol_templates IS '프로토콜 템플릿을 저장하는 테이블';