-- Add operating_hours column to clinics table for storing weekly schedules
ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS operating_hours JSONB;

COMMENT ON COLUMN clinics.operating_hours IS 'Clinic operating hours by day (stored as JSON)';
