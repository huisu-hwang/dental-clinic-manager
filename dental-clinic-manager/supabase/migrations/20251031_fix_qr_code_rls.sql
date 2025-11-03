-- ============================================
-- QR 코드 RLS 정책 수정
-- Fix attendance_qr_codes RLS policy
-- ============================================
--
-- 문제: "Admins can manage qr codes" 정책에 WITH CHECK 절이 없어 INSERT 실패
-- 해결: WITH CHECK 절 추가하여 INSERT 허용
-- ============================================

-- 기존 정책 삭제
DROP POLICY IF EXISTS "Admins can manage qr codes" ON attendance_qr_codes;

-- 관리자만 QR 코드 생성 가능 (WITH CHECK 추가)
CREATE POLICY "Admins can manage qr codes" ON attendance_qr_codes
  FOR ALL
  USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  )
  WITH CHECK (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

-- 정책 확인 쿼리 (참고용, 실행 안 됨)
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies
-- WHERE tablename = 'attendance_qr_codes';
