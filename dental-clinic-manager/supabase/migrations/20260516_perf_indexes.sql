-- Performance indexes identified from dashboard/sidebar load paths.
-- Do not auto-apply from this task; review and run manually in the target environment.

CREATE INDEX IF NOT EXISTS idx_consult_logs_clinic_date
  ON public.consult_logs (clinic_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_gift_logs_clinic_date
  ON public.gift_logs (clinic_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_dentweb_patients_clinic_acquisition_registration
  ON public.dentweb_patients (clinic_id, acquisition_channel, registration_date DESC)
  WHERE acquisition_channel IS NOT NULL
    AND registration_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_user_created_at
  ON public.user_notifications (user_id, created_at DESC);
