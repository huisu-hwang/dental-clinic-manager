-- ========================================
-- 모든 클리닉에 기본 프로토콜 카테고리 생성
-- ========================================

-- 모든 클리닉에 대해 기본 카테고리 생성
DO $$
DECLARE
  clinic_record RECORD;
BEGIN
  FOR clinic_record IN SELECT id FROM clinics LOOP
    -- create_default_protocol_categories 함수 호출
    PERFORM create_default_protocol_categories(clinic_record.id);
    RAISE NOTICE 'Created default categories for clinic: %', clinic_record.id;
  END LOOP;
END $$;

-- 생성된 카테고리 확인
SELECT
  c.name AS clinic_name,
  pc.name AS category_name,
  pc.display_order
FROM protocol_categories pc
JOIN clinics c ON c.id = pc.clinic_id
ORDER BY c.name, pc.display_order;
