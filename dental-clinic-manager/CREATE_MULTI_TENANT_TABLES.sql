-- Multi-tenant dental clinic management system database schema
-- Run this in Supabase SQL Editor

-- 1. Create clinics table
CREATE TABLE IF NOT EXISTS public.clinics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    business_number VARCHAR(50),
    description TEXT,
    logo_url TEXT,
    subscription_tier VARCHAR(50) DEFAULT 'basic',
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    max_users INTEGER DEFAULT 5,
    is_public BOOLEAN DEFAULT false,
    allow_join_requests BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create users table (update if exists)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    last_login_at TIMESTAMP WITH TIME ZONE,
    approved_by UUID REFERENCES public.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create user_invitations table
CREATE TABLE IF NOT EXISTS public.user_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id UUID REFERENCES public.clinics(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    token VARCHAR(500) UNIQUE NOT NULL,
    invited_by UUID REFERENCES public.users(id),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create role_permissions table
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role VARCHAR(50) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    can_create BOOLEAN DEFAULT false,
    can_read BOOLEAN DEFAULT false,
    can_update BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(role, resource)
);

-- 5. Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id),
    clinic_id UUID REFERENCES public.clinics(id),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id UUID,
    details JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_clinic_id ON public.users(clinic_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_status ON public.users(status);
CREATE INDEX IF NOT EXISTS idx_clinics_status ON public.clinics(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_clinic_id ON public.audit_logs(clinic_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- 7. Insert default role permissions
INSERT INTO public.role_permissions (role, resource, can_create, can_read, can_update, can_delete)
VALUES
    -- Master Admin - full access to everything
    ('master_admin', 'clinics', true, true, true, true),
    ('master_admin', 'users', true, true, true, true),
    ('master_admin', 'patients', true, true, true, true),
    ('master_admin', 'appointments', true, true, true, true),
    ('master_admin', 'treatments', true, true, true, true),
    ('master_admin', 'inventory', true, true, true, true),
    ('master_admin', 'settings', true, true, true, true),
    ('master_admin', 'reports', true, true, true, true),
    ('master_admin', 'audit_logs', false, true, false, false),

    -- Owner - full access to their clinic
    ('owner', 'users', true, true, true, true),
    ('owner', 'patients', true, true, true, true),
    ('owner', 'appointments', true, true, true, true),
    ('owner', 'treatments', true, true, true, true),
    ('owner', 'inventory', true, true, true, true),
    ('owner', 'settings', true, true, true, true),
    ('owner', 'reports', false, true, false, false),
    ('owner', 'audit_logs', false, true, false, false),

    -- Vice Director
    ('vice_director', 'users', true, true, true, false),
    ('vice_director', 'patients', true, true, true, true),
    ('vice_director', 'appointments', true, true, true, true),
    ('vice_director', 'treatments', true, true, true, true),
    ('vice_director', 'inventory', true, true, true, false),
    ('vice_director', 'settings', false, true, true, false),
    ('vice_director', 'reports', false, true, false, false),

    -- Manager
    ('manager', 'users', false, true, false, false),
    ('manager', 'patients', true, true, true, true),
    ('manager', 'appointments', true, true, true, true),
    ('manager', 'treatments', true, true, true, true),
    ('manager', 'inventory', true, true, true, false),
    ('manager', 'settings', false, true, false, false),
    ('manager', 'reports', false, true, false, false),

    -- Team Leader
    ('team_leader', 'patients', true, true, true, false),
    ('team_leader', 'appointments', true, true, true, false),
    ('team_leader', 'treatments', true, true, true, false),
    ('team_leader', 'inventory', false, true, true, false),
    ('team_leader', 'reports', false, true, false, false),

    -- Staff
    ('staff', 'patients', false, true, true, false),
    ('staff', 'appointments', false, true, true, false),
    ('staff', 'treatments', false, true, false, false),
    ('staff', 'inventory', false, true, false, false)
ON CONFLICT (role, resource) DO NOTHING;

-- 8. Create sample clinic and owner user
INSERT INTO public.clinics (
    name,
    owner_name,
    address,
    phone,
    email,
    business_number,
    description,
    subscription_tier,
    max_users,
    is_public,
    status
) VALUES (
    '하얀치과',
    '김원장',
    '서울시 송파구 풍납동 152-28 3층',
    '02-477-2878',
    'whitedc0902@gmail.com',
    '123-45-67890',
    '최신 시설과 전문 의료진이 함께하는 하얀치과입니다.',
    'professional',
    10,
    true,
    'active'
) ON CONFLICT DO NOTHING
RETURNING id;

-- Note: To create the owner user, we need the clinic ID from above
-- You can run this separately after getting the clinic ID:
/*
INSERT INTO public.users (
    clinic_id,
    email,
    password_hash,
    name,
    phone,
    role,
    status,
    approved_at
) VALUES (
    '[CLINIC_ID_FROM_ABOVE]',
    'owner@whitedc.com',
    'password123', -- In production, this should be properly hashed
    '김원장',
    '010-1234-5678',
    'owner',
    'active',
    NOW()
);
*/

-- 9. Create a function to get public clinics (for join requests)
CREATE OR REPLACE FUNCTION public.get_public_clinics()
RETURNS TABLE (
    id UUID,
    name VARCHAR(255),
    description TEXT,
    logo_url TEXT,
    address TEXT,
    phone VARCHAR(50),
    current_users BIGINT,
    max_users INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.description,
        c.logo_url,
        c.address,
        c.phone,
        COUNT(u.id) as current_users,
        c.max_users
    FROM public.clinics c
    LEFT JOIN public.users u ON u.clinic_id = c.id AND u.status = 'active'
    WHERE c.is_public = true
        AND c.status = 'active'
        AND c.allow_join_requests = true
    GROUP BY c.id, c.name, c.description, c.logo_url, c.address, c.phone, c.max_users;
END;
$$;

-- 10. Enable Row Level Security (RLS)
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 11. Create RLS policies (simplified for development)
-- In production, you should create more specific policies based on auth

-- Allow all operations for now (for development)
CREATE POLICY "Enable all for development" ON public.clinics
    FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for development" ON public.users
    FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

CREATE POLICY "Enable all for development" ON public.user_invitations
    FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

CREATE POLICY "Enable read for all" ON public.role_permissions
    FOR SELECT TO PUBLIC USING (true);

CREATE POLICY "Enable all for development" ON public.audit_logs
    FOR ALL TO PUBLIC USING (true) WITH CHECK (true);

-- Success message
SELECT 'Multi-tenant tables created successfully!' as message;