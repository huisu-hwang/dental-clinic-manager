-- =====================================================================
-- EMPLOYMENT CONTRACT SYSTEM - DATABASE SETUP
-- =====================================================================
-- This script creates all necessary tables for the employment contract system.
-- Run this in Supabase Dashboard > SQL Editor
-- =====================================================================

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. Employment Contract Templates Table
-- =====================================================================
CREATE TABLE IF NOT EXISTS employment_contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    content JSONB NOT NULL,
    is_default BOOLEAN DEFAULT false,
    version VARCHAR(20) DEFAULT '1.0',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT check_one_default_per_clinic UNIQUE NULLS NOT DISTINCT (clinic_id, is_default)
);

-- =====================================================================
-- 2. Employment Contracts Table
-- =====================================================================
CREATE TABLE IF NOT EXISTS employment_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
    template_id UUID REFERENCES employment_contract_templates(id),
    employee_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    employer_user_id UUID REFERENCES users(id) NOT NULL,
    contract_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_employee_signature', 'pending_employer_signature', 'completed', 'cancelled')),
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_by UUID REFERENCES users(id),
    cancellation_reason TEXT,
    version INTEGER DEFAULT 1,
    notes TEXT
);

-- =====================================================================
-- 3. Contract Signatures Table
-- =====================================================================
CREATE TABLE IF NOT EXISTS contract_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES employment_contracts(id) ON DELETE CASCADE NOT NULL,
    signer_user_id UUID REFERENCES users(id) NOT NULL,
    signer_type VARCHAR(20) NOT NULL CHECK (signer_type IN ('employer', 'employee')),
    signature_data TEXT NOT NULL,
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    device_info TEXT,
    user_agent TEXT,
    is_verified BOOLEAN DEFAULT true,
    CONSTRAINT unique_signature_per_contract_and_type UNIQUE (contract_id, signer_type)
);

-- =====================================================================
-- 4. Contract Field Definitions Table
-- =====================================================================
CREATE TABLE IF NOT EXISTS contract_field_definitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id UUID REFERENCES employment_contract_templates(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(200) NOT NULL,
    field_type VARCHAR(50) NOT NULL
        CHECK (field_type IN ('text', 'number', 'date', 'select', 'textarea', 'checkbox', 'signature')),
    is_required BOOLEAN DEFAULT false,
    default_value TEXT,
    placeholder TEXT,
    options JSONB,
    auto_fill_source VARCHAR(100),
    validation_rules JSONB,
    display_order INTEGER DEFAULT 0,
    help_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_field_key_per_template UNIQUE (template_id, field_key)
);

-- =====================================================================
-- 5. Contract Change History Table
-- =====================================================================
CREATE TABLE IF NOT EXISTS contract_change_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES employment_contracts(id) ON DELETE CASCADE NOT NULL,
    changed_by UUID REFERENCES users(id) NOT NULL,
    change_type VARCHAR(50) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    change_description TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- =====================================================================
-- 6. Create Indexes
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_contract_templates_clinic_id ON employment_contract_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_is_default ON employment_contract_templates(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_contract_templates_deleted ON employment_contract_templates(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contracts_clinic_id ON employment_contracts(clinic_id);
CREATE INDEX IF NOT EXISTS idx_contracts_employee_id ON employment_contracts(employee_user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_employer_id ON employment_contracts(employer_user_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON employment_contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_template_id ON employment_contracts(template_id);
CREATE INDEX IF NOT EXISTS idx_contracts_created_at ON employment_contracts(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_signatures_contract_id ON contract_signatures(contract_id);
CREATE INDEX IF NOT EXISTS idx_signatures_signer_id ON contract_signatures(signer_user_id);

CREATE INDEX IF NOT EXISTS idx_field_defs_template_id ON contract_field_definitions(template_id);
CREATE INDEX IF NOT EXISTS idx_field_defs_display_order ON contract_field_definitions(display_order);

CREATE INDEX IF NOT EXISTS idx_contract_history_contract_id ON contract_change_history(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_history_changed_at ON contract_change_history(changed_at DESC);

-- =====================================================================
-- 7. Create Triggers
-- =====================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contract_templates_updated_at') THEN
        CREATE TRIGGER update_contract_templates_updated_at
            BEFORE UPDATE ON employment_contract_templates
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_contracts_updated_at') THEN
        CREATE TRIGGER update_contracts_updated_at
            BEFORE UPDATE ON employment_contracts
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- =====================================================================
-- 8. Row Level Security (RLS)
-- =====================================================================
ALTER TABLE employment_contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_change_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DO $$
BEGIN
    DROP POLICY IF EXISTS "Owners can manage templates" ON employment_contract_templates;
    DROP POLICY IF EXISTS "Users can view contracts" ON employment_contracts;
    DROP POLICY IF EXISTS "Owners can create contracts" ON employment_contracts;
    DROP POLICY IF EXISTS "Owners and parties can update contracts" ON employment_contracts;
    DROP POLICY IF EXISTS "Users can sign own contracts" ON contract_signatures;
    DROP POLICY IF EXISTS "View signatures with contract" ON contract_signatures;
    DROP POLICY IF EXISTS "Field definitions inherit template permissions" ON contract_field_definitions;
    DROP POLICY IF EXISTS "View contract history" ON contract_change_history;
END $$;

-- Templates: Owners can manage their clinic's templates
CREATE POLICY "Owners can manage templates" ON employment_contract_templates
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'master')
        )
        OR clinic_id IS NULL
    );

-- Contracts: Users can view their own contracts, owners can view all clinic contracts
CREATE POLICY "Users can view contracts" ON employment_contracts
    FOR SELECT USING (
        employee_user_id = auth.uid() OR
        employer_user_id = auth.uid() OR
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'manager')
        ) OR
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master'
        )
    );

-- Contracts: Only owners/managers can create contracts
CREATE POLICY "Owners can create contracts" ON employment_contracts
    FOR INSERT WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'manager')
        )
    );

-- Contracts: Owners and contract parties can update
CREATE POLICY "Owners and parties can update contracts" ON employment_contracts
    FOR UPDATE USING (
        employee_user_id = auth.uid() OR
        employer_user_id = auth.uid() OR
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'manager')
        )
    );

-- Signatures: Users can only sign their own contracts
CREATE POLICY "Users can sign own contracts" ON contract_signatures
    FOR INSERT WITH CHECK (
        signer_user_id = auth.uid() AND
        contract_id IN (
            SELECT id FROM employment_contracts
            WHERE employee_user_id = auth.uid() OR employer_user_id = auth.uid()
        )
    );

-- Signatures: Anyone who can view the contract can view signatures
CREATE POLICY "View signatures with contract" ON contract_signatures
    FOR SELECT USING (
        contract_id IN (
            SELECT id FROM employment_contracts
            WHERE employee_user_id = auth.uid()
                OR employer_user_id = auth.uid()
                OR clinic_id IN (
                    SELECT clinic_id FROM users
                    WHERE id = auth.uid() AND role IN ('owner', 'manager')
                )
        )
    );

-- Field definitions: Inherit from template permissions
CREATE POLICY "Field definitions inherit template permissions" ON contract_field_definitions
    FOR ALL USING (
        template_id IN (
            SELECT id FROM employment_contract_templates
            WHERE clinic_id IN (
                SELECT clinic_id FROM users
                WHERE id = auth.uid() AND role IN ('owner', 'master')
            ) OR clinic_id IS NULL
        )
    );

-- Change history: Read-only for authorized users
CREATE POLICY "View contract history" ON contract_change_history
    FOR SELECT USING (
        contract_id IN (
            SELECT id FROM employment_contracts
            WHERE employee_user_id = auth.uid()
                OR employer_user_id = auth.uid()
                OR clinic_id IN (
                    SELECT clinic_id FROM users
                    WHERE id = auth.uid() AND role IN ('owner', 'manager')
                )
        )
    );

-- =====================================================================
-- 9. Helper Functions
-- =====================================================================
CREATE OR REPLACE FUNCTION log_contract_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'UPDATE') THEN
        INSERT INTO contract_change_history (
            contract_id,
            changed_by,
            change_type,
            old_data,
            new_data,
            change_description
        ) VALUES (
            NEW.id,
            auth.uid(),
            'updated',
            to_jsonb(OLD),
            to_jsonb(NEW),
            'Contract data updated'
        );
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO contract_change_history (
            contract_id,
            changed_by,
            change_type,
            new_data,
            change_description
        ) VALUES (
            NEW.id,
            auth.uid(),
            'created',
            to_jsonb(NEW),
            'Contract created'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'track_contract_changes') THEN
        CREATE TRIGGER track_contract_changes
            AFTER INSERT OR UPDATE ON employment_contracts
            FOR EACH ROW EXECUTE FUNCTION log_contract_change();
    END IF;
END $$;

-- =====================================================================
-- 10. Insert Default Template
-- =====================================================================
INSERT INTO employment_contract_templates (
  id,
  clinic_id,
  name,
  description,
  content,
  is_default,
  version,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'default-hayan-template-001',
  NULL,
  '하얀치과 표준 근로계약서',
  '하얀치과에서 사용하는 표준 근로계약서 템플릿입니다. 각 병원에서 필요에 따라 수정하여 사용할 수 있습니다.',
  jsonb_build_object(
    'fields', jsonb_build_array(
      jsonb_build_object('key', 'employee_name', 'label', '근로자 성명', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employee_resident_number', 'label', '주민등록번호', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employee_address', 'label', '주소', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employee_phone', 'label', '전화번호', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employer_name', 'label', '사용자(원장) 성명', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'clinic_name', 'label', '병원명', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'clinic_address', 'label', '병원 주소', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employment_period_start', 'label', '근로 시작일', 'type', 'date', 'required', true),
      jsonb_build_object('key', 'employment_period_end', 'label', '근로 종료일', 'type', 'date', 'required', false),
      jsonb_build_object('key', 'is_permanent', 'label', '무기한 계약', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'work_start_time', 'label', '근무 시작 시간', 'type', 'time', 'required', true),
      jsonb_build_object('key', 'work_end_time', 'label', '근무 종료 시간', 'type', 'time', 'required', true),
      jsonb_build_object('key', 'work_days_per_week', 'label', '주당 근무일수', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'annual_leave_days', 'label', '연차 휴가일수', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'salary_base', 'label', '기본급(월)', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'salary_payment_day', 'label', '급여 지급일', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'allowance_meal', 'label', '식대', 'type', 'number', 'required', false),
      jsonb_build_object('key', 'allowance_transport', 'label', '교통비', 'type', 'number', 'required', false),
      jsonb_build_object('key', 'allowance_other', 'label', '기타 수당', 'type', 'number', 'required', false),
      jsonb_build_object('key', 'social_insurance', 'label', '국민연금', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'health_insurance', 'label', '건강보험', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'employment_insurance', 'label', '고용보험', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'pension_insurance', 'label', '산재보험', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'special_terms', 'label', '특약사항', 'type', 'textarea', 'required', false)
    ),
    'layout', jsonb_build_object(
      'title', '근로계약서',
      'sections', jsonb_build_array(
        jsonb_build_object('title', '제1조 (당사자)', 'fields', jsonb_build_array('employer_name', 'clinic_name', 'clinic_address', 'employee_name', 'employee_resident_number', 'employee_address', 'employee_phone')),
        jsonb_build_object('title', '제2조 (근로기간)', 'fields', jsonb_build_array('employment_period_start', 'employment_period_end', 'is_permanent')),
        jsonb_build_object('title', '제3조 (근무장소)', 'fields', jsonb_build_array('clinic_address')),
        jsonb_build_object('title', '제4조 (근로시간)', 'fields', jsonb_build_array('work_start_time', 'work_end_time', 'work_days_per_week', 'annual_leave_days')),
        jsonb_build_object('title', '제5조 (임금)', 'fields', jsonb_build_array('salary_base', 'salary_payment_day', 'allowance_meal', 'allowance_transport', 'allowance_other')),
        jsonb_build_object('title', '제6조 (사회보험)', 'fields', jsonb_build_array('social_insurance', 'health_insurance', 'employment_insurance', 'pension_insurance')),
        jsonb_build_object('title', '제7조 (특약사항)', 'fields', jsonb_build_array('special_terms'))
      )
    ),
    'signature_positions', jsonb_build_object(
      'employer', jsonb_build_object('label', '사용자 (갑)', 'position', 'bottom-left'),
      'employee', jsonb_build_object('label', '근로자 (을)', 'position', 'bottom-right')
    )
  ),
  true,
  '1.0',
  NULL,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  updated_at = NOW();

-- =====================================================================
-- 11. Add Comments
-- =====================================================================
COMMENT ON TABLE employment_contract_templates IS '근로계약서 템플릿 테이블';
COMMENT ON TABLE employment_contracts IS '실제 근로계약서 테이블';
COMMENT ON TABLE contract_signatures IS '계약서 전자서명 테이블';
COMMENT ON TABLE contract_field_definitions IS '계약서 필드 정의 테이블';
COMMENT ON TABLE contract_change_history IS '계약서 변경 이력 테이블';

-- =====================================================================
-- SETUP COMPLETE
-- =====================================================================
-- All contract tables have been created successfully!
-- You can now use the employment contract system in your application.
-- =====================================================================
