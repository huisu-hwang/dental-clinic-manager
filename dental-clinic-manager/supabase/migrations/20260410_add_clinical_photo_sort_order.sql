-- clinical_photos 테이블에 sort_order 컬럼 추가 (카테고리 내 시간순 정렬용)
ALTER TABLE clinical_photos ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- 정렬용 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_clinical_photos_order
  ON clinical_photos(item_id, photo_type, sort_order);

COMMENT ON TABLE clinical_photos IS '임상글 사진 (술전/술중/술후)';
