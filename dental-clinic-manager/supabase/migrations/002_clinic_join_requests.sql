-- Create table for clinic join requests
CREATE TABLE IF NOT EXISTS clinic_join_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
  user_email VARCHAR(255) NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  user_phone VARCHAR(20),
  requested_role VARCHAR(50) NOT NULL CHECK (requested_role IN ('vice_director', 'manager', 'team_leader', 'staff')),
  message TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add column to clinics table for public visibility
ALTER TABLE clinics
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS allow_join_requests BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Create index for faster lookup
CREATE INDEX idx_clinic_join_requests_clinic_id ON clinic_join_requests(clinic_id);
CREATE INDEX idx_clinic_join_requests_status ON clinic_join_requests(status);
CREATE INDEX idx_clinic_join_requests_email ON clinic_join_requests(user_email);
CREATE INDEX idx_clinics_is_public ON clinics(is_public);

-- Update trigger for updated_at
CREATE TRIGGER update_clinic_join_requests_updated_at BEFORE UPDATE ON clinic_join_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS for clinic_join_requests
ALTER TABLE clinic_join_requests ENABLE ROW LEVEL SECURITY;

-- RLS policies for clinic_join_requests
CREATE POLICY "Users can view their own join requests" ON clinic_join_requests
    FOR SELECT USING (
        user_email = (SELECT email FROM users WHERE id = auth.uid())
    );

CREATE POLICY "Clinic owners can view join requests for their clinic" ON clinic_join_requests
    FOR SELECT USING (
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid()
            AND role IN ('owner', 'vice_director')
        )
    );

CREATE POLICY "Clinic owners can update join requests for their clinic" ON clinic_join_requests
    FOR UPDATE USING (
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid()
            AND role IN ('owner', 'vice_director')
        )
    );

-- Function to get public clinics
CREATE OR REPLACE FUNCTION get_public_clinics()
RETURNS TABLE (
    id UUID,
    name VARCHAR(200),
    description TEXT,
    logo_url TEXT,
    address TEXT,
    phone VARCHAR(20),
    current_users INTEGER,
    max_users INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id,
        c.name,
        c.description,
        c.logo_url,
        c.address,
        c.phone,
        COUNT(u.id)::INTEGER as current_users,
        c.max_users
    FROM clinics c
    LEFT JOIN users u ON u.clinic_id = c.id AND u.status = 'active'
    WHERE c.is_public = true
    AND c.allow_join_requests = true
    AND c.status = 'active'
    GROUP BY c.id, c.name, c.description, c.logo_url, c.address, c.phone, c.max_users;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to request to join a clinic
CREATE OR REPLACE FUNCTION request_to_join_clinic(
    p_clinic_id UUID,
    p_email VARCHAR(255),
    p_name VARCHAR(100),
    p_phone VARCHAR(20),
    p_requested_role VARCHAR(50),
    p_message TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_clinic_exists BOOLEAN;
    v_existing_request UUID;
    v_existing_user UUID;
    v_request_id UUID;
BEGIN
    -- Check if clinic exists and accepts join requests
    SELECT EXISTS (
        SELECT 1 FROM clinics
        WHERE id = p_clinic_id
        AND allow_join_requests = true
        AND status = 'active'
    ) INTO v_clinic_exists;

    IF NOT v_clinic_exists THEN
        RETURN json_build_object('success', false, 'error', 'Clinic not found or not accepting requests');
    END IF;

    -- Check if user already exists in this clinic
    SELECT id INTO v_existing_user
    FROM users
    WHERE email = p_email
    AND clinic_id = p_clinic_id;

    IF v_existing_user IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'User already exists in this clinic');
    END IF;

    -- Check for existing pending request
    SELECT id INTO v_existing_request
    FROM clinic_join_requests
    WHERE clinic_id = p_clinic_id
    AND user_email = p_email
    AND status = 'pending';

    IF v_existing_request IS NOT NULL THEN
        RETURN json_build_object('success', false, 'error', 'A pending request already exists');
    END IF;

    -- Create join request
    INSERT INTO clinic_join_requests (
        clinic_id,
        user_email,
        user_name,
        user_phone,
        requested_role,
        message
    ) VALUES (
        p_clinic_id,
        p_email,
        p_name,
        p_phone,
        p_requested_role,
        p_message
    ) RETURNING id INTO v_request_id;

    RETURN json_build_object(
        'success', true,
        'request_id', v_request_id,
        'message', 'Join request submitted successfully'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to approve join request
CREATE OR REPLACE FUNCTION approve_join_request(
    p_request_id UUID,
    p_reviewer_id UUID,
    p_password VARCHAR(255),
    p_review_note TEXT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    v_request clinic_join_requests%ROWTYPE;
    v_user_id UUID;
    v_password_hash VARCHAR(255);
BEGIN
    -- Get the request
    SELECT * INTO v_request
    FROM clinic_join_requests
    WHERE id = p_request_id
    AND status = 'pending';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    -- Hash password
    v_password_hash := crypt(p_password, gen_salt('bf'));

    -- Create user account
    INSERT INTO users (
        email,
        password_hash,
        name,
        phone,
        role,
        clinic_id,
        status,
        approved_by,
        approved_at
    ) VALUES (
        v_request.user_email,
        v_password_hash,
        v_request.user_name,
        v_request.user_phone,
        v_request.requested_role,
        v_request.clinic_id,
        'active',
        p_reviewer_id,
        NOW()
    ) RETURNING id INTO v_user_id;

    -- Update request status
    UPDATE clinic_join_requests
    SET
        status = 'approved',
        reviewed_by = p_reviewer_id,
        reviewed_at = NOW(),
        review_note = p_review_note,
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN json_build_object(
        'success', true,
        'user_id', v_user_id,
        'message', 'Join request approved and user account created'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reject join request
CREATE OR REPLACE FUNCTION reject_join_request(
    p_request_id UUID,
    p_reviewer_id UUID,
    p_review_note TEXT DEFAULT NULL
)
RETURNS JSON AS $$
BEGIN
    -- Update request status
    UPDATE clinic_join_requests
    SET
        status = 'rejected',
        reviewed_by = p_reviewer_id,
        reviewed_at = NOW(),
        review_note = p_review_note,
        updated_at = NOW()
    WHERE id = p_request_id
    AND status = 'pending';

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'error', 'Request not found or already processed');
    END IF;

    RETURN json_build_object(
        'success', true,
        'message', 'Join request rejected'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert some sample public clinics for testing
INSERT INTO clinics (
    name,
    owner_name,
    address,
    phone,
    email,
    is_public,
    allow_join_requests,
    description,
    status
) VALUES
    ('서울대학교 치과병원', '김원장', '서울시 종로구 대학로 101', '02-2072-2114', 'info@snudh.org', true, true, '최고의 의료진과 최신 시설을 갖춘 대학병원', 'active'),
    ('강남세브란스 치과병원', '이원장', '서울시 강남구 언주로 211', '02-2019-3114', 'info@yuhs.ac', true, true, '강남 지역 최고의 치과 의료 서비스 제공', 'active'),
    ('삼성서울병원 치과', '박원장', '서울시 강남구 일원로 81', '02-3410-2114', 'info@smc.samsung.com', true, true, '첨단 의료 기술과 환자 중심 진료', 'active')
ON CONFLICT DO NOTHING;