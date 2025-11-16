-- Migration: Fix employment contract RLS permissions
-- Date: 2025-11-15
-- Purpose: 근로계약서는 원장과 계약 당사자만 볼 수 있도록 권한 수정
-- Issue: 부원장/매니저가 모든 계약서를 볼 수 있는 보안 문제

-- =====================================================================
-- 1. Drop existing policies
-- =====================================================================

-- Drop employment_contracts policies
DROP POLICY IF EXISTS "Users can view contracts" ON employment_contracts;
DROP POLICY IF EXISTS "Owners can create contracts" ON employment_contracts;
DROP POLICY IF EXISTS "Owners and parties can update contracts" ON employment_contracts;
DROP POLICY IF EXISTS "Service role can select all contracts" ON employment_contracts;
DROP POLICY IF EXISTS "Service role can delete contracts" ON employment_contracts;

-- Drop contract_signatures policies
DROP POLICY IF EXISTS "View signatures with contract" ON contract_signatures;

-- Drop contract_change_history policies
DROP POLICY IF EXISTS "View contract history" ON contract_change_history;

-- =====================================================================
-- 2. Create new restrictive policies
-- =====================================================================

-- Employment Contracts: SELECT policy
-- Only owner (원장) and contract parties (계약 당사자) can view
CREATE POLICY "Only owner and contract parties can view contracts"
ON employment_contracts
FOR SELECT
USING (
    -- User is the employee (계약 당사자 - 직원)
    employee_user_id = auth.uid()
    OR
    -- User is the employer (계약 당사자 - 고용주)
    employer_user_id = auth.uid()
    OR
    -- User is owner of the clinic (원장만)
    clinic_id IN (
        SELECT clinic_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
    )
    OR
    -- Master admin (시스템 관리자)
    auth.uid() IN (
        SELECT id FROM users WHERE role = 'master_admin'
    )
);

-- Employment Contracts: INSERT policy
-- Only owners can create contracts (원장만 계약서 생성 가능)
CREATE POLICY "Only owners can create contracts"
ON employment_contracts
FOR INSERT
WITH CHECK (
    clinic_id IN (
        SELECT clinic_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
    )
);

-- Employment Contracts: UPDATE policy
-- Only owner and contract parties can update
CREATE POLICY "Only owner and contract parties can update contracts"
ON employment_contracts
FOR UPDATE
USING (
    -- User is the employee
    employee_user_id = auth.uid()
    OR
    -- User is the employer
    employer_user_id = auth.uid()
    OR
    -- User is owner of the clinic
    clinic_id IN (
        SELECT clinic_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
    )
);

-- Employment Contracts: DELETE policy
-- Only owners can delete contracts (원장만 계약서 삭제 가능)
CREATE POLICY "Only owners can delete contracts"
ON employment_contracts
FOR DELETE
USING (
    clinic_id IN (
        SELECT clinic_id FROM users
        WHERE id = auth.uid() AND role = 'owner'
    )
);

-- Contract Signatures: SELECT policy
-- Anyone who can view the contract can view signatures
CREATE POLICY "View signatures with contract access"
ON contract_signatures
FOR SELECT
USING (
    contract_id IN (
        SELECT id FROM employment_contracts
        WHERE
            employee_user_id = auth.uid()
            OR employer_user_id = auth.uid()
            OR clinic_id IN (
                SELECT clinic_id FROM users
                WHERE id = auth.uid() AND role = 'owner'
            )
    )
);

-- Contract Change History: SELECT policy
-- Read-only for authorized users (owner and contract parties)
CREATE POLICY "View contract history with access"
ON contract_change_history
FOR SELECT
USING (
    contract_id IN (
        SELECT id FROM employment_contracts
        WHERE
            employee_user_id = auth.uid()
            OR employer_user_id = auth.uid()
            OR clinic_id IN (
                SELECT clinic_id FROM users
                WHERE id = auth.uid() AND role = 'owner'
            )
    )
);

-- =====================================================================
-- 3. Add policy comments
-- =====================================================================

COMMENT ON POLICY "Only owner and contract parties can view contracts" ON employment_contracts
IS '근로계약서는 원장과 계약 당사자(직원/고용주)만 조회 가능';

COMMENT ON POLICY "Only owners can create contracts" ON employment_contracts
IS '근로계약서는 원장만 생성 가능';

COMMENT ON POLICY "Only owner and contract parties can update contracts" ON employment_contracts
IS '근로계약서는 원장과 계약 당사자만 수정 가능';

COMMENT ON POLICY "View signatures with contract access" ON contract_signatures
IS '계약서 조회 권한이 있는 사람만 서명 조회 가능';

COMMENT ON POLICY "View contract history with access" ON contract_change_history
IS '계약서 조회 권한이 있는 사람만 변경 이력 조회 가능';

-- =====================================================================
-- Migration Complete
-- =====================================================================
