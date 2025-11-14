-- Fix QR Code RLS Policies (Final v2)
--
-- 문제: WITH CHECK 절에서 attendance_qr_codes.clinic_id 참조가 INSERT 시 모호함
-- 해결: 컬럼명만 직접 사용 (테이블명 제거)
--
-- 날짜: 2025-11-14
-- 작성자: Claude Code

-- ============================================================================
-- 1. 기존 충돌하는 정책 모두 삭제
-- ============================================================================

DROP POLICY IF EXISTS "Admins can manage qr codes" ON public.attendance_qr_codes;
DROP POLICY IF EXISTS "Allow authenticated users to read QR codes" ON public.attendance_qr_codes;
DROP POLICY IF EXISTS "Allow admins and managers to create QR codes" ON public.attendance_qr_codes;
DROP POLICY IF EXISTS "Users can view own clinic qr codes" ON public.attendance_qr_codes;
DROP POLICY IF EXISTS "Owners and managers can create qr codes" ON public.attendance_qr_codes;
DROP POLICY IF EXISTS "Owners and managers can update qr codes" ON public.attendance_qr_codes;
DROP POLICY IF EXISTS "Owners can delete qr codes" ON public.attendance_qr_codes;

-- ============================================================================
-- 2. 새로운 RLS 정책 생성 (컬럼명 직접 참조)
-- ============================================================================

-- SELECT: 인증된 사용자는 자신의 클리닉 QR 코드 조회 가능
CREATE POLICY "Users can view own clinic qr codes"
ON public.attendance_qr_codes
FOR SELECT
TO authenticated
USING (
  clinic_id IN (
    SELECT clinic_id
    FROM public.users
    WHERE id = auth.uid()
  )
);

-- INSERT: owner와 manager만 QR 코드 생성 가능
CREATE POLICY "Owners and managers can create qr codes"
ON public.attendance_qr_codes
FOR INSERT
TO authenticated
WITH CHECK (
  clinic_id IN (
    SELECT u.clinic_id
    FROM public.users u
    WHERE u.id = auth.uid()
    AND u.role IN ('owner', 'manager')
  )
);

-- UPDATE: owner와 manager만 자신의 클리닉 QR 코드 수정 가능
CREATE POLICY "Owners and managers can update qr codes"
ON public.attendance_qr_codes
FOR UPDATE
TO authenticated
USING (
  clinic_id IN (
    SELECT u.clinic_id
    FROM public.users u
    WHERE u.id = auth.uid()
    AND u.role IN ('owner', 'manager')
  )
)
WITH CHECK (
  clinic_id IN (
    SELECT u.clinic_id
    FROM public.users u
    WHERE u.id = auth.uid()
    AND u.role IN ('owner', 'manager')
  )
);

-- DELETE: owner만 자신의 클리닉 QR 코드 삭제 가능
CREATE POLICY "Owners can delete qr codes"
ON public.attendance_qr_codes
FOR DELETE
TO authenticated
USING (
  clinic_id IN (
    SELECT u.clinic_id
    FROM public.users u
    WHERE u.id = auth.uid()
    AND u.role = 'owner'
  )
);

-- ============================================================================
-- 3. 검증 쿼리 (주석 처리, 필요 시 사용)
-- ============================================================================

-- 현재 적용된 정책 확인:
-- SELECT * FROM pg_policies WHERE tablename = 'attendance_qr_codes';

-- 현재 사용자 role 확인:
-- SELECT id, email, role, clinic_id FROM users WHERE id = auth.uid();

-- 테스트: QR 코드 생성 권한 확인:
-- SELECT
--   u.role,
--   u.clinic_id,
--   EXISTS (
--     SELECT 1 FROM users
--     WHERE id = auth.uid()
--     AND role IN ('owner', 'manager')
--   ) as can_create_qr
-- FROM users u
-- WHERE u.id = auth.uid();
