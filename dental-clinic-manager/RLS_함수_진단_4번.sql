-- ============================================
-- RLS 함수 진단 - 4번 쿼리만 분리
-- ============================================
-- clinic_branches 테이블의 데이터 (RLS 통과 여부 확인)

SELECT
  cb.id,
  cb.clinic_id as branch_clinic_id,
  cb.branch_name as name,
  cb.is_active,
  public.get_user_clinic_id() as user_clinic_id,
  CASE
    WHEN cb.clinic_id = public.get_user_clinic_id() THEN 'MATCH - Should be visible'
    ELSE 'NO MATCH - Should be hidden'
  END as rls_check,
  'Branches with RLS condition check' as description
FROM public.clinic_branches cb;
