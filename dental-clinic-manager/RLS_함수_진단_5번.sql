-- ============================================
-- RLS 함수 진단 - 5번 쿼리만 분리
-- ============================================
-- RLS 정책이 통과해야 하는 조건 테스트

SELECT
  cb.id,
  cb.clinic_id as branch_clinic_id,
  public.get_user_clinic_id() as user_clinic_id,
  cb.clinic_id = public.get_user_clinic_id() as should_match,
  cb.branch_name as name,
  cb.is_active,
  'RLS condition test' as description
FROM public.clinic_branches cb;
