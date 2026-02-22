/**
 * 업무 체크리스트 서비스
 * Task Checklist Service
 */

import { createClient } from './supabase/client'
import type {
  TaskTemplate,
  DailyTaskCheck,
  TaskTemplateFormData,
  TaskTemplateStatus,
  TaskPeriod,
} from '@/types/taskChecklist'

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

// =============================================
// 업무 템플릿 관련 함수
// =============================================

/**
 * 특정 직원에게 할당된 승인된 업무 템플릿 목록 조회
 */
export async function getApprovedTemplatesForUser(
  userId: string
): Promise<{ data: TaskTemplate[]; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { data: [], error: 'Supabase client not available' }

    const clinicId = getCurrentClinicId()
    if (!clinicId) return { data: [], error: 'Clinic ID not found' }

    const { data, error } = await (supabase
      .from('task_templates') as any)
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('assigned_user_id', userId)
      .eq('status', 'approved')
      .eq('is_active', true)
      .order('period')
      .order('sort_order')

    if (error) return { data: [], error: extractErrorMessage(error) }
    return { data: data || [] }
  } catch (error) {
    return { data: [], error: extractErrorMessage(error) }
  }
}

/**
 * 클리닉의 모든 업무 템플릿 조회 (관리용)
 */
export async function getAllTemplates(
  statusFilter?: TaskTemplateStatus
): Promise<{ data: TaskTemplate[]; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { data: [], error: 'Supabase client not available' }

    const clinicId = getCurrentClinicId()
    if (!clinicId) return { data: [], error: 'Clinic ID not found' }

    let query = (supabase
      .from('task_templates') as any)
      .select('*')
      .eq('clinic_id', clinicId)
      .order('assigned_user_id')
      .order('period')
      .order('sort_order')

    if (statusFilter) {
      query = query.eq('status', statusFilter)
    }

    const { data, error } = await query

    if (error) return { data: [], error: extractErrorMessage(error) }
    return { data: data || [] }
  } catch (error) {
    return { data: [], error: extractErrorMessage(error) }
  }
}

/**
 * 결재 대기 중인 템플릿 목록 조회 (원장용)
 */
export async function getPendingTemplates(): Promise<{ data: TaskTemplate[]; error?: string }> {
  return getAllTemplates('pending_approval')
}

/**
 * 업무 템플릿 생성 (실장이 생성 -> draft 상태)
 */
export async function createTaskTemplate(
  formData: TaskTemplateFormData,
  createdBy: string
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { data: null, error: 'Supabase client not available' }

    const clinicId = getCurrentClinicId()
    if (!clinicId) return { data: null, error: 'Clinic ID not found' }

    const { data, error } = await (supabase
      .from('task_templates') as any)
      .insert({
        clinic_id: clinicId,
        assigned_user_id: formData.assigned_user_id,
        title: formData.title,
        description: formData.description || null,
        period: formData.period,
        sort_order: formData.sort_order || 0,
        status: 'draft',
        created_by: createdBy,
        is_active: true,
      })
      .select()
      .single()

    if (error) return { data: null, error: extractErrorMessage(error) }
    return { data }
  } catch (error) {
    return { data: null, error: extractErrorMessage(error) }
  }
}

/**
 * 업무 템플릿 수정
 */
export async function updateTaskTemplate(
  templateId: string,
  updates: Partial<TaskTemplateFormData>
): Promise<{ data: TaskTemplate | null; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { data: null, error: 'Supabase client not available' }

    const updateData: Record<string, any> = {}
    if (updates.assigned_user_id !== undefined) updateData.assigned_user_id = updates.assigned_user_id
    if (updates.title !== undefined) updateData.title = updates.title
    if (updates.description !== undefined) updateData.description = updates.description
    if (updates.period !== undefined) updateData.period = updates.period
    if (updates.sort_order !== undefined) updateData.sort_order = updates.sort_order

    // 수정 시 상태를 draft로 되돌림 (재승인 필요)
    updateData.status = 'draft'
    updateData.approved_by = null
    updateData.approved_at = null
    updateData.rejection_reason = null

    const { data, error } = await (supabase
      .from('task_templates') as any)
      .update(updateData)
      .eq('id', templateId)
      .select()
      .single()

    if (error) return { data: null, error: extractErrorMessage(error) }
    return { data }
  } catch (error) {
    return { data: null, error: extractErrorMessage(error) }
  }
}

/**
 * 업무 템플릿 삭제 (비활성화)
 */
export async function deleteTaskTemplate(
  templateId: string
): Promise<{ error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { error: 'Supabase client not available' }

    const { error } = await (supabase
      .from('task_templates') as any)
      .update({ is_active: false })
      .eq('id', templateId)

    if (error) return { error: extractErrorMessage(error) }
    return {}
  } catch (error) {
    return { error: extractErrorMessage(error) }
  }
}

/**
 * 결재 요청 (실장 -> 원장)
 */
export async function submitForApproval(
  templateIds: string[]
): Promise<{ error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { error: 'Supabase client not available' }

    const { error } = await (supabase
      .from('task_templates') as any)
      .update({ status: 'pending_approval' })
      .in('id', templateIds)

    if (error) return { error: extractErrorMessage(error) }
    return {}
  } catch (error) {
    return { error: extractErrorMessage(error) }
  }
}

/**
 * 결재 승인 (원장)
 */
export async function approveTemplates(
  templateIds: string[],
  approvedBy: string
): Promise<{ error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { error: 'Supabase client not available' }

    const { error } = await (supabase
      .from('task_templates') as any)
      .update({
        status: 'approved',
        approved_by: approvedBy,
        approved_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .in('id', templateIds)

    if (error) return { error: extractErrorMessage(error) }
    return {}
  } catch (error) {
    return { error: extractErrorMessage(error) }
  }
}

/**
 * 결재 반려 (원장)
 */
export async function rejectTemplates(
  templateIds: string[],
  rejectedBy: string,
  reason: string
): Promise<{ error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { error: 'Supabase client not available' }

    const { error } = await (supabase
      .from('task_templates') as any)
      .update({
        status: 'rejected',
        approved_by: rejectedBy,
        approved_at: new Date().toISOString(),
        rejection_reason: reason,
      })
      .in('id', templateIds)

    if (error) return { error: extractErrorMessage(error) }
    return {}
  } catch (error) {
    return { error: extractErrorMessage(error) }
  }
}

// =============================================
// 일일 체크리스트 관련 함수
// =============================================

/**
 * 특정 날짜의 체크리스트 조회 (본인 업무)
 */
export async function getDailyChecks(
  userId: string,
  date: string
): Promise<{ data: DailyTaskCheck[]; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { data: [], error: 'Supabase client not available' }

    const clinicId = getCurrentClinicId()
    if (!clinicId) return { data: [], error: 'Clinic ID not found' }

    const { data, error } = await (supabase
      .from('daily_task_checks') as any)
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .eq('check_date', date)

    if (error) return { data: [], error: extractErrorMessage(error) }
    return { data: data || [] }
  } catch (error) {
    return { data: [], error: extractErrorMessage(error) }
  }
}

/**
 * 체크리스트 항목 토글 (완료/미완료)
 */
export async function toggleTaskCheck(
  templateId: string,
  userId: string,
  date: string,
  completed: boolean,
  notes?: string
): Promise<{ error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { error: 'Supabase client not available' }

    const clinicId = getCurrentClinicId()
    if (!clinicId) return { error: 'Clinic ID not found' }

    if (completed) {
      // upsert: 완료 체크
      const { error } = await (supabase
        .from('daily_task_checks') as any)
        .upsert({
          clinic_id: clinicId,
          template_id: templateId,
          user_id: userId,
          check_date: date,
          status: 'completed',
          checked_at: new Date().toISOString(),
          notes: notes || null,
        }, {
          onConflict: 'template_id,user_id,check_date',
        })

      if (error) return { error: extractErrorMessage(error) }
    } else {
      // 완료 취소
      const { error } = await (supabase
        .from('daily_task_checks') as any)
        .update({
          status: 'pending',
          checked_at: null,
          notes: notes || null,
        })
        .eq('template_id', templateId)
        .eq('user_id', userId)
        .eq('check_date', date)

      if (error) return { error: extractErrorMessage(error) }
    }

    return {}
  } catch (error) {
    return { error: extractErrorMessage(error) }
  }
}

/**
 * 특정 날짜의 전체 직원 체크리스트 현황 조회 (관리자용)
 */
export async function getAllDailyChecksForDate(
  date: string
): Promise<{ data: DailyTaskCheck[]; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { data: [], error: 'Supabase client not available' }

    const clinicId = getCurrentClinicId()
    if (!clinicId) return { data: [], error: 'Clinic ID not found' }

    const { data, error } = await (supabase
      .from('daily_task_checks') as any)
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('check_date', date)

    if (error) return { data: [], error: extractErrorMessage(error) }
    return { data: data || [] }
  } catch (error) {
    return { data: [], error: extractErrorMessage(error) }
  }
}

/**
 * 클리닉 직원 목록 조회
 */
export async function getClinicStaff(): Promise<{ data: Array<{ id: string; name: string; role: string }>; error?: string }> {
  try {
    const supabase = createClient()
    if (!supabase) return { data: [], error: 'Supabase client not available' }

    const clinicId = getCurrentClinicId()
    if (!clinicId) return { data: [], error: 'Clinic ID not found' }

    const { data, error } = await (supabase
      .from('users') as any)
      .select('id, name, role')
      .eq('clinic_id', clinicId)
      .eq('status', 'active')
      .order('name')

    if (error) return { data: [], error: extractErrorMessage(error) }
    return { data: data || [] }
  } catch (error) {
    return { data: [], error: extractErrorMessage(error) }
  }
}

export const taskChecklistService = {
  getApprovedTemplatesForUser,
  getAllTemplates,
  getPendingTemplates,
  createTaskTemplate,
  updateTaskTemplate,
  deleteTaskTemplate,
  submitForApproval,
  approveTemplates,
  rejectTemplates,
  getDailyChecks,
  toggleTaskCheck,
  getAllDailyChecksForDate,
  getClinicStaff,
}
