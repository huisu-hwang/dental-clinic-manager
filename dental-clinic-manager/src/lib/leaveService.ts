/**
 * 연차 관리 서비스
 * Leave Management Service
 */

import { ensureConnection } from './supabase/connectionCheck'
import { userNotificationService } from './userNotificationService'
import type {
  LeavePolicy,
  LeaveType,
  LeaveRequest,
  LeaveRequestInput,
  LeaveApproval,
  LeaveApprovalInput,
  EmployeeLeaveBalance,
  LeaveApprovalWorkflow,
  LeaveRequestStatus,
  YearlyLeaveRule,
  ManagerApprovalByRank,
} from '@/types/leave'

// Helper function to extract error message
const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message
    }
    if ('error' in error && typeof (error as any).error === 'string') {
      return (error as any).error
    }
  }
  return 'Unknown error occurred'
}

// 현재 클리닉 ID 가져오기
const getCurrentClinicId = (): string | null => {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')
}

// 현재 사용자 ID 가져오기
const getCurrentUserId = (): string | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    const user = JSON.parse(userStr)
    return user.id
  } catch {
    return null
  }
}

// 현재 사용자 정보 가져오기
const getCurrentUser = (): { id: string; role: string; clinic_id: string; name?: string } | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

/**
 * 대한민국 근로기준법 기반 연차 계산 (기본 - DB 조회 없이)
 * 1년 미만 직원의 경우 월별 만근 확인은 calculateAnnualLeaveDaysWithUnpaidCheck 함수 사용
 * @param hireDate 입사일
 * @param referenceDate 기준일 (기본값: 오늘)
 */
export function calculateAnnualLeaveDays(hireDate: Date, referenceDate: Date = new Date()): number {
  const diffTime = referenceDate.getTime() - hireDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const yearsOfService = diffDays / 365

  // 1년 미만: 월 1일 (최대 11일) - 기본 계산 (만근 여부 확인 없이)
  if (yearsOfService < 1) {
    const monthsWorked = Math.floor(diffDays / 30)
    return Math.min(monthsWorked, 11)
  }

  // 1년 이상: 15일 기본 + 2년마다 1일 추가 (최대 25일)
  // 3년 이상부터 1일 추가 시작
  const extraDays = Math.floor((yearsOfService - 1) / 2)
  return Math.min(15 + extraDays, 25)
}

/**
 * 1년 미만 직원의 월별 만근 기준 연차 계산
 * 무급휴가를 사용한 달은 연차가 발생하지 않음
 * @param hireDate 입사일
 * @param referenceDate 기준일 (기본값: 오늘)
 * @param unpaidLeaveByMonth 월별 무급휴가 사용 기록 (key: 'YYYY-MM', value: 일수)
 */
export function calculateAnnualLeaveDaysWithUnpaidCheck(
  hireDate: Date,
  referenceDate: Date = new Date(),
  unpaidLeaveByMonth: Record<string, number> = {}
): number {
  const diffTime = referenceDate.getTime() - hireDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  const yearsOfService = diffDays / 365

  // 1년 이상인 경우 기존 로직 사용
  if (yearsOfService >= 1) {
    const extraDays = Math.floor((yearsOfService - 1) / 2)
    return Math.min(15 + extraDays, 25)
  }

  // 1년 미만: 각 월별로 만근 여부 확인
  let earnedDays = 0
  const hire = new Date(hireDate)
  const ref = new Date(referenceDate)

  // 입사일부터 현재까지 각 월을 순회
  let checkDate = new Date(hire)

  while (earnedDays < 11) { // 최대 11일
    // 해당 월의 마지막 날 계산
    const monthEnd = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 0)

    // 아직 해당 월이 완전히 지나지 않았으면 중단
    if (monthEnd > ref) {
      break
    }

    // 해당 월의 키 생성 (YYYY-MM)
    const monthKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}`

    // 해당 월에 무급휴가 사용이 없으면 연차 1일 부여
    if (!unpaidLeaveByMonth[monthKey] || unpaidLeaveByMonth[monthKey] === 0) {
      earnedDays++
    }

    // 다음 달로 이동
    checkDate = new Date(checkDate.getFullYear(), checkDate.getMonth() + 1, 1)
  }

  return earnedDays
}

/**
 * 근속 연수 계산
 */
export function calculateYearsOfService(hireDate: Date, referenceDate: Date = new Date()): number {
  const diffTime = referenceDate.getTime() - hireDate.getTime()
  const years = diffTime / (1000 * 60 * 60 * 24 * 365)
  return Math.round(years * 10) / 10 // 소수점 첫째 자리까지
}

/**
 * 입사일 기준 현재 연차 기간 계산
 * @param hireDate 입사일
 * @param referenceDate 기준일 (기본값: 오늘)
 * @returns { startDate: string, endDate: string, yearNumber: number }
 *
 * 예시: 입사일 2024-06-01, 기준일 2025-12-18
 * - 1년차: 2024-06-01 ~ 2025-05-31
 * - 2년차: 2025-06-01 ~ 2026-05-31 (현재 기간)
 */
export function calculateLeavePeriod(hireDate: Date, referenceDate: Date = new Date()): {
  startDate: string
  endDate: string
  yearNumber: number
} {
  const hire = new Date(hireDate)
  const ref = new Date(referenceDate)

  // 연차 기간의 시작일 계산 (입사일 기준)
  let periodStart = new Date(hire)
  let yearNumber = 1

  // 현재 날짜가 속한 연차 기간 찾기
  while (true) {
    const periodEnd = new Date(periodStart)
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    periodEnd.setDate(periodEnd.getDate() - 1) // 1년 후 하루 전

    if (ref <= periodEnd) {
      // 현재 기간 찾음
      return {
        startDate: periodStart.toISOString().split('T')[0],
        endDate: periodEnd.toISOString().split('T')[0],
        yearNumber
      }
    }

    // 다음 기간으로
    periodStart.setFullYear(periodStart.getFullYear() + 1)
    yearNumber++

    // 무한 루프 방지 (최대 50년)
    if (yearNumber > 50) break
  }

  // fallback
  const endDate = new Date(periodStart)
  endDate.setFullYear(endDate.getFullYear() + 1)
  endDate.setDate(endDate.getDate() - 1)

  return {
    startDate: periodStart.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    yearNumber
  }
}

/**
 * 직급별 실장 결재 포함 여부를 판단하는 헬퍼 함수
 * @param role 신청자 직급
 * @param requireManagerApproval 실장 결재 설정 (boolean 또는 직급별 객체)
 */
function shouldRequireManagerApproval(
  role: string,
  requireManagerApproval: boolean | ManagerApprovalByRank
): boolean {
  // boolean인 경우 모든 직급에 동일하게 적용 (부원장 제외)
  if (typeof requireManagerApproval === 'boolean') {
    // 부원장은 기존 boolean 설정에서는 기본적으로 원장 직접 승인
    if (role === 'vice_director') {
      return false
    }
    return requireManagerApproval
  }

  // 직급별 객체인 경우 해당 직급의 설정을 확인
  if (role === 'vice_director') {
    return requireManagerApproval.vice_director ?? false
  }
  if (role === 'team_leader') {
    return requireManagerApproval.team_leader ?? true
  }
  if (role === 'staff') {
    return requireManagerApproval.staff ?? true
  }

  // 그 외 직급은 기본값 true
  return true
}

/**
 * 직급에 따른 승인 프로세스 결정
 * - 실장: 원장에게 직접 승인 (고정)
 * - 부원장/팀장/직원: 정책에 따라 직급별로 실장 승인 포함 또는 원장 직접 승인
 * @param role 신청자 직급
 * @param requireManagerApproval 실장 결재 포함 여부 (boolean 또는 직급별 객체)
 */
export function getApprovalStepsForRole(
  role: string,
  requireManagerApproval: boolean | ManagerApprovalByRank = true
): { step: number; role: string; description: string }[] {
  // 실장은 원장에게 직접 승인 (실장이 자기 자신을 승인할 수 없음)
  if (role === 'manager') {
    return [
      { step: 1, role: 'owner', description: '원장 승인' }
    ]
  }

  // 부원장, 팀장, 직원: 직급별 설정에 따라 결정
  const needsManagerApproval = shouldRequireManagerApproval(role, requireManagerApproval)

  if (needsManagerApproval) {
    // 실장 결재 포함: 실장 -> 원장 2단계
    return [
      { step: 1, role: 'manager', description: '실장 1차 승인' },
      { step: 2, role: 'owner', description: '원장 최종 승인' }
    ]
  } else {
    // 실장 결재 미포함: 원장 직접 승인
    return [
      { step: 1, role: 'owner', description: '원장 승인' }
    ]
  }
}

/**
 * 병원 근무일 정보 조회
 */
export async function getClinicWorkingDays(): Promise<{ data: number[]; error: string | null }> {
  try {
    const supabase = await ensureConnection()
    if (!supabase) throw new Error('Database connection failed')

    const clinicId = getCurrentClinicId()
    if (!clinicId) throw new Error('Clinic not found')

    const { data, error } = await (supabase as any)
      .from('clinic_hours')
      .select('day_of_week, is_open')
      .eq('clinic_id', clinicId)

    if (error) throw error

    // is_open이 true인 요일만 반환 (0=일요일, 1=월요일, ..., 6=토요일)
    const workingDays = (data || [])
      .filter((d: any) => d.is_open)
      .map((d: any) => d.day_of_week)

    return { data: workingDays, error: null }
  } catch (error) {
    console.error('[leaveService.getClinicWorkingDays] Error:', error)
    return { data: [], error: extractErrorMessage(error) }
  }
}

/**
 * 병원 근무일 기준 연차 일수 계산
 * @param startDate 시작일
 * @param endDate 종료일
 * @param workingDays 병원 근무 요일 배열 (0=일요일, 1=월요일, ..., 6=토요일)
 */
export function calculateWorkingDaysBetween(
  startDate: Date,
  endDate: Date,
  workingDays: number[]
): number {
  if (endDate < startDate) return 0

  let days = 0
  const current = new Date(startDate)

  while (current <= endDate) {
    const dayOfWeek = current.getDay()
    if (workingDays.includes(dayOfWeek)) {
      days++
    }
    current.setDate(current.getDate() + 1)
  }

  return days
}

export const leaveService = {
  // ============================================
  // 연차 정책 관련
  // ============================================

  /**
   * 클리닉의 기본 연차 정책 조회
   */
  async getDefaultPolicy(): Promise<{ data: LeavePolicy | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const { data, error } = await (supabase as any)
        .from('leave_policies')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .eq('is_default', true)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return { data, error: null }
    } catch (error) {
      console.error('[leaveService.getDefaultPolicy] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 연차 정책 생성/업데이트
   */
  async upsertPolicy(policy: Partial<LeavePolicy>): Promise<{ data: LeavePolicy | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      const userId = getCurrentUserId()
      if (!clinicId) throw new Error('Clinic not found')

      const policyData = {
        ...policy,
        clinic_id: clinicId,
        created_by: policy.id ? undefined : userId,
        updated_at: new Date().toISOString(),
      }

      let result
      if (policy.id) {
        result = await (supabase as any)
          .from('leave_policies')
          .update(policyData)
          .eq('id', policy.id)
          .select()
          .single()
      } else {
        result = await (supabase as any)
          .from('leave_policies')
          .insert(policyData)
          .select()
          .single()
      }

      if (result.error) throw result.error

      return { data: result.data, error: null }
    } catch (error) {
      console.error('[leaveService.upsertPolicy] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  // ============================================
  // 연차 종류 관련
  // ============================================

  /**
   * 연차 종류 목록 조회
   */
  async getLeaveTypes(): Promise<{ data: LeaveType[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const { data, error } = await (supabase as any)
        .from('leave_types')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error) {
      console.error('[leaveService.getLeaveTypes] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  /**
   * 기본 연차 종류 생성 (클리닉 초기 설정용)
   */
  async createDefaultLeaveTypes(): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      // 이미 존재하는지 확인
      const { data: existing } = await (supabase as any)
        .from('leave_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .limit(1)

      if (existing && existing.length > 0) {
        return { success: true, error: null } // 이미 존재함
      }

      const defaultTypes = [
        { name: '연차', code: 'annual', description: '일반 연차 휴가', is_paid: true, deduct_from_annual: true, deduct_days: 1.0, color: '#3B82F6', display_order: 1 },
        { name: '반차', code: 'half_day', description: '반일 연차 (오전/오후)', is_paid: true, deduct_from_annual: true, deduct_days: 0.5, color: '#10B981', display_order: 2 },
        { name: '병가', code: 'sick', description: '질병으로 인한 휴가', is_paid: true, deduct_from_annual: true, deduct_days: 1.0, requires_proof: true, proof_description: '진단서 또는 소견서', color: '#F59E0B', display_order: 3 },
        { name: '경조사', code: 'family_event', description: '경조사 휴가 (결혼, 상 등)', is_paid: true, deduct_from_annual: false, deduct_days: 1.0, requires_proof: true, proof_description: '청첩장, 부고 등', color: '#8B5CF6', display_order: 4 },
        { name: '대체휴가', code: 'compensatory', description: '휴일 근무 대체 휴가', is_paid: true, deduct_from_annual: false, deduct_days: 1.0, color: '#06B6D4', display_order: 5 },
        { name: '무급휴가', code: 'unpaid', description: '무급 개인 사유 휴가', is_paid: false, deduct_from_annual: false, deduct_days: 1.0, color: '#6B7280', display_order: 6 },
      ]

      const typesWithClinic = defaultTypes.map(t => ({ ...t, clinic_id: clinicId }))

      const { error } = await (supabase as any)
        .from('leave_types')
        .insert(typesWithClinic)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.createDefaultLeaveTypes] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // ============================================
  // 연차 잔여 조회
  // ============================================

  /**
   * 특정 직원의 연차 잔여 조회
   * - 항상 최신 데이터로 재계산하여 반환
   */
  async getEmployeeBalance(userId: string, year: number = new Date().getFullYear()): Promise<{ data: EmployeeLeaveBalance | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      // 항상 최신 상태로 재계산
      await this.initializeBalance(userId, year)

      // 재계산된 결과 조회
      const { data: balance, error } = await (supabase as any)
        .from('employee_leave_balances')
        .select('*')
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('year', year)
        .single()

      if (error && error.code !== 'PGRST116') throw error

      return { data: balance, error: null }
    } catch (error) {
      console.error('[leaveService.getEmployeeBalance] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 본인의 연차 잔여 조회
   */
  async getMyBalance(year: number = new Date().getFullYear()): Promise<{ data: EmployeeLeaveBalance | null; error: string | null }> {
    const userId = getCurrentUserId()
    if (!userId) return { data: null, error: 'User not found' }
    return this.getEmployeeBalance(userId, year)
  },

  /**
   * 전체 직원의 연차 현황 조회
   * - 모든 직원의 연차를 최신 상태로 재계산하여 반환 (입사일 기준 연차 기간)
   * - 종류별 사용/예정 일수도 함께 반환
   * - 각 직원별 현재 연차 기간 데이터만 조회 (중복 방지)
   */
  async getAllEmployeeBalances(year: number = new Date().getFullYear()): Promise<{ data: (EmployeeLeaveBalance & { user_name?: string; user_role?: string; used_by_type?: Record<string, number>; pending_by_type?: Record<string, number> })[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      // 모든 활성 직원 조회 (입사일 포함)
      const { data: allUsers, error: usersError } = await (supabase as any)
        .from('users')
        .select('id, name, role, hire_date, created_at')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')

      if (usersError) throw usersError

      if (!allUsers || allUsers.length === 0) {
        return { data: [], error: null }
      }

      // 각 직원의 현재 연차 기간 year 계산
      const userPeriodYears: Record<string, number> = {}
      for (const user of allUsers) {
        const hireDate = user.hire_date ? new Date(user.hire_date) : new Date(user.created_at)
        const leavePeriod = calculateLeavePeriod(hireDate)
        userPeriodYears[user.id] = new Date(leavePeriod.startDate).getFullYear()
      }

      // 모든 직원의 연차 재계산 (입사일 기준)
      await Promise.all(allUsers.map((user: any) => this.initializeBalance(user.id, year)))

      const today = new Date().toISOString().split('T')[0]

      // 각 직원별로 현재 연차 기간 데이터만 조회
      const result = await Promise.all(allUsers.map(async (user: any) => {
        const periodYear = userPeriodYears[user.id]
        const hireDate = user.hire_date ? new Date(user.hire_date) : new Date(user.created_at)
        const leavePeriod = calculateLeavePeriod(hireDate)

        // 해당 직원의 현재 연차 기간 balance 조회
        const { data: balance } = await (supabase as any)
          .from('employee_leave_balances')
          .select('*')
          .eq('user_id', user.id)
          .eq('clinic_id', clinicId)
          .eq('year', periodYear)
          .single()

        if (!balance) return null

        // 해당 직원의 승인된 연차 내역 조회 (입사일 기준 연차 기간 내)
        const { data: approvedRequests } = await (supabase as any)
          .from('leave_requests')
          .select('total_days, start_date, leave_types!inner(code, name, deduct_from_annual)')
          .eq('user_id', user.id)
          .eq('status', 'approved')
          .gte('start_date', leavePeriod.startDate)
          .lte('start_date', leavePeriod.endDate)

        // 종류별 사용 완료 일수 (오늘 이전 시작)
        const usedByType: Record<string, number> = {}
        // 종류별 사용 예정 일수 (오늘 이후 시작)
        const pendingByType: Record<string, number> = {}

        for (const req of (approvedRequests || [])) {
          const typeCode = req.leave_types?.code || 'unknown'
          const days = req.total_days || 0

          if (req.start_date <= today) {
            // 사용 완료
            usedByType[typeCode] = (usedByType[typeCode] || 0) + days
          } else {
            // 사용 예정
            pendingByType[typeCode] = (pendingByType[typeCode] || 0) + days
          }
        }

        return {
          ...balance,
          user_name: user.name,
          user_role: user.role,
          used_by_type: usedByType,
          pending_by_type: pendingByType,
          leave_period_start: leavePeriod.startDate,
          leave_period_end: leavePeriod.endDate,
        }
      }))

      // null 제거 및 잔여 연차 내림차순 정렬
      const filteredResult = result
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((a, b) => b.remaining_days - a.remaining_days)

      return { data: filteredResult, error: null }
    } catch (error) {
      console.error('[leaveService.getAllEmployeeBalances] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  /**
   * 연차 잔여 수동 초기화/계산
   * - 입사일 기준 연차 기간으로 계산 (1월 1일~12월 31일 기준이 아님)
   * - year 파라미터는 DB 저장용으로 사용 (현재 연차 기간의 시작 연도)
   */
  async initializeBalance(userId: string, year: number = new Date().getFullYear()): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      // 사용자 입사일 조회
      const { data: user, error: userError } = await (supabase as any)
        .from('users')
        .select('id, hire_date, created_at')
        .eq('id', userId)
        .single()

      if (userError) throw userError

      const hireDate = user.hire_date ? new Date(user.hire_date) : new Date(user.created_at)
      const yearsOfService = calculateYearsOfService(hireDate)

      // 입사일 기준 현재 연차 기간 계산
      const leavePeriod = calculateLeavePeriod(hireDate)
      const periodStartDate = leavePeriod.startDate
      const periodEndDate = leavePeriod.endDate
      const periodYear = new Date(periodStartDate).getFullYear() // DB 저장용 연도

      // 1년 미만 직원의 경우 월별 무급휴가 사용 여부 확인하여 연차 계산
      let totalDays: number
      if (yearsOfService < 1) {
        // 무급휴가 타입 조회
        const { data: unpaidTypeForCalc } = await (supabase as any)
          .from('leave_types')
          .select('id')
          .eq('clinic_id', clinicId)
          .eq('code', 'unpaid')
          .single()

        // 월별 무급휴가 사용 기록 조회
        let unpaidLeaveByMonth: Record<string, number> = {}
        if (unpaidTypeForCalc) {
          const { data: unpaidRequests } = await (supabase as any)
            .from('leave_requests')
            .select('total_days, start_date')
            .eq('user_id', userId)
            .eq('leave_type_id', unpaidTypeForCalc.id)
            .eq('status', 'approved')
            .gte('start_date', periodStartDate)
            .lte('start_date', periodEndDate)

          // 월별로 무급휴가 일수 집계
          for (const req of (unpaidRequests || [])) {
            const startDate = new Date(req.start_date)
            const monthKey = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
            unpaidLeaveByMonth[monthKey] = (unpaidLeaveByMonth[monthKey] || 0) + (req.total_days || 0)
          }
        }

        totalDays = calculateAnnualLeaveDaysWithUnpaidCheck(hireDate, new Date(), unpaidLeaveByMonth)
      } else {
        totalDays = calculateAnnualLeaveDays(hireDate)
      }

      // 이미 승인된 연차 조회 (연차 기간 내, 오늘 이전에 시작된 것만 사용으로 처리)
      const today = new Date().toISOString().split('T')[0]
      const { data: approved } = await (supabase as any)
        .from('leave_requests')
        .select('total_days, leave_types!inner(deduct_from_annual)')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .gte('start_date', periodStartDate)
        .lte('start_date', periodEndDate)
        .lte('start_date', today)  // 오늘 이전에 시작된 연차만 사용으로

      const usedDays = (approved || [])
        .filter((r: any) => r.leave_types?.deduct_from_annual)
        .reduce((sum: number, r: any) => sum + r.total_days, 0)

      // 수동 조정 연차 조회 (연차 기간 시작 연도 기준)
      const { data: adjustments } = await (supabase as any)
        .from('leave_adjustments')
        .select('adjustment_type, days')
        .eq('user_id', userId)
        .eq('year', periodYear)

      // 추가된 연차 (total_days에 더함)
      const addedDays = (adjustments || []).reduce((sum: number, adj: any) => {
        if (adj.adjustment_type === 'add') return sum + adj.days
        return sum
      }, 0)

      // 차감된 연차 (used_days에 더함)
      const deductedDays = (adjustments || []).reduce((sum: number, adj: any) => {
        if (adj.adjustment_type === 'deduct') return sum + adj.days
        return sum
      }, 0)

      // 승인됐지만 아직 시작 날짜가 지나지 않은 연차 (사용 예정으로 표시)
      // 주의: 승인 대기(status='pending')는 대기에 포함하지 않음
      const { data: approvedFuture } = await (supabase as any)
        .from('leave_requests')
        .select('total_days, leave_types!inner(deduct_from_annual)')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .gte('start_date', periodStartDate)
        .lte('start_date', periodEndDate)
        .gt('start_date', today)  // 오늘 이후에 시작되는 연차

      const pendingDays = (approvedFuture || [])
        .filter((r: any) => r.leave_types?.deduct_from_annual)
        .reduce((sum: number, r: any) => sum + r.total_days, 0)

      // 경조사 타입 조회
      const { data: familyEventType } = await (supabase as any)
        .from('leave_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('code', 'family_event')
        .single()

      // 승인된 경조사 일수 조회 (연차 기간 내 전체)
      let familyEventDays = 0
      if (familyEventType) {
        const { data: familyEventRequests } = await (supabase as any)
          .from('leave_requests')
          .select('total_days')
          .eq('user_id', userId)
          .eq('leave_type_id', familyEventType.id)
          .eq('status', 'approved')
          .gte('start_date', periodStartDate)
          .lte('start_date', periodEndDate)

        familyEventDays = (familyEventRequests || []).reduce((sum: number, r: any) => sum + r.total_days, 0)
      }

      // 무급휴가 타입 조회
      const { data: unpaidType } = await (supabase as any)
        .from('leave_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('code', 'unpaid')
        .single()

      // 승인된 무급휴가 일수 조회 (연차 기간 내 전체 - 현황 표시용)
      let unpaidTotalDays = 0
      // 미래 무급휴가 (remaining_days 계산용)
      let unpaidFutureDays = 0
      if (unpaidType) {
        // 연차 기간 내 전체 승인된 무급휴가
        const { data: unpaidRequests } = await (supabase as any)
          .from('leave_requests')
          .select('total_days, start_date')
          .eq('user_id', userId)
          .eq('leave_type_id', unpaidType.id)
          .eq('status', 'approved')
          .gte('start_date', periodStartDate)
          .lte('start_date', periodEndDate)

        unpaidTotalDays = (unpaidRequests || []).reduce((sum: number, r: any) => sum + r.total_days, 0)
        // 오늘 이후의 무급휴가만 remaining_days에서 차감
        unpaidFutureDays = (unpaidRequests || [])
          .filter((r: any) => r.start_date >= today)
          .reduce((sum: number, r: any) => sum + r.total_days, 0)
      }

      // 총 연차 = 기본 연차 + 추가된 연차
      const finalTotalDays = totalDays + addedDays
      // 잔여 연차 = 총 연차 - 사용 - 차감 - 대기 - 미래 무급휴가 (음수 가능)
      const remainingDays = finalTotalDays - usedDays - deductedDays - pendingDays - unpaidFutureDays

      // Upsert (연차 기간 시작 연도 기준으로 저장)
      const { error } = await (supabase as any)
        .from('employee_leave_balances')
        .upsert({
          user_id: userId,
          clinic_id: clinicId,
          year: periodYear,
          total_days: finalTotalDays,
          used_days: usedDays + deductedDays,
          pending_days: pendingDays,
          remaining_days: remainingDays,
          family_event_days: familyEventDays,  // 경조사 사용 일수
          unpaid_days: unpaidTotalDays,        // 무급휴가 사용 일수
          years_of_service: yearsOfService,
          hire_date: hireDate.toISOString().split('T')[0],
          leave_period_start: periodStartDate, // 연차 기간 시작일
          leave_period_end: periodEndDate,     // 연차 기간 종료일
          last_calculated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,year'
        })

      if (error) throw error

      // 연차가 증가했을 때 전환 가능한 무급휴가를 연차로 자동 전환
      await this.convertUnpaidToAnnual(userId, periodYear)

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.initializeBalance] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 전환 가능한 무급휴가를 연차로 자동 전환
   * 연차 부족으로 무급휴가로 신청했다가, 나중에 연차가 증가하면 자동으로 유급휴가로 전환
   */
  async convertUnpaidToAnnual(userId: string, year: number): Promise<{ converted: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      // 현재 잔여 연차 조회
      const { data: balance } = await (supabase as any)
        .from('employee_leave_balances')
        .select('remaining_days')
        .eq('user_id', userId)
        .eq('year', year)
        .single()

      const remainingDays = balance?.remaining_days ?? 0

      // 잔여 연차가 없으면 전환할 수 없음
      if (remainingDays <= 0) {
        return { converted: 0, error: null }
      }

      // 무급휴가 타입 조회
      const { data: unpaidType } = await (supabase as any)
        .from('leave_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('code', 'unpaid')
        .single()

      if (!unpaidType) {
        return { converted: 0, error: null }
      }

      // 연차 타입 조회
      const { data: annualType } = await (supabase as any)
        .from('leave_types')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('code', 'annual')
        .single()

      if (!annualType) {
        return { converted: 0, error: null }
      }

      // 전환 가능한 무급휴가 조회 (reason에 [CONVERTIBLE] 태그가 있는 것)
      const { data: convertibleRequests } = await (supabase as any)
        .from('leave_requests')
        .select('id, total_days, reason')
        .eq('user_id', userId)
        .eq('leave_type_id', unpaidType.id)
        .eq('status', 'approved')
        .gte('start_date', `${year}-01-01`)
        .lte('start_date', `${year}-12-31`)
        .like('reason', '%[CONVERTIBLE]%')
        .order('start_date', { ascending: true })

      if (!convertibleRequests || convertibleRequests.length === 0) {
        return { converted: 0, error: null }
      }

      let availableDays = remainingDays
      let totalConverted = 0

      // 무급휴가를 연차로 전환
      for (const request of convertibleRequests) {
        if (availableDays <= 0) break

        const daysToConvert = Math.min(request.total_days, availableDays)

        if (daysToConvert >= request.total_days) {
          // 전체 전환: 무급휴가를 연차로 변경
          await (supabase as any)
            .from('leave_requests')
            .update({
              leave_type_id: annualType.id,
              reason: request.reason.replace('[CONVERTIBLE]', '[CONVERTED]'),
              updated_at: new Date().toISOString(),
            })
            .eq('id', request.id)

          totalConverted += request.total_days
          availableDays -= request.total_days
        } else {
          // 부분 전환: 원본 무급휴가 일수 감소, 새로운 연차 신청 생성
          // 구현 복잡도를 위해 전체 전환만 지원
          // 부분 전환이 필요한 경우 건너뜀
          continue
        }
      }

      return { converted: totalConverted, error: null }
    } catch (error) {
      console.error('[leaveService.convertUnpaidToAnnual] Error:', error)
      return { converted: 0, error: extractErrorMessage(error) }
    }
  },

  // ============================================
  // 연차 신청
  // ============================================

  /**
   * 연차 신청
   */
  async createRequest(input: LeaveRequestInput): Promise<{ data: LeaveRequest | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      // 정책 조회하여 실장 결재 포함 여부 확인
      const policyResult = await this.getDefaultPolicy()
      const requireManagerApproval = policyResult.data?.require_manager_approval ?? true

      // 직급에 따른 승인 단계 결정
      const approvalSteps = getApprovalStepsForRole(user.role, requireManagerApproval)

      const requestData = {
        user_id: user.id,
        clinic_id: user.clinic_id,
        leave_type_id: input.leave_type_id,
        start_date: input.start_date,
        end_date: input.end_date,
        half_day_type: input.half_day_type || null,
        total_days: input.total_days,
        reason: input.reason || null,
        proof_file_url: input.proof_file_url || null,
        emergency: input.emergency || false,
        status: 'pending',
        current_step: 1,
        total_steps: approvalSteps.length,
        submitted_at: new Date().toISOString(),
      }

      const { data, error } = await (supabase as any)
        .from('leave_requests')
        .insert(requestData)
        .select()
        .single()

      if (error) throw error

      // 알림 생성: 현재 단계의 결재자에게 알림 전송
      try {
        const currentStepRole = approvalSteps[0]?.role // 첫 번째 단계 역할
        if (currentStepRole && data) {
          // 해당 역할의 사용자들 조회
          const { data: approvers } = await (supabase as any)
            .from('users')
            .select('id')
            .eq('clinic_id', user.clinic_id)
            .eq('role', currentStepRole)
            .eq('status', 'active')

          if (approvers && approvers.length > 0) {
            const approverIds = approvers.map((a: any) => a.id)
            await userNotificationService.notifyLeaveApprovalPending(
              approverIds,
              user.name || '직원',
              input.start_date,
              input.end_date,
              data.id
            )
          }
        }
      } catch (notifyError) {
        console.error('[leaveService.createRequest] Notification error:', notifyError)
        // 알림 실패해도 연차 신청은 성공으로 처리
      }

      return { data, error: null }
    } catch (error) {
      console.error('[leaveService.createRequest] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 연차 신청 취소
   */
  async cancelRequest(requestId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { error } = await (supabase as any)
        .from('leave_requests')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .eq('user_id', userId)
        .eq('status', 'pending')

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.cancelRequest] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 본인 연차 신청 목록 조회
   */
  async getMyRequests(year?: number): Promise<{ data: any[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      let query = (supabase as any)
        .from('leave_requests')
        .select(`
          *,
          leave_types (name, code, color),
          leave_approvals (*)
        `)
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false })

      if (year) {
        query = query
          .gte('start_date', `${year}-01-01`)
          .lte('start_date', `${year}-12-31`)
      }

      const { data, error } = await query

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error) {
      console.error('[leaveService.getMyRequests] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  // ============================================
  // 연차 승인
  // ============================================

  /**
   * 승인 대기 목록 조회 (승인자 기준)
   */
  async getPendingApprovals(): Promise<{ data: any[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      // 정책 조회하여 실장 결재 포함 여부 확인
      const policyResult = await this.getDefaultPolicy()
      const requireManagerApproval = policyResult.data?.require_manager_approval ?? true

      // 내 역할에 따라 승인해야 할 요청 조회
      // owner: 모든 pending 요청 (current_step이 자신의 단계일 때)
      // manager: 1단계 승인 대기인 요청 중 신청자가 team_leader 또는 staff인 것 (실장 결재 포함 시)

      let query = (supabase as any)
        .from('leave_requests')
        .select(`
          *,
          users:user_id (id, name, role, email),
          leave_types (name, code, color)
        `)
        .eq('clinic_id', user.clinic_id)
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true })

      const { data, error } = await query

      if (error) throw error

      // 현재 사용자 역할에 따라 필터링
      const filtered = (data || []).filter((req: any) => {
        const applicantRole = req.users?.role
        const steps = getApprovalStepsForRole(applicantRole, requireManagerApproval)
        const currentStepInfo = steps[req.current_step - 1]

        // 현재 단계의 승인자 역할이 내 역할과 일치하는지 확인
        if (user.role === 'owner') {
          // 원장은 마지막 단계 또는 부원장 요청 승인
          return currentStepInfo?.role === 'owner'
        }
        if (user.role === 'manager') {
          // 실장은 1단계 승인 (팀장, 직원 요청) - 실장 결재 포함 시에만
          return currentStepInfo?.role === 'manager'
        }
        return false
      })

      return { data: filtered, error: null }
    } catch (error) {
      console.error('[leaveService.getPendingApprovals] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  /**
   * 연차 승인
   */
  async approveRequest(requestId: string, comment?: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      // 정책 조회하여 실장 결재 포함 여부 확인
      const policyResult = await this.getDefaultPolicy()
      const requireManagerApproval = policyResult.data?.require_manager_approval ?? true

      // 현재 요청 정보 조회
      const { data: request, error: reqError } = await (supabase as any)
        .from('leave_requests')
        .select('*, users:user_id (id, role, name)')
        .eq('id', requestId)
        .single()

      if (reqError) throw reqError

      const applicantRole = request.users?.role
      const applicantId = request.users?.id
      const applicantName = request.users?.name
      const steps = getApprovalStepsForRole(applicantRole, requireManagerApproval)
      const currentStep = request.current_step
      const isLastStep = currentStep >= steps.length

      // 승인 기록 추가
      const { error: approvalError } = await (supabase as any)
        .from('leave_approvals')
        .insert({
          leave_request_id: requestId,
          step_number: currentStep,
          step_name: steps[currentStep - 1]?.description,
          approver_id: user.id,
          approver_role: user.role,
          approver_name: '', // 별도 조회 필요시 추가
          action: isLastStep ? 'approved' : 'forwarded',
          comment: comment || null,
          acted_at: new Date().toISOString(),
        })

      if (approvalError) throw approvalError

      // 요청 상태 업데이트
      const updateData = isLastStep
        ? {
          status: 'approved' as LeaveRequestStatus,
          current_step: currentStep,
          final_approver_id: user.id,
          final_decision_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        : {
          current_step: currentStep + 1,
          updated_at: new Date().toISOString(),
        }

      const { error: updateError } = await (supabase as any)
        .from('leave_requests')
        .update(updateData)
        .eq('id', requestId)

      if (updateError) throw updateError

      // 알림 생성
      try {
        if (isLastStep) {
          // 최종 승인: 신청자에게 승인 알림
          await userNotificationService.notifyLeaveApproved(
            applicantId,
            request.start_date,
            request.end_date,
            requestId
          )
        } else {
          // 다음 단계로 전달: 신청자에게 진행 알림 + 다음 결재자에게 승인 요청 알림
          const nextStepRole = steps[currentStep]?.role
          const nextStepDesc = steps[currentStep]?.description

          // 신청자에게 진행 알림
          await userNotificationService.notifyLeaveForwarded(
            applicantId,
            request.start_date,
            request.end_date,
            requestId,
            nextStepDesc || '다음 단계'
          )

          // 다음 결재자에게 승인 요청 알림
          if (nextStepRole) {
            const { data: nextApprovers } = await (supabase as any)
              .from('users')
              .select('id')
              .eq('clinic_id', user.clinic_id)
              .eq('role', nextStepRole)
              .eq('status', 'active')

            if (nextApprovers && nextApprovers.length > 0) {
              const approverIds = nextApprovers.map((a: any) => a.id)
              await userNotificationService.notifyLeaveApprovalPending(
                approverIds,
                applicantName || '직원',
                request.start_date,
                request.end_date,
                requestId
              )
            }
          }
        }
      } catch (notifyError) {
        console.error('[leaveService.approveRequest] Notification error:', notifyError)
      }

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.approveRequest] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 연차 반려
   */
  async rejectRequest(requestId: string, reason: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      // 정책 조회하여 실장 결재 포함 여부 확인
      const policyResult = await this.getDefaultPolicy()
      const requireManagerApproval = policyResult.data?.require_manager_approval ?? true

      // 현재 요청 정보 조회
      const { data: request, error: reqError } = await (supabase as any)
        .from('leave_requests')
        .select('*, users:user_id (id, role)')
        .eq('id', requestId)
        .single()

      if (reqError) throw reqError

      const applicantRole = request.users?.role
      const applicantId = request.users?.id
      const steps = getApprovalStepsForRole(applicantRole, requireManagerApproval)

      // 반려 기록 추가
      const { error: approvalError } = await (supabase as any)
        .from('leave_approvals')
        .insert({
          leave_request_id: requestId,
          step_number: request.current_step,
          step_name: steps[request.current_step - 1]?.description,
          approver_id: user.id,
          approver_role: user.role,
          approver_name: '',
          action: 'rejected',
          comment: reason,
          acted_at: new Date().toISOString(),
        })

      if (approvalError) throw approvalError

      // 요청 상태 업데이트
      const { error: updateError } = await (supabase as any)
        .from('leave_requests')
        .update({
          status: 'rejected' as LeaveRequestStatus,
          rejection_reason: reason,
          final_approver_id: user.id,
          final_decision_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)

      if (updateError) throw updateError

      // 알림 생성: 신청자에게 반려 알림
      try {
        await userNotificationService.notifyLeaveRejected(
          applicantId,
          request.start_date,
          request.end_date,
          requestId,
          reason
        )
      } catch (notifyError) {
        console.error('[leaveService.rejectRequest] Notification error:', notifyError)
      }

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.rejectRequest] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // ============================================
  // 연차 수동 조정 (이미 소진한 연차 입력)
  // ============================================

  /**
   * 연차 수동 조정 (원장/실장용)
   */
  async addAdjustment(input: {
    user_id: string
    adjustment_type: 'deduct' | 'add' | 'set'
    days: number
    year: number
    reason: string
    leave_type_id?: string
    use_date?: string
  }): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      // 권한 확인 (원장/실장만)
      if (user.role !== 'owner' && user.role !== 'manager') {
        throw new Error('권한이 없습니다.')
      }

      const { error } = await (supabase as any)
        .from('leave_adjustments')
        .insert({
          user_id: input.user_id,
          clinic_id: user.clinic_id,
          adjustment_type: input.adjustment_type,
          days: input.days,
          year: input.year,
          reason: input.reason,
          leave_type_id: input.leave_type_id || null,
          use_date: input.use_date || null,
          adjusted_by: user.id,
          adjusted_at: new Date().toISOString(),
        })

      if (error) throw error

      // 연차 조정 후 잔여 연차 즉시 재계산
      await this.initializeBalance(input.user_id, input.year)

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.addAdjustment] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 연차 조정 내역 조회
   */
  async getAdjustments(userId: string, year: number): Promise<{ data: any[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const { data, error } = await (supabase as any)
        .from('leave_adjustments')
        .select(`
          *,
          leave_types (name, code),
          adjusted_by_user:adjusted_by (name)
        `)
        .eq('user_id', userId)
        .eq('clinic_id', clinicId)
        .eq('year', year)
        .order('adjusted_at', { ascending: false })

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error) {
      console.error('[leaveService.getAdjustments] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  /**
   * 조정 삭제
   */
  async deleteAdjustment(adjustmentId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      // 삭제 전 조정 정보 조회 (user_id, year 필요)
      const { data: adjustment, error: fetchError } = await (supabase as any)
        .from('leave_adjustments')
        .select('user_id, year')
        .eq('id', adjustmentId)
        .single()

      if (fetchError) throw fetchError

      const { error } = await (supabase as any)
        .from('leave_adjustments')
        .delete()
        .eq('id', adjustmentId)
        .eq('adjusted_by', user.id)

      if (error) throw error

      // 조정 삭제 후 잔여 연차 즉시 재계산
      if (adjustment) {
        await this.initializeBalance(adjustment.user_id, adjustment.year)
      }

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.deleteAdjustment] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // ============================================
  // 전체 연차 현황 조회
  // ============================================

  /**
   * 전체 연차 신청 목록 조회 (관리자용)
   */
  async getAllRequests(filters?: {
    year?: number
    status?: LeaveRequestStatus
    userId?: string
  }): Promise<{ data: any[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      let query = (supabase as any)
        .from('leave_requests')
        .select(`
          *,
          users:user_id (id, name, role, email),
          leave_types (name, code, color),
          leave_approvals (*)
        `)
        .eq('clinic_id', clinicId)
        .order('submitted_at', { ascending: false })

      if (filters?.year) {
        query = query
          .gte('start_date', `${filters.year}-01-01`)
          .lte('start_date', `${filters.year}-12-31`)
      }

      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      if (filters?.userId) {
        query = query.eq('user_id', filters.userId)
      }

      const { data, error } = await query

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error) {
      console.error('[leaveService.getAllRequests] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  /**
   * 직원 목록 조회 (연차 관리용)
   */
  async getStaffList(): Promise<{ data: any[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const { data, error } = await (supabase as any)
        .from('users')
        .select('id, name, role, hire_date, status')
        .eq('clinic_id', clinicId)
        .eq('status', 'active')
        .order('name', { ascending: true })

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error) {
      console.error('[leaveService.getStaffList] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  // ============================================
  // 병원 휴무일 관리 (여름휴가, 겨울휴가 등)
  // ============================================

  /**
   * 병원 휴무일 목록 조회
   */
  async getClinicHolidays(year?: number): Promise<{ data: any[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      let query = (supabase as any)
        .from('clinic_holidays')
        .select(`
          *,
          created_by_user:created_by (name),
          applied_by_user:applied_by (name)
        `)
        .eq('clinic_id', clinicId)
        .order('start_date', { ascending: false })

      if (year) {
        query = query.gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`)
      }

      const { data, error } = await query

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error) {
      console.error('[leaveService.getClinicHolidays] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },

  /**
   * 병원 휴무일 생성
   */
  async createClinicHoliday(input: {
    holiday_name: string
    holiday_type: 'company' | 'public' | 'special'
    start_date: string
    end_date: string
    deduct_from_annual: boolean
    deduct_days?: number
    apply_to_all: boolean
    excluded_roles?: string[]
    description?: string
  }): Promise<{ data: any; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      // 원장만 휴무일 생성 가능
      if (user.role !== 'owner') {
        throw new Error('원장만 휴무일을 등록할 수 있습니다.')
      }

      // 총 휴무일 계산 (주말 제외)
      const totalDays = calculateWorkingDays(new Date(input.start_date), new Date(input.end_date))

      const { data, error } = await (supabase as any)
        .from('clinic_holidays')
        .insert({
          clinic_id: user.clinic_id,
          holiday_name: input.holiday_name,
          holiday_type: input.holiday_type,
          start_date: input.start_date,
          end_date: input.end_date,
          total_days: totalDays,
          deduct_from_annual: input.deduct_from_annual,
          deduct_days: input.deduct_days ?? totalDays,
          apply_to_all: input.apply_to_all,
          excluded_roles: input.excluded_roles || [],
          description: input.description || null,
          created_by: user.id,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[leaveService.createClinicHoliday] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 병원 휴무일 삭제
   */
  async deleteClinicHoliday(holidayId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      if (user.role !== 'owner') {
        throw new Error('원장만 휴무일을 삭제할 수 있습니다.')
      }

      // 이미 적용된 휴무일인지 확인
      const { data: holiday } = await (supabase as any)
        .from('clinic_holidays')
        .select('is_applied')
        .eq('id', holidayId)
        .single()

      if (holiday?.is_applied) {
        throw new Error('이미 연차에 적용된 휴무일은 삭제할 수 없습니다.')
      }

      const { error } = await (supabase as any)
        .from('clinic_holidays')
        .delete()
        .eq('id', holidayId)
        .eq('clinic_id', user.clinic_id)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[leaveService.deleteClinicHoliday] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 병원 휴무일을 직원 연차에 일괄 적용
   */
  async applyHolidayToLeave(holidayId: string): Promise<{ success: boolean; appliedCount: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const user = getCurrentUser()
      if (!user) throw new Error('User not found')

      if (user.role !== 'owner') {
        throw new Error('원장만 휴무일을 적용할 수 있습니다.')
      }

      // 휴무일 정보 조회
      const { data: holiday, error: holidayError } = await (supabase as any)
        .from('clinic_holidays')
        .select('*')
        .eq('id', holidayId)
        .single()

      if (holidayError) throw holidayError

      if (holiday.is_applied) {
        throw new Error('이미 적용된 휴무일입니다.')
      }

      if (!holiday.deduct_from_annual) {
        throw new Error('연차 차감 대상이 아닌 휴무일입니다.')
      }

      // 적용 대상 직원 조회
      let staffQuery = (supabase as any)
        .from('users')
        .select('id, name, role')
        .eq('clinic_id', user.clinic_id)
        .eq('status', 'active')

      const { data: staffList, error: staffError } = await staffQuery

      if (staffError) throw staffError

      // 제외 역할 필터링
      const excludedRoles = holiday.excluded_roles || []
      const targetStaff = (staffList || []).filter(
        (s: any) => !excludedRoles.includes(s.role) && !(holiday.excluded_user_ids || []).includes(s.id)
      )

      const deductDays = holiday.deduct_days ?? holiday.total_days
      const year = new Date(holiday.start_date).getFullYear()
      let appliedCount = 0

      // 각 직원에게 연차 차감 적용
      for (const staff of targetStaff) {
        // 연차 조정 추가
        const { data: adjustment, error: adjError } = await (supabase as any)
          .from('leave_adjustments')
          .insert({
            user_id: staff.id,
            clinic_id: user.clinic_id,
            adjustment_type: 'deduct',
            days: deductDays,
            year,
            reason: `[병원휴무] ${holiday.holiday_name} (${holiday.start_date} ~ ${holiday.end_date})`,
            use_date: holiday.start_date,
            adjusted_by: user.id,
          })
          .select()
          .single()

        if (adjError) {
          console.error(`Error applying to ${staff.name}:`, adjError)
          continue
        }

        // 적용 기록 저장
        await (supabase as any)
          .from('holiday_leave_applications')
          .insert({
            clinic_holiday_id: holidayId,
            user_id: staff.id,
            clinic_id: user.clinic_id,
            deducted_days: deductDays,
            year,
            leave_adjustment_id: adjustment.id,
            applied_by: user.id,
          })

        appliedCount++
      }

      // 휴무일 적용 완료 표시
      await (supabase as any)
        .from('clinic_holidays')
        .update({
          is_applied: true,
          applied_at: new Date().toISOString(),
          applied_by: user.id,
        })
        .eq('id', holidayId)

      return { success: true, appliedCount, error: null }
    } catch (error) {
      console.error('[leaveService.applyHolidayToLeave] Error:', error)
      return { success: false, appliedCount: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 휴무일 적용 기록 조회
   */
  async getHolidayApplications(holidayId: string): Promise<{ data: any[]; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const { data, error } = await (supabase as any)
        .from('holiday_leave_applications')
        .select(`
          *,
          users:user_id (name, role)
        `)
        .eq('clinic_holiday_id', holidayId)
        .order('applied_at', { ascending: false })

      if (error) throw error

      return { data: data || [], error: null }
    } catch (error) {
      console.error('[leaveService.getHolidayApplications] Error:', error)
      return { data: [], error: extractErrorMessage(error) }
    }
  },
}

/**
 * 주말 제외 근무일 계산
 */
function calculateWorkingDays(startDate: Date, endDate: Date): number {
  let days = 0
  const current = new Date(startDate)

  while (current <= endDate) {
    const dayOfWeek = current.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      days++
    }
    current.setDate(current.getDate() + 1)
  }

  return days
}

export default leaveService
