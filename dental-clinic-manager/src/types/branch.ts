// ============================================
// 지점 관리 시스템 타입 정의
// Branch Management System Types
// ============================================

/**
 * 지점 (Branch)
 */
export interface ClinicBranch {
  id: string
  clinic_id: string
  branch_name: string             // "본점", "강남점", "서초점"
  branch_code: string | null      // 내부 관리 코드 (선택)

  // 지점 위치 정보
  address: string | null
  latitude: number | null         // 위도
  longitude: number | null        // 경도

  // 출근 인증 설정
  attendance_radius_meters: number  // 기본값: 100

  // 지점별 연락처
  phone: string | null

  // 지점 상태
  is_active: boolean
  display_order: number           // 정렬 순서

  created_at: string
  updated_at: string
  created_by: string | null
}

/**
 * 지점 생성 DTO
 */
export interface CreateBranchInput {
  clinic_id: string
  branch_name: string
  branch_code?: string
  address?: string
  latitude?: number
  longitude?: number
  attendance_radius_meters?: number
  phone?: string
  is_active?: boolean
  display_order?: number
}

/**
 * 지점 수정 DTO
 */
export interface UpdateBranchInput {
  branch_name?: string
  branch_code?: string
  address?: string
  latitude?: number
  longitude?: number
  attendance_radius_meters?: number
  phone?: string
  is_active?: boolean
  display_order?: number
}

/**
 * 지점 조회 필터
 */
export interface BranchFilter {
  clinic_id: string
  is_active?: boolean
}

/**
 * 지점 목록 응답
 */
export interface BranchesResponse {
  branches: ClinicBranch[]
  total_count: number
}

/**
 * 지점 통계 (출근 현황용)
 */
export interface BranchAttendanceStats {
  branch_id: string
  branch_name: string
  date: string
  total_employees: number
  checked_in: number
  not_checked_in: number
  late_count: number
  attendance_rate: number  // 출근율 (%)
}

/**
 * 지점 선택 옵션 (UI용)
 */
export interface BranchOption {
  value: string      // branch_id
  label: string      // branch_name
  address?: string
  isActive: boolean
}

/**
 * 지점 유효성 검증 결과
 */
export interface BranchValidation {
  isValid: boolean
  errors: {
    branch_name?: string
    latitude?: string
    longitude?: string
    attendance_radius_meters?: string
    phone?: string
  }
}

/**
 * 지점 위치 정보
 */
export interface BranchLocation {
  branch_id: string
  branch_name: string
  latitude: number
  longitude: number
  radius_meters: number
}

/**
 * 지점 유효성 검증 함수
 */
export function validateBranch(input: CreateBranchInput | UpdateBranchInput): BranchValidation {
  const errors: BranchValidation['errors'] = {}

  // 지점명 검증 (생성 시에만 필수)
  if ('clinic_id' in input) {
    if (!input.branch_name || input.branch_name.trim().length === 0) {
      errors.branch_name = '지점명을 입력해주세요.'
    } else if (input.branch_name.length > 50) {
      errors.branch_name = '지점명은 50자 이내로 입력해주세요.'
    }
  }

  // 위도/경도 검증 (둘 다 있거나 둘 다 없어야 함)
  if ((input.latitude && !input.longitude) || (!input.latitude && input.longitude)) {
    errors.latitude = '위도와 경도를 모두 입력해주세요.'
    errors.longitude = '위도와 경도를 모두 입력해주세요.'
  }

  // 위도 범위 검증
  if (input.latitude !== undefined && input.latitude !== null) {
    if (input.latitude < -90 || input.latitude > 90) {
      errors.latitude = '위도는 -90 ~ 90 사이의 값이어야 합니다.'
    }
  }

  // 경도 범위 검증
  if (input.longitude !== undefined && input.longitude !== null) {
    if (input.longitude < -180 || input.longitude > 180) {
      errors.longitude = '경도는 -180 ~ 180 사이의 값이어야 합니다.'
    }
  }

  // 출근 인증 반경 검증
  if (input.attendance_radius_meters !== undefined) {
    if (input.attendance_radius_meters < 10 || input.attendance_radius_meters > 1000) {
      errors.attendance_radius_meters = '출근 인증 반경은 10 ~ 1000m 사이여야 합니다.'
    }
  }

  // 전화번호 형식 검증 (선택)
  if (input.phone) {
    const phoneRegex = /^[0-9-+() ]{8,20}$/
    if (!phoneRegex.test(input.phone)) {
      errors.phone = '올바른 전화번호 형식이 아닙니다.'
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  }
}

/**
 * 지점명 포맷팅 (표시용)
 */
export function formatBranchName(branchName: string): string {
  return branchName || '본점'
}

/**
 * 지점 주소 포맷팅
 */
export function formatBranchAddress(branch: ClinicBranch): string {
  if (!branch.address) return '-'
  return branch.address
}

/**
 * 거리 계산 (Haversine 공식)
 * @returns 거리 (미터)
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3 // 지구 반지름 (미터)
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // 미터 단위
}

/**
 * 지점 within 범위 검증
 */
export function isWithinBranch(
  userLat: number,
  userLon: number,
  branch: BranchLocation
): {
  isWithin: boolean
  distance: number
} {
  if (!branch.latitude || !branch.longitude) {
    // 위치 정보가 없으면 항상 허용
    return { isWithin: true, distance: 0 }
  }

  const distance = calculateDistance(
    userLat,
    userLon,
    branch.latitude,
    branch.longitude
  )

  return {
    isWithin: distance <= branch.radius_meters,
    distance: Math.round(distance)
  }
}
