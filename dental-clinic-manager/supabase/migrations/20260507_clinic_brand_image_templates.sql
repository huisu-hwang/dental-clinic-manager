-- 클리닉 브랜드 이미지 템플릿 시스템
-- 2026-05-07

-- 1. 자산 테이블 (1:1 with clinics)
CREATE TABLE clinic_brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL UNIQUE REFERENCES clinics(id) ON DELETE CASCADE,
  name_ko TEXT,
  name_en TEXT,
  logo_url TEXT,
  primary_color TEXT NOT NULL DEFAULT '#1B5E20',
  secondary_color TEXT NOT NULL DEFAULT '#FFC107',
  slogan TEXT,
  medical_law_preset TEXT NOT NULL DEFAULT 'yellow_black',
  medical_law_top_text TEXT NOT NULL DEFAULT '본 포스팅은 의료법 제56조 및 동법 시행령을 준수하여 {clinic_name}에서 정보제공을 위해 직접 작성하였습니다.',
  medical_law_bottom_text TEXT NOT NULL DEFAULT '모든 시술 및 수술은 부작용이 발생할 수 있으니 의료진과 충분한 상담 후 치료받으시기 바랍니다.',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinic_brand_assets_clinic_id ON clinic_brand_assets(clinic_id);

-- 2. 사진 풀
CREATE TABLE clinic_brand_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_clinic_brand_photos_clinic_id ON clinic_brand_photos(clinic_id);

-- 3. 합성 결과 캐시
CREATE TABLE clinic_brand_image_renders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  image_type TEXT NOT NULL CHECK (image_type IN ('medical_law', 'title', 'photo')),
  cache_key TEXT NOT NULL,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uq_clinic_brand_image_renders_key
  ON clinic_brand_image_renders(clinic_id, image_type, cache_key);

-- 4. updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at_clinic_brand_assets()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_clinic_brand_assets_updated_at
  BEFORE UPDATE ON clinic_brand_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_clinic_brand_assets();

-- 5. RLS
ALTER TABLE clinic_brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_brand_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_brand_image_renders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "brand_assets_select" ON clinic_brand_assets
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_assets_modify" ON clinic_brand_assets
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_photos_select" ON clinic_brand_photos
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_photos_modify" ON clinic_brand_photos
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "brand_renders_select" ON clinic_brand_image_renders
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- INSERT는 service_role(서버 API)만

-- 6. Storage 버킷
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing-brand', 'marketing-brand', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "brand_storage_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'marketing-brand');

CREATE POLICY "brand_storage_write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'marketing-brand'
    AND (storage.foldername(name))[1] = 'clinics'
  );

CREATE POLICY "brand_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'marketing-brand'
    AND (storage.foldername(name))[1] = 'clinics'
  );
