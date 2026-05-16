-- ============================================
-- DentWeb sync path optimization
-- Created: 2026-05-16
-- ============================================

CREATE INDEX IF NOT EXISTS idx_dentweb_sync_config_clinic_api_key
  ON dentweb_sync_config(clinic_id, api_key);

CREATE OR REPLACE FUNCTION sync_dentweb_patients_batch(
  p_clinic_id UUID,
  p_patients JSONB,
  p_synced_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  total_records INTEGER,
  new_records INTEGER,
  updated_records INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH payload AS (
    SELECT
      p_clinic_id AS clinic_id,
      dentweb_patient_id,
      NULLIF(chart_number, '') AS chart_number,
      patient_name,
      NULLIF(phone_number, '') AS phone_number,
      birth_date,
      NULLIF(gender, '') AS gender,
      last_visit_date,
      NULLIF(last_treatment_type, '') AS last_treatment_type,
      next_appointment_date,
      NULLIF(next_appointment_memo, '') AS next_appointment_memo,
      registration_date,
      NULLIF(acquisition_channel, '') AS acquisition_channel,
      NULLIF(customer_type, '') AS customer_type,
      COALESCE(is_active, true) AS is_active,
      raw_data
    FROM jsonb_to_recordset(COALESCE(p_patients, '[]'::jsonb)) AS incoming(
      dentweb_patient_id TEXT,
      chart_number TEXT,
      patient_name TEXT,
      phone_number TEXT,
      birth_date DATE,
      gender TEXT,
      last_visit_date DATE,
      last_treatment_type TEXT,
      next_appointment_date DATE,
      next_appointment_memo TEXT,
      registration_date DATE,
      acquisition_channel TEXT,
      customer_type TEXT,
      is_active BOOLEAN,
      raw_data JSONB
    )
  ),
  counts AS (
    SELECT
      COUNT(*)::INTEGER AS total_records,
      COUNT(*) FILTER (WHERE existing.dentweb_patient_id IS NULL)::INTEGER AS new_records,
      COUNT(*) FILTER (WHERE existing.dentweb_patient_id IS NOT NULL)::INTEGER AS updated_records
    FROM payload
    LEFT JOIN dentweb_patients AS existing
      ON existing.clinic_id = p_clinic_id
     AND existing.dentweb_patient_id = payload.dentweb_patient_id
  ),
  upserted AS (
    INSERT INTO dentweb_patients (
      clinic_id,
      dentweb_patient_id,
      chart_number,
      patient_name,
      phone_number,
      birth_date,
      gender,
      last_visit_date,
      last_treatment_type,
      next_appointment_date,
      next_appointment_memo,
      registration_date,
      acquisition_channel,
      customer_type,
      is_active,
      raw_data,
      synced_at,
      updated_at
    )
    SELECT
      clinic_id,
      dentweb_patient_id,
      chart_number,
      patient_name,
      phone_number,
      birth_date,
      gender,
      last_visit_date,
      last_treatment_type,
      next_appointment_date,
      next_appointment_memo,
      registration_date,
      acquisition_channel,
      customer_type,
      is_active,
      raw_data,
      p_synced_at,
      p_synced_at
    FROM payload
    ON CONFLICT (clinic_id, dentweb_patient_id) DO UPDATE
    SET
      chart_number = EXCLUDED.chart_number,
      patient_name = EXCLUDED.patient_name,
      phone_number = EXCLUDED.phone_number,
      birth_date = EXCLUDED.birth_date,
      gender = EXCLUDED.gender,
      last_visit_date = EXCLUDED.last_visit_date,
      last_treatment_type = EXCLUDED.last_treatment_type,
      next_appointment_date = EXCLUDED.next_appointment_date,
      next_appointment_memo = EXCLUDED.next_appointment_memo,
      registration_date = EXCLUDED.registration_date,
      acquisition_channel = EXCLUDED.acquisition_channel,
      customer_type = EXCLUDED.customer_type,
      is_active = EXCLUDED.is_active,
      raw_data = EXCLUDED.raw_data,
      synced_at = EXCLUDED.synced_at,
      updated_at = EXCLUDED.updated_at
    RETURNING 1
  ),
  applied AS (
    SELECT COUNT(*) FROM upserted
  )
  SELECT counts.total_records, counts.new_records, counts.updated_records
  FROM counts, applied;
END;
$$;
