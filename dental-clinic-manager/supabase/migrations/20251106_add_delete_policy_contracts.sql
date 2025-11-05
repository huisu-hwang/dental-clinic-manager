-- Migration: Add DELETE policy for employment_contracts
-- Date: 2025-11-06
-- Purpose: Fix "계약서를 찾을 수 없습니다" error when deleting contracts

-- Enable RLS on employment_contracts (if not already enabled)
ALTER TABLE employment_contracts ENABLE ROW LEVEL SECURITY;

-- Add DELETE policy for Service Role
-- This allows the API route with Service Role Key to delete contracts
CREATE POLICY "Service role can delete contracts"
ON employment_contracts
FOR DELETE
USING (true);

-- Note: Service Role Key bypasses RLS when properly configured,
-- but this policy ensures DELETE operations are explicitly allowed

-- Additional SELECT policy for Service Role (for fetching contract details)
CREATE POLICY "Service role can select all contracts"
ON employment_contracts
FOR SELECT
USING (true);

-- Comment
COMMENT ON POLICY "Service role can delete contracts" ON employment_contracts
IS 'Allows Service Role Key to delete contracts (used in API routes)';

COMMENT ON POLICY "Service role can select all contracts" ON employment_contracts
IS 'Allows Service Role Key to select all contracts (used in API routes for validation before delete)';
