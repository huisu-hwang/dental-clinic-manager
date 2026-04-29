-- ========================================
-- 소개환자 관리 Phase 2 — 휴리스틱·통계 함수
-- Migration: 20260429_referral_phase2_helpers
-- ========================================

-- 가족관계 자동 묶음 휴리스틱 함수
-- 동일 phone_number를 공유하는 환자 그룹 (2~8명)을 후보로 반환
CREATE OR REPLACE FUNCTION suggest_family_groups(p_clinic_id UUID, p_limit INT DEFAULT 50)
RETURNS TABLE (
  group_key TEXT,
  member_count INT,
  members JSONB
) AS $$
  SELECT
    phone_number AS group_key,
    COUNT(*)::INT AS member_count,
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'patient_name', patient_name,
        'birth_date', birth_date,
        'chart_number', chart_number,
        'gender', gender
      ) ORDER BY birth_date NULLS LAST
    ) AS members
  FROM dentweb_patients
  WHERE clinic_id = p_clinic_id
    AND COALESCE(is_active, true)
    AND phone_number IS NOT NULL
    AND length(regexp_replace(phone_number, '[^0-9]', '', 'g')) >= 10
    AND id NOT IN (
      SELECT fm.dentweb_patient_id
      FROM patient_family_members fm
      JOIN patient_families f ON f.id = fm.family_id
      WHERE f.clinic_id = p_clinic_id
    )
  GROUP BY phone_number
  HAVING COUNT(*) BETWEEN 2 AND 8
  ORDER BY COUNT(*) DESC, MIN(patient_name)
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- 월별 소개·전환 통계
CREATE OR REPLACE FUNCTION referral_monthly_stats(p_clinic_id UUID, p_months INT DEFAULT 12)
RETURNS TABLE (
  year_month TEXT,
  referral_count INT,
  paid_count INT
) AS $$
  WITH months AS (
    SELECT
      to_char(d, 'YYYY-MM') AS ym,
      date_trunc('month', d)::DATE AS month_start,
      (date_trunc('month', d) + INTERVAL '1 month - 1 day')::DATE AS month_end
    FROM generate_series(
      date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::INTERVAL,
      date_trunc('month', CURRENT_DATE),
      INTERVAL '1 month'
    ) d
  )
  SELECT
    m.ym AS year_month,
    COALESCE(COUNT(pr.id) FILTER (WHERE pr.referred_at BETWEEN m.month_start AND m.month_end), 0)::INT AS referral_count,
    COALESCE(COUNT(pr.id) FILTER (WHERE pr.referred_at BETWEEN m.month_start AND m.month_end AND pr.first_paid_at IS NOT NULL), 0)::INT AS paid_count
  FROM months m
  LEFT JOIN patient_referrals pr ON pr.clinic_id = p_clinic_id
  GROUP BY m.ym, m.month_start
  ORDER BY m.month_start;
$$ LANGUAGE sql STABLE;
