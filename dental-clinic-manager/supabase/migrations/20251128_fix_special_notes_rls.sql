-- ============================================================================
-- Fix: RLS 정책 수정 - INSERT 허용
-- Created: 2025-11-28
-- Purpose: special_notes_history 테이블에 INSERT가 제대로 작동하도록 RLS 정책 수정
-- ============================================================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Clinic data isolation for special_notes_history" ON special_notes_history;

-- SELECT를 위한 정책 (자기 클리닉 데이터만 조회 가능)
CREATE POLICY "special_notes_history_select" ON special_notes_history
    FOR SELECT USING (
        clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
        OR auth.uid() IN (SELECT id FROM users WHERE role = 'master_admin')
    );

-- INSERT를 위한 정책 (자기 클리닉에만 삽입 가능)
CREATE POLICY "special_notes_history_insert" ON special_notes_history
    FOR INSERT WITH CHECK (
        clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
    );

-- ============================================================================
-- Fix complete
-- ============================================================================
