-- 클리닉 브랜드 이미지 세트 (반복 사용 가능한 끝맺음 이미지 묶음)
-- 2026-05-18
--
-- 목적: 직원 사진/대표 진료/위치/진료시간 등 글 마지막에 반복 첨가할 수 있는 카드 묶음을 미리 등록.
-- LRU 순환으로 같은 카드가 짧은 기간 반복되지 않도록 하고, sharp 동적 변형으로 매 발행마다
-- 미세하게 다른 이미지를 생성 → 네이버 유사이미지 판독 회피 + 보존된 originals 캐싱.

-- 1. 세트 (클리닉당 N개)
CREATE TABLE IF NOT EXISTS clinic_brand_image_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                              -- 예: "병원 소개", "진료시간", "오시는 길"
  description TEXT,                                -- 관리자 메모 (글 작성자에게는 미노출)
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_brand_image_sets_clinic_id
  ON clinic_brand_image_sets(clinic_id);

-- 2. 카드 (세트당 N장)
CREATE TABLE IF NOT EXISTS clinic_brand_image_set_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id UUID NOT NULL REFERENCES clinic_brand_image_sets(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,                          -- 원본 (Storage public URL)
  title_copy TEXT,                                  -- 텍스트 오버레이 상단 (예: "진료시간 안내")
  subtitle_copy TEXT,                               -- 텍스트 오버레이 하단 (예: "평일 10:00~19:00")
  sort_order INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,                         -- LRU 순환용 (NULL = 한 번도 안 씀)
  use_count INTEGER NOT NULL DEFAULT 0,             -- 통계용
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinic_brand_image_set_cards_set_id
  ON clinic_brand_image_set_cards(set_id);
CREATE INDEX IF NOT EXISTS idx_clinic_brand_image_set_cards_clinic_id
  ON clinic_brand_image_set_cards(clinic_id);
CREATE INDEX IF NOT EXISTS idx_clinic_brand_image_set_cards_lru
  ON clinic_brand_image_set_cards(set_id, last_used_at NULLS FIRST, sort_order);

-- 3. updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at_brand_image_sets()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clinic_brand_image_sets_updated_at ON clinic_brand_image_sets;
CREATE TRIGGER trg_clinic_brand_image_sets_updated_at
  BEFORE UPDATE ON clinic_brand_image_sets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_brand_image_sets();

DROP TRIGGER IF EXISTS trg_clinic_brand_image_set_cards_updated_at ON clinic_brand_image_set_cards;
CREATE TRIGGER trg_clinic_brand_image_set_cards_updated_at
  BEFORE UPDATE ON clinic_brand_image_set_cards
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_brand_image_sets();

-- 4. RLS
ALTER TABLE clinic_brand_image_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_brand_image_set_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brand_image_sets_select" ON clinic_brand_image_sets;
CREATE POLICY "brand_image_sets_select" ON clinic_brand_image_sets
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "brand_image_sets_modify" ON clinic_brand_image_sets;
CREATE POLICY "brand_image_sets_modify" ON clinic_brand_image_sets
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "brand_image_set_cards_select" ON clinic_brand_image_set_cards;
CREATE POLICY "brand_image_set_cards_select" ON clinic_brand_image_set_cards
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "brand_image_set_cards_modify" ON clinic_brand_image_set_cards;
CREATE POLICY "brand_image_set_cards_modify" ON clinic_brand_image_set_cards
  FOR ALL USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 5. LRU pick + 사용 마킹을 한 번에 수행하는 함수 (race 안전)
-- 가장 오래 안 쓴 카드(=last_used_at 가장 오래 전 또는 NULL) 를 pick 하고 last_used_at/use_count 갱신.
CREATE OR REPLACE FUNCTION pick_brand_image_set_card_lru(p_set_id UUID)
RETURNS TABLE (
  id UUID,
  set_id UUID,
  clinic_id UUID,
  image_url TEXT,
  title_copy TEXT,
  subtitle_copy TEXT,
  sort_order INTEGER,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_card_id UUID;
BEGIN
  SELECT c.id INTO v_card_id
  FROM clinic_brand_image_set_cards c
  WHERE c.set_id = p_set_id
  ORDER BY c.last_used_at ASC NULLS FIRST, c.sort_order ASC, c.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_card_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE clinic_brand_image_set_cards c
  SET last_used_at = NOW(),
      use_count = c.use_count + 1
  WHERE c.id = v_card_id;

  RETURN QUERY
  SELECT c.id, c.set_id, c.clinic_id, c.image_url, c.title_copy, c.subtitle_copy,
         c.sort_order, c.last_used_at, c.use_count
  FROM clinic_brand_image_set_cards c
  WHERE c.id = v_card_id;
END;
$$;
