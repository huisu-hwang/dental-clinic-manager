-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create clinics table
CREATE TABLE IF NOT EXISTS clinics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(200) NOT NULL,
  owner_name VARCHAR(100) NOT NULL,
  address TEXT NOT NULL,
  phone VARCHAR(20) NOT NULL,
  email VARCHAR(255) NOT NULL,
  business_number VARCHAR(50),
  subscription_tier VARCHAR(50) DEFAULT 'basic',
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  max_users INTEGER DEFAULT 5,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  role VARCHAR(50) NOT NULL CHECK (role IN ('master_admin', 'owner', 'vice_director', 'manager', 'team_leader', 'staff')),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE
);

-- 3. Create user_invitations table
CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  email VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('vice_director', 'manager', 'team_leader', 'staff')),
  token VARCHAR(255) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create role_permissions table
CREATE TABLE IF NOT EXISTS role_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role VARCHAR(50) NOT NULL,
  resource VARCHAR(100) NOT NULL,
  can_create BOOLEAN DEFAULT FALSE,
  can_read BOOLEAN DEFAULT FALSE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  UNIQUE(role, resource)
);

-- 5. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  clinic_id UUID REFERENCES clinics(id),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(100),
  resource_id UUID,
  details JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Add clinic_id to existing tables
ALTER TABLE daily_reports
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

ALTER TABLE consult_logs
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

ALTER TABLE gift_logs
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

ALTER TABLE gift_inventory
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

ALTER TABLE inventory_logs
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS performed_by UUID REFERENCES users(id);

ALTER TABLE happy_call_logs
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE;

-- 7. Create indexes for performance
CREATE INDEX idx_users_clinic_id ON users(clinic_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_daily_reports_clinic_id ON daily_reports(clinic_id);
CREATE INDEX idx_daily_reports_date_clinic ON daily_reports(date, clinic_id);
CREATE INDEX idx_consult_logs_clinic_id ON consult_logs(clinic_id);
CREATE INDEX idx_gift_logs_clinic_id ON gift_logs(clinic_id);
CREATE INDEX idx_gift_inventory_clinic_id ON gift_inventory(clinic_id);
CREATE INDEX idx_audit_logs_clinic_id ON audit_logs(clinic_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- 8. Insert default role permissions
INSERT INTO role_permissions (role, resource, can_create, can_read, can_update, can_delete) VALUES
-- Master Admin permissions (full access to everything)
('master_admin', 'clinics', true, true, true, true),
('master_admin', 'users', true, true, true, true),
('master_admin', 'system_settings', true, true, true, true),
('master_admin', 'audit_logs', false, true, false, false),

-- Clinic Owner permissions
('owner', 'daily_reports', true, true, true, true),
('owner', 'consult_logs', true, true, true, true),
('owner', 'gift_logs', true, true, true, true),
('owner', 'inventory', true, true, true, true),
('owner', 'happy_calls', true, true, true, true),
('owner', 'staff_management', true, true, true, true),
('owner', 'clinic_settings', true, true, true, false),
('owner', 'audit_logs', false, true, false, false),

-- Vice Director permissions (similar to owner but limited)
('vice_director', 'daily_reports', true, true, true, true),
('vice_director', 'consult_logs', true, true, true, true),
('vice_director', 'gift_logs', true, true, true, true),
('vice_director', 'inventory', true, true, true, false),
('vice_director', 'happy_calls', true, true, true, true),
('vice_director', 'staff_management', false, true, true, false),
('vice_director', 'clinic_settings', false, true, false, false),

-- Manager permissions
('manager', 'daily_reports', true, true, true, false),
('manager', 'consult_logs', true, true, true, false),
('manager', 'gift_logs', true, true, true, false),
('manager', 'inventory', true, true, true, false),
('manager', 'happy_calls', true, true, true, false),
('manager', 'staff_management', false, true, false, false),

-- Team Leader permissions
('team_leader', 'daily_reports', true, true, true, false),
('team_leader', 'consult_logs', true, true, true, false),
('team_leader', 'gift_logs', true, true, true, false),
('team_leader', 'inventory', false, true, true, false),
('team_leader', 'happy_calls', true, true, true, false),

-- Staff permissions (most restricted)
('staff', 'daily_reports', true, true, false, false),
('staff', 'consult_logs', true, true, false, false),
('staff', 'gift_logs', true, true, false, false),
('staff', 'inventory', false, true, false, false),
('staff', 'happy_calls', true, true, false, false);

-- 9. Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 10. Create triggers for updated_at
CREATE TRIGGER update_clinics_updated_at BEFORE UPDATE ON clinics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 11. Enable Row Level Security
ALTER TABLE clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE consult_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE happy_call_logs ENABLE ROW LEVEL SECURITY;

-- 12. Create RLS policies
-- Allow users to see only their clinic's data
CREATE POLICY "Users can view their own clinic" ON clinics
    FOR SELECT USING (
        auth.uid() IN (
            SELECT id FROM users WHERE clinic_id = clinics.id
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

CREATE POLICY "Users can view colleagues in same clinic" ON users
    FOR SELECT USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

CREATE POLICY "Clinic data isolation for daily_reports" ON daily_reports
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- Similar policies for other tables
CREATE POLICY "Clinic data isolation for consult_logs" ON consult_logs
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

CREATE POLICY "Clinic data isolation for gift_logs" ON gift_logs
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

CREATE POLICY "Clinic data isolation for gift_inventory" ON gift_inventory
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

CREATE POLICY "Clinic data isolation for inventory_logs" ON inventory_logs
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

CREATE POLICY "Clinic data isolation for happy_call_logs" ON happy_call_logs
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users WHERE id = auth.uid()
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- 13. Create master admin account (password should be changed after first login)
-- Note: In production, use Supabase Auth instead of storing passwords directly
INSERT INTO users (
    email,
    password_hash,
    name,
    role,
    status
) VALUES (
    'admin@dentalmanager.com',
    crypt('ChangeMeImmediately!', gen_salt('bf')),
    'System Administrator',
    'master_admin',
    'active'
) ON CONFLICT (email) DO NOTHING;