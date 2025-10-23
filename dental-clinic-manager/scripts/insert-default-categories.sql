-- ========================================
-- 기본 프로토콜 카테고리 생성 SQL
-- Supabase SQL Editor에서 실행하세요
-- ========================================

-- 각 클리닉에 대해 기본 카테고리 생성
INSERT INTO protocol_categories (clinic_id, name, description, color, display_order)
SELECT
  c.id as clinic_id,
  cat.name,
  cat.description,
  cat.color,
  cat.display_order
FROM clinics c
CROSS JOIN (
  VALUES
    ('임플란트', '임플란트 시술 관련 프로토콜', '#3B82F6', 1),
    ('보철', '보철 치료 관련 프로토콜', '#10B981', 2),
    ('치주', '치주 치료 관련 프로토콜', '#F59E0B', 3),
    ('보존', '보존 치료 관련 프로토콜', '#EF4444', 4),
    ('교정', '교정 치료 관련 프로토콜', '#8B5CF6', 5),
    ('구강외과', '구강외과 시술 관련 프로토콜', '#EC4899', 6),
    ('소아치과', '소아 치과 관련 프로토콜', '#06B6D4', 7),
    ('예방', '예방 치료 관련 프로토콜', '#F97316', 8)
) AS cat(name, description, color, display_order)
ON CONFLICT (clinic_id, name) DO NOTHING;

-- 생성된 카테고리 확인
SELECT
  c.name as clinic_name,
  pc.name as category_name,
  pc.color,
  pc.display_order
FROM protocol_categories pc
JOIN clinics c ON c.id = pc.clinic_id
ORDER BY c.name, pc.display_order;
