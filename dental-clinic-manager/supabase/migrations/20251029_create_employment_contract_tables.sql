-- Migration: Create employment contract tables
-- Date: 2025-10-29
-- Description: Create tables for employment contract management system

-- Enable UUID extension (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================
-- 1. Employment Contract Templates Table
-- =====================================================================
-- Stores contract templates (default and custom per clinic)
CREATE TABLE IF NOT EXISTS employment_contract_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    content JSONB NOT NULL, -- Template structure: HTML, fields, signature positions
    is_default BOOLEAN DEFAULT false,
    version VARCHAR(20) DEFAULT '1.0',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE, -- Soft delete

    CONSTRAINT check_one_default_per_clinic UNIQUE NULLS NOT DISTINCT (clinic_id, is_default)
);

-- =====================================================================
-- 2. Employment Contracts Table
-- =====================================================================
-- Stores actual employment contracts for employees
CREATE TABLE IF NOT EXISTS employment_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clinic_id UUID REFERENCES clinics(id) ON DELETE CASCADE NOT NULL,
    template_id UUID REFERENCES employment_contract_templates(id),
    employee_user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    employer_user_id UUID REFERENCES users(id) NOT NULL,

    -- Contract data (JSON format for flexibility)
    contract_data JSONB NOT NULL,

    -- Contract status
    status VARCHAR(20) DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_employee_signature', 'pending_employer_signature', 'completed', 'cancelled')),

    -- Metadata
    created_by UUID REFERENCES users(id) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    cancelled_by UUID REFERENCES users(id),
    cancellation_reason TEXT,

    -- Version control
    version INTEGER DEFAULT 1,

    -- Notes
    notes TEXT
);

-- =====================================================================
-- 3. Contract Signatures Table
-- =====================================================================
-- Stores digital signatures for contracts
CREATE TABLE IF NOT EXISTS contract_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES employment_contracts(id) ON DELETE CASCADE NOT NULL,
    signer_user_id UUID REFERENCES users(id) NOT NULL,
    signer_type VARCHAR(20) NOT NULL CHECK (signer_type IN ('employer', 'employee')),

    -- Signature data (Base64 encoded image or encrypted signature)
    signature_data TEXT NOT NULL,

    -- Audit trail
    signed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    device_info TEXT,
    user_agent TEXT,

    -- Verification
    is_verified BOOLEAN DEFAULT true,

    CONSTRAINT unique_signature_per_contract_and_type UNIQUE (contract_id, signer_type)
);

-- =====================================================================
-- 4. Contract Field Definitions Table
-- =====================================================================
-- Defines fields that can be used in contract templates
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

    -- For select fields
    options JSONB, -- Array of options

    -- Auto-fill from user profile
    auto_fill_source VARCHAR(100), -- e.g., 'employee_name', 'employee_address'

    -- Validation rules
    validation_rules JSONB,

    -- Display
    display_order INTEGER DEFAULT 0,
    help_text TEXT,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    CONSTRAINT unique_field_key_per_template UNIQUE (template_id, field_key)
);

-- =====================================================================
-- 5. Contract Change History Table
-- =====================================================================
-- Tracks all changes to contracts (audit trail)
CREATE TABLE IF NOT EXISTS contract_change_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    contract_id UUID REFERENCES employment_contracts(id) ON DELETE CASCADE NOT NULL,
    changed_by UUID REFERENCES users(id) NOT NULL,
    change_type VARCHAR(50) NOT NULL, -- 'created', 'updated', 'signed', 'completed', 'cancelled'
    old_data JSONB,
    new_data JSONB,
    change_description TEXT,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- =====================================================================
-- 6. Create Indexes for Performance
-- =====================================================================

-- Templates indexes
CREATE INDEX idx_contract_templates_clinic_id ON employment_contract_templates(clinic_id);
CREATE INDEX idx_contract_templates_is_default ON employment_contract_templates(is_default) WHERE is_default = true;
CREATE INDEX idx_contract_templates_deleted ON employment_contract_templates(deleted_at) WHERE deleted_at IS NULL;

-- Contracts indexes
CREATE INDEX idx_contracts_clinic_id ON employment_contracts(clinic_id);
CREATE INDEX idx_contracts_employee_id ON employment_contracts(employee_user_id);
CREATE INDEX idx_contracts_employer_id ON employment_contracts(employer_user_id);
CREATE INDEX idx_contracts_status ON employment_contracts(status);
CREATE INDEX idx_contracts_template_id ON employment_contracts(template_id);
CREATE INDEX idx_contracts_created_at ON employment_contracts(created_at DESC);

-- Signatures indexes
CREATE INDEX idx_signatures_contract_id ON contract_signatures(contract_id);
CREATE INDEX idx_signatures_signer_id ON contract_signatures(signer_user_id);

-- Field definitions indexes
CREATE INDEX idx_field_defs_template_id ON contract_field_definitions(template_id);
CREATE INDEX idx_field_defs_display_order ON contract_field_definitions(display_order);

-- Change history indexes
CREATE INDEX idx_contract_history_contract_id ON contract_change_history(contract_id);
CREATE INDEX idx_contract_history_changed_at ON contract_change_history(changed_at DESC);

-- =====================================================================
-- 7. Create Triggers for Updated_at
-- =====================================================================

CREATE TRIGGER update_contract_templates_updated_at
    BEFORE UPDATE ON employment_contract_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contracts_updated_at
    BEFORE UPDATE ON employment_contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================================
-- 8. Row Level Security (RLS)
-- =====================================================================

ALTER TABLE employment_contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE employment_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_change_history ENABLE ROW LEVEL SECURITY;

-- Templates: Owners can manage their clinic's templates
CREATE POLICY "Owners can manage templates" ON employment_contract_templates
    FOR ALL USING (
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'master_admin')
        )
    );

-- Contracts: Users can view their own contracts, owners can view all clinic contracts
CREATE POLICY "Users can view contracts" ON employment_contracts
    FOR SELECT USING (
        -- User is the employee
        employee_user_id = auth.uid() OR
        -- User is the employer
        employer_user_id = auth.uid() OR
        -- User is owner of the clinic
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'vice_director', 'manager')
        ) OR
        -- Master admin
        auth.uid() IN (
            SELECT id FROM users WHERE role = 'master_admin'
        )
    );

-- Contracts: Only owners/managers can create contracts
CREATE POLICY "Owners can create contracts" ON employment_contracts
    FOR INSERT WITH CHECK (
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'vice_director', 'manager')
        )
    );

-- Contracts: Owners and contract parties can update
CREATE POLICY "Owners and parties can update contracts" ON employment_contracts
    FOR UPDATE USING (
        employee_user_id = auth.uid() OR
        employer_user_id = auth.uid() OR
        clinic_id IN (
            SELECT clinic_id FROM users
            WHERE id = auth.uid() AND role IN ('owner', 'vice_director', 'manager')
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
                    WHERE id = auth.uid() AND role IN ('owner', 'vice_director', 'manager')
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
                WHERE id = auth.uid() AND role IN ('owner', 'master_admin')
            )
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
                    WHERE id = auth.uid() AND role IN ('owner', 'vice_director', 'manager')
                )
        )
    );

-- =====================================================================
-- 9. Helper Functions
-- =====================================================================

-- Function to log contract changes
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

-- Create trigger for contract changes
CREATE TRIGGER track_contract_changes
    AFTER INSERT OR UPDATE ON employment_contracts
    FOR EACH ROW EXECUTE FUNCTION log_contract_change();

-- =====================================================================
-- 10. Insert Default Template (하얀치과 기본 템플릿)
-- =====================================================================

-- NOTE: This will be inserted when a clinic is created or via admin panel
-- For now, we'll leave it empty and let the application handle default template creation

-- =====================================================================
-- 11. Add Comments for Documentation
-- =====================================================================

COMMENT ON TABLE employment_contract_templates IS '근로계약서 템플릿 테이블';
COMMENT ON TABLE employment_contracts IS '실제 근로계약서 테이블';
COMMENT ON TABLE contract_signatures IS '계약서 전자서명 테이블';
COMMENT ON TABLE contract_field_definitions IS '계약서 필드 정의 테이블';
COMMENT ON TABLE contract_change_history IS '계약서 변경 이력 테이블';

-- =====================================================================
-- Migration Complete
-- =====================================================================
