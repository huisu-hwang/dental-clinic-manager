-- 브랜드 텍스트 카드 테두리 두께 사용자 조정 지원
-- 2026-05-07

ALTER TABLE clinic_brand_assets
  ADD COLUMN IF NOT EXISTS title_border_width INTEGER NOT NULL DEFAULT 16;

ALTER TABLE clinic_brand_assets
  ADD CONSTRAINT clinic_brand_assets_title_border_width_range
  CHECK (title_border_width BETWEEN 0 AND 60);
