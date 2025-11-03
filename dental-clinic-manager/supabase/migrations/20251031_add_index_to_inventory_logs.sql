-- Add index to inventory_logs table for performance improvement
CREATE INDEX IF NOT EXISTS idx_inventory_logs_clinic_id ON inventory_logs(clinic_id);
