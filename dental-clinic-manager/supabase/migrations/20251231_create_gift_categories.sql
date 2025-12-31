-- 선물 카테고리 테이블 생성
-- 선물의 특성/용도를 분류하기 위한 카테고리 관리

-- gift_categories 테이블 생성
CREATE TABLE IF NOT EXISTS gift_categories (
    id SERIAL PRIMARY KEY,
    clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#3b82f6',
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 같은 병원 내에서 카테고리 이름 중복 방지
    UNIQUE(clinic_id, name)
);

-- gift_inventory 테이블에 category_id 컬럼 추가
ALTER TABLE gift_inventory
ADD COLUMN IF NOT EXISTS category_id INT REFERENCES gift_categories(id) ON DELETE SET NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_gift_categories_clinic_id ON gift_categories(clinic_id);
CREATE INDEX IF NOT EXISTS idx_gift_inventory_category_id ON gift_inventory(category_id);

-- RLS 활성화
ALTER TABLE gift_categories ENABLE ROW LEVEL SECURITY;

-- RLS 정책 생성
CREATE POLICY "Users can view their clinic gift categories"
    ON gift_categories FOR SELECT
    USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can insert gift categories for their clinic"
    ON gift_categories FOR INSERT
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can update their clinic gift categories"
    ON gift_categories FOR UPDATE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their clinic gift categories"
    ON gift_categories FOR DELETE
    USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        )
    );

-- 기본 카테고리 삽입을 위한 함수 생성
-- 새로운 병원이 생성될 때 기본 카테고리를 자동으로 추가하는 트리거 함수
CREATE OR REPLACE FUNCTION create_default_gift_categories()
RETURNS TRIGGER AS $$
BEGIN
    -- 기본 선물 카테고리 3개 삽입
    INSERT INTO gift_categories (clinic_id, name, description, color, display_order)
    VALUES
        (NEW.id, '신환 환영 선물', '처음 방문한 신규 환자에게 제공하는 환영 선물', '#22c55e', 1),
        (NEW.id, '구환 치료 완료 선물', '치료가 완료된 기존 환자에게 제공하는 감사 선물', '#3b82f6', 2),
        (NEW.id, '임플란트 환자 선물', '임플란트 시술 환자에게 제공하는 특별 선물', '#a855f7', 3)
    ON CONFLICT (clinic_id, name) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 새 병원 생성 시 기본 카테고리 생성 트리거
DROP TRIGGER IF EXISTS trigger_create_default_gift_categories ON clinics;
CREATE TRIGGER trigger_create_default_gift_categories
    AFTER INSERT ON clinics
    FOR EACH ROW
    EXECUTE FUNCTION create_default_gift_categories();

-- 기존 병원에 대해 기본 카테고리 추가 (이미 카테고리가 없는 경우에만)
INSERT INTO gift_categories (clinic_id, name, description, color, display_order)
SELECT
    c.id,
    category.name,
    category.description,
    category.color,
    category.display_order
FROM clinics c
CROSS JOIN (
    VALUES
        ('신환 환영 선물', '처음 방문한 신규 환자에게 제공하는 환영 선물', '#22c55e', 1),
        ('구환 치료 완료 선물', '치료가 완료된 기존 환자에게 제공하는 감사 선물', '#3b82f6', 2),
        ('임플란트 환자 선물', '임플란트 시술 환자에게 제공하는 특별 선물', '#a855f7', 3)
) AS category(name, description, color, display_order)
WHERE NOT EXISTS (
    SELECT 1 FROM gift_categories gc
    WHERE gc.clinic_id = c.id
)
ON CONFLICT (clinic_id, name) DO NOTHING;
