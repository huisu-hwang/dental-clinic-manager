-- Add Branch Support to Attendance System
--
-- 목적: 출퇴근 관리 시스템에 지점별 관리 기능 추가
-- 날짜: 2025-11-14
-- 작성자: Claude Code
--
-- 변경사항:
-- 1. attendance_qr_codes에 branch_id 추가
-- 2. attendance_records에 branch_id 추가
-- 3. users에 primary_branch_id 확인 및 추가
-- 4. 성능 최적화를 위한 인덱스 추가

-- ============================================================================
-- 1. attendance_qr_codes 테이블에 branch_id 컬럼 추가
-- ============================================================================

ALTER TABLE public.attendance_qr_codes
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.clinic_branches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.attendance_qr_codes.branch_id IS '지점 ID (NULL = 클리닉 전체)';

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_branch
ON public.attendance_qr_codes(branch_id);

CREATE INDEX IF NOT EXISTS idx_attendance_qr_codes_clinic_branch_date
ON public.attendance_qr_codes(clinic_id, branch_id, valid_date);

-- ============================================================================
-- 2. attendance_records 테이블에 branch_id 컬럼 추가
-- ============================================================================

ALTER TABLE public.attendance_records
ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.clinic_branches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.attendance_records.branch_id IS '지점 ID (NULL = 클리닉 전체)';

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_attendance_records_branch
ON public.attendance_records(branch_id);

CREATE INDEX IF NOT EXISTS idx_attendance_records_clinic_branch_date
ON public.attendance_records(clinic_id, branch_id, work_date);

-- ============================================================================
-- 3. users 테이블에 primary_branch_id 확인 및 추가
-- ============================================================================

-- primary_branch_id 컬럼이 없는 경우에만 추가
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS primary_branch_id UUID REFERENCES public.clinic_branches(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.users.primary_branch_id IS '직원의 주 근무 지점 ID';

-- 인덱스 추가 (성능 최적화)
CREATE INDEX IF NOT EXISTS idx_users_primary_branch
ON public.users(primary_branch_id);

CREATE INDEX IF NOT EXISTS idx_users_clinic_branch
ON public.users(clinic_id, primary_branch_id);

-- ============================================================================
-- 4. 검증 쿼리 (주석 처리, 필요 시 사용)
-- ============================================================================

-- 테이블 구조 확인:
-- SELECT
--   column_name,
--   data_type,
--   is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'attendance_qr_codes'
--   AND column_name = 'branch_id';

-- 인덱스 확인:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('attendance_qr_codes', 'attendance_records', 'users')
--   AND indexname LIKE '%branch%';

-- 기존 데이터 확인:
-- SELECT COUNT(*) as total,
--        COUNT(branch_id) as with_branch,
--        COUNT(*) - COUNT(branch_id) as without_branch
-- FROM attendance_records;
