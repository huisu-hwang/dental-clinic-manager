// ============================================
// 지점 관리 서비스
// Branch Management Service
// ============================================

import { getSupabase } from './supabase'
import type {
  ClinicBranch,
  CreateBranchInput,
  UpdateBranchInput,
  BranchFilter,
  BranchesResponse,
  BranchAttendanceStats,
  BranchOption,
  validateBranch,
} from '@/types/branch'

/**
 * 지점 목록 조회
 */
export async function getBranches(
  filter: BranchFilter
): Promise<{ success: boolean; branches?: ClinicBranch[]; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    let query = supabase
      .from('clinic_branches')
      .select('*')
      .eq('clinic_id', filter.clinic_id)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true })

    // 활성화 상태 필터
    if (filter.is_active !== undefined) {
      query = query.eq('is_active', filter.is_active)
    }

    const { data, error } = await query

    if (error) {
      console.error('[getBranches] Error:', error)
      return { success: false, error: error.message }
    }

    return { success: true, branches: data as ClinicBranch[] }
  } catch (error: any) {
    console.error('[getBranches] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to fetch branches' }
  }
}

/**
 * 특정 지점 조회
 */
export async function getBranchById(
  branchId: string
): Promise<{ success: boolean; branch?: ClinicBranch; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { data, error } = await supabase
      .from('clinic_branches')
      .select('*')
      .eq('id', branchId)
      .single()

    if (error) {
      console.error('[getBranchById] Error:', error)
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: 'Branch not found' }
    }

    return { success: true, branch: data as ClinicBranch }
  } catch (error: any) {
    console.error('[getBranchById] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to fetch branch' }
  }
}

/**
 * 지점 생성
 */
export async function createBranch(
  input: CreateBranchInput,
  currentUserId: string
): Promise<{ success: boolean; branch?: ClinicBranch; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 유효성 검증
    const { validateBranch } = await import('@/types/branch')
    const validation = validateBranch(input)
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0]
      return { success: false, error: firstError }
    }

    // 지점 생성
    const { data, error } = await supabase
      .from('clinic_branches')
      .insert({
        ...input,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (error) {
      console.error('[createBranch] Error:', error)

      // 중복 지점명 에러 처리
      if (error.code === '23505') {
        return { success: false, error: '이미 존재하는 지점명입니다.' }
      }

      return { success: false, error: error.message }
    }

    console.log('[createBranch] Branch created:', data.id)
    return { success: true, branch: data as ClinicBranch }
  } catch (error: any) {
    console.error('[createBranch] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to create branch' }
  }
}

/**
 * 지점 수정
 */
export async function updateBranch(
  branchId: string,
  input: UpdateBranchInput
): Promise<{ success: boolean; branch?: ClinicBranch; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 유효성 검증
    const { validateBranch } = await import('@/types/branch')
    const validation = validateBranch(input)
    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0]
      return { success: false, error: firstError }
    }

    // 지점 수정
    const { data, error } = await supabase
      .from('clinic_branches')
      .update(input)
      .eq('id', branchId)
      .select()
      .single()

    if (error) {
      console.error('[updateBranch] Error:', error)

      // 중복 지점명 에러 처리
      if (error.code === '23505') {
        return { success: false, error: '이미 존재하는 지점명입니다.' }
      }

      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: 'Branch not found' }
    }

    console.log('[updateBranch] Branch updated:', branchId)
    return { success: true, branch: data as ClinicBranch }
  } catch (error: any) {
    console.error('[updateBranch] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to update branch' }
  }
}

/**
 * 지점 삭제
 */
export async function deleteBranch(
  branchId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 1. 지점 확인
    const { data: branch, error: fetchError } = await supabase
      .from('clinic_branches')
      .select('id, branch_name')
      .eq('id', branchId)
      .single()

    if (fetchError || !branch) {
      return { success: false, error: '지점을 찾을 수 없습니다.' }
    }

    // 2. 본점은 삭제 불가
    if (branch.branch_name === '본점') {
      return { success: false, error: '본점은 삭제할 수 없습니다.' }
    }

    // 3. 지점에 소속된 직원 확인
    const { count: employeeCount, error: employeeError } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('primary_branch_id', branchId)

    if (employeeError) {
      console.error('[deleteBranch] Employee check error:', employeeError)
      return { success: false, error: employeeError.message }
    }

    if (employeeCount && employeeCount > 0) {
      return {
        success: false,
        error: `${employeeCount}명의 직원이 이 지점에 소속되어 있습니다. 먼저 직원들의 소속 지점을 변경해주세요.`,
      }
    }

    // 4. 지점 삭제 (CASCADE로 관련 데이터도 함께 삭제)
    const { error: deleteError } = await supabase
      .from('clinic_branches')
      .delete()
      .eq('id', branchId)

    if (deleteError) {
      console.error('[deleteBranch] Delete error:', deleteError)
      return { success: false, error: deleteError.message }
    }

    console.log('[deleteBranch] Branch deleted:', branchId)
    return { success: true }
  } catch (error: any) {
    console.error('[deleteBranch] Unexpected error:', error)
    return { success: false, error: error.message || 'Failed to delete branch' }
  }
}

/**
 * 지점 활성화/비활성화
 */
export async function toggleBranchActive(
  branchId: string,
  isActive: boolean
): Promise<{ success: boolean; branch?: ClinicBranch; error?: string }> {
  return updateBranch(branchId, { is_active: isActive })
}

/**
 * 지점 목록 (UI 선택용)
 */
export async function getBranchOptions(
  clinicId: string
): Promise<{ success: boolean; options?: BranchOption[]; error?: string }> {
  const result = await getBranches({ clinic_id: clinicId, is_active: true })

  if (!result.success || !result.branches) {
    return { success: false, error: result.error }
  }

  const options: BranchOption[] = result.branches.map((branch) => ({
    value: branch.id,
    label: branch.branch_name,
    address: branch.address || undefined,
    isActive: branch.is_active,
  }))

  return { success: true, options }
}

/**
 * 지점별 출근 통계
 */
export async function getBranchAttendanceStats(
  clinicId: string,
  date: string
): Promise<{ success: boolean; stats?: BranchAttendanceStats[]; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 1. 병원의 모든 활성 지점 조회
    const branchesResult = await getBranches({ clinic_id: clinicId, is_active: true })
    if (!branchesResult.success || !branchesResult.branches) {
      return { success: false, error: branchesResult.error }
    }

    const branches = branchesResult.branches

    // 2. 각 지점별 통계 계산
    const stats: BranchAttendanceStats[] = []

    for (const branch of branches) {
      // 지점에 소속된 직원 수
      const { count: totalEmployees, error: employeesError } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('primary_branch_id', branch.id)
        .eq('status', 'active')

      if (employeesError) {
        console.error('[getBranchAttendanceStats] Error:', employeesError)
        continue
      }

      // 출근 기록 조회
      const { data: records, error: recordsError } = await supabase
        .from('attendance_records')
        .select('id, check_in_time, late_minutes')
        .eq('clinic_id', clinicId)
        .eq('branch_id', branch.id)
        .eq('work_date', date)

      if (recordsError) {
        console.error('[getBranchAttendanceStats] Error:', recordsError)
        continue
      }

      const checkedIn = records?.filter((r) => r.check_in_time).length || 0
      const lateCount = records?.filter((r) => r.late_minutes > 0).length || 0
      const total = totalEmployees || 0

      stats.push({
        branch_id: branch.id,
        branch_name: branch.branch_name,
        date,
        total_employees: total,
        checked_in: checkedIn,
        not_checked_in: total - checkedIn,
        late_count: lateCount,
        attendance_rate: total > 0 ? Math.round((checkedIn / total) * 100) : 0,
      })
    }

    return { success: true, stats }
  } catch (error: any) {
    console.error('[getBranchAttendanceStats] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 기본 지점 조회 (본점)
 */
export async function getDefaultBranch(
  clinicId: string
): Promise<{ success: boolean; branch?: ClinicBranch; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { data, error } = await supabase
      .from('clinic_branches')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('branch_name', '본점')
      .single()

    if (error || !data) {
      // 본점이 없으면 첫 번째 지점 반환
      const { data: firstBranch, error: firstError } = await supabase
        .from('clinic_branches')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .limit(1)
        .single()

      if (firstError || !firstBranch) {
        return { success: false, error: '활성화된 지점이 없습니다.' }
      }

      return { success: true, branch: firstBranch as ClinicBranch }
    }

    return { success: true, branch: data as ClinicBranch }
  } catch (error: any) {
    console.error('[getDefaultBranch] Unexpected error:', error)
    return { success: false, error: error.message }
  }
}

// Export all functions
export const branchService = {
  getBranches,
  getBranchById,
  createBranch,
  updateBranch,
  deleteBranch,
  toggleBranchActive,
  getBranchOptions,
  getBranchAttendanceStats,
  getDefaultBranch,
}
