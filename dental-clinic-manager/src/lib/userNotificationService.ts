/**
 * 사용자별 알림 서비스
 * User Notification Service
 */

import { ensureConnection } from './supabase/connectionCheck'
import type {
  UserNotification,
  CreateUserNotificationInput,
  UserNotificationListResponse,
  UserNotificationType,
} from '@/types/notification'

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
const getCurrentUser = (): { id: string; role: string; clinic_id: string; name: string } | null => {
  if (typeof window === 'undefined') return null
  const userStr = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
  if (!userStr) return null
  try {
    return JSON.parse(userStr)
  } catch {
    return null
  }
}

export const userNotificationService = {
  /**
   * 알림 생성
   */
  async createNotification(input: CreateUserNotificationInput): Promise<{ data: UserNotification | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const createdBy = input.created_by || getCurrentUserId()

      const { data, error } = await (supabase as any)
        .from('user_notifications')
        .insert({
          clinic_id: clinicId,
          user_id: input.user_id,
          type: input.type,
          title: input.title,
          content: input.content || null,
          link: input.link || null,
          reference_type: input.reference_type || null,
          reference_id: input.reference_id || null,
          created_by: createdBy,
          expires_at: input.expires_at || null,
        })
        .select()
        .single()

      if (error) throw error

      return { data, error: null }
    } catch (error) {
      console.error('[userNotificationService.createNotification] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 여러 사용자에게 알림 생성
   */
  async createNotificationForUsers(
    userIds: string[],
    input: Omit<CreateUserNotificationInput, 'user_id'>
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const clinicId = getCurrentClinicId()
      if (!clinicId) throw new Error('Clinic not found')

      const createdBy = input.created_by || getCurrentUserId()

      const notifications = userIds.map(userId => ({
        clinic_id: clinicId,
        user_id: userId,
        type: input.type,
        title: input.title,
        content: input.content || null,
        link: input.link || null,
        reference_type: input.reference_type || null,
        reference_id: input.reference_id || null,
        created_by: createdBy,
        expires_at: input.expires_at || null,
      }))

      const { error } = await (supabase as any)
        .from('user_notifications')
        .insert(notifications)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[userNotificationService.createNotificationForUsers] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 내 알림 목록 조회
   */
  async getMyNotifications(options?: {
    limit?: number
    offset?: number
    unreadOnly?: boolean
  }): Promise<{ data: UserNotificationListResponse | null; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const limit = options?.limit || 20
      const offset = options?.offset || 0

      let query = (supabase as any)
        .from('user_notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (options?.unreadOnly) {
        query = query.eq('is_read', false)
      }

      const { data, error, count } = await query

      if (error) throw error

      // 읽지 않은 알림 개수 조회
      const { count: unreadCount } = await (supabase as any)
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .or('expires_at.is.null,expires_at.gt.now()')

      return {
        data: {
          notifications: data || [],
          unreadCount: unreadCount || 0,
          total: count || 0,
        },
        error: null,
      }
    } catch (error) {
      console.error('[userNotificationService.getMyNotifications] Error:', error)
      return { data: null, error: extractErrorMessage(error) }
    }
  },

  /**
   * 읽지 않은 알림 개수 조회
   */
  async getUnreadCount(): Promise<{ count: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { count, error } = await (supabase as any)
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .or('expires_at.is.null,expires_at.gt.now()')

      if (error) throw error

      return { count: count || 0, error: null }
    } catch (error) {
      console.error('[userNotificationService.getUnreadCount] Error:', error)
      return { count: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 알림 읽음 처리
   */
  async markAsRead(notificationId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { error } = await (supabase as any)
        .from('user_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('id', notificationId)
        .eq('user_id', userId)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[userNotificationService.markAsRead] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  /**
   * 모든 알림 읽음 처리
   */
  async markAllAsRead(): Promise<{ success: boolean; count: number; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { data, error } = await (supabase as any)
        .from('user_notifications')
        .update({
          is_read: true,
          read_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_read', false)
        .select()

      if (error) throw error

      return { success: true, count: data?.length || 0, error: null }
    } catch (error) {
      console.error('[userNotificationService.markAllAsRead] Error:', error)
      return { success: false, count: 0, error: extractErrorMessage(error) }
    }
  },

  /**
   * 알림 삭제
   */
  async deleteNotification(notificationId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) throw new Error('Database connection failed')

      const userId = getCurrentUserId()
      if (!userId) throw new Error('User not found')

      const { error } = await (supabase as any)
        .from('user_notifications')
        .delete()
        .eq('id', notificationId)
        .eq('user_id', userId)

      if (error) throw error

      return { success: true, error: null }
    } catch (error) {
      console.error('[userNotificationService.deleteNotification] Error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // =====================================================
  // 연차 관련 알림 헬퍼 함수
  // =====================================================

  /**
   * 연차 신청 시 결재자에게 알림 생성
   * @param approverIds 결재자 ID 배열
   * @param applicantName 신청자 이름
   * @param startDate 연차 시작일
   * @param endDate 연차 종료일
   * @param requestId 연차 신청 ID
   */
  async notifyLeaveApprovalPending(
    approverIds: string[],
    applicantName: string,
    startDate: string,
    endDate: string,
    requestId: string
  ): Promise<{ success: boolean; error: string | null }> {
    const dateRange = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
    return this.createNotificationForUsers(approverIds, {
      type: 'leave_approval_pending',
      title: `${applicantName}님의 연차 승인 요청`,
      content: `기간: ${dateRange}`,
      link: '/management?tab=leave&subtab=approval',
      reference_type: 'leave_request',
      reference_id: requestId,
    })
  },

  /**
   * 연차 승인 시 신청자에게 알림 생성
   */
  async notifyLeaveApproved(
    applicantId: string,
    startDate: string,
    endDate: string,
    requestId: string
  ): Promise<{ success: boolean; error: string | null }> {
    const dateRange = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
    const result = await this.createNotification({
      user_id: applicantId,
      type: 'leave_approved',
      title: '연차가 승인되었습니다',
      content: `기간: ${dateRange}`,
      link: '/management?tab=leave',
      reference_type: 'leave_request',
      reference_id: requestId,
    })
    return { success: !!result.data, error: result.error }
  },

  /**
   * 연차 반려 시 신청자에게 알림 생성
   */
  async notifyLeaveRejected(
    applicantId: string,
    startDate: string,
    endDate: string,
    requestId: string,
    reason?: string
  ): Promise<{ success: boolean; error: string | null }> {
    const dateRange = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
    const result = await this.createNotification({
      user_id: applicantId,
      type: 'leave_rejected',
      title: '연차가 반려되었습니다',
      content: reason ? `기간: ${dateRange} / 사유: ${reason}` : `기간: ${dateRange}`,
      link: '/management?tab=leave',
      reference_type: 'leave_request',
      reference_id: requestId,
    })
    return { success: !!result.data, error: result.error }
  },

  /**
   * 연차 다음 단계 전달 시 신청자에게 알림
   */
  async notifyLeaveForwarded(
    applicantId: string,
    startDate: string,
    endDate: string,
    requestId: string,
    nextStep: string
  ): Promise<{ success: boolean; error: string | null }> {
    const dateRange = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
    const result = await this.createNotification({
      user_id: applicantId,
      type: 'leave_forwarded',
      title: '연차 승인이 진행 중입니다',
      content: `기간: ${dateRange} / 다음 단계: ${nextStep}`,
      link: '/management?tab=leave',
      reference_type: 'leave_request',
      reference_id: requestId,
    })
    return { success: !!result.data, error: result.error }
  },

  // =====================================================
  // 계약서 관련 알림 헬퍼 함수
  // =====================================================

  /**
   * 계약서 서명 요청 알림
   */
  async notifyContractSignatureRequired(
    signerId: string,
    employeeName: string,
    contractId: string
  ): Promise<{ success: boolean; error: string | null }> {
    const result = await this.createNotification({
      user_id: signerId,
      type: 'contract_signature_required',
      title: '근로계약서 서명이 필요합니다',
      content: `${employeeName}님의 근로계약서`,
      link: `/dashboard/contracts/${contractId}`,
      reference_type: 'contract',
      reference_id: contractId,
    })
    return { success: !!result.data, error: result.error }
  },

  /**
   * 계약서 서명 완료 알림 (상대방에게)
   */
  async notifyContractSigned(
    recipientId: string,
    signerName: string,
    contractId: string
  ): Promise<{ success: boolean; error: string | null }> {
    const result = await this.createNotification({
      user_id: recipientId,
      type: 'contract_signed',
      title: '계약서 서명이 완료되었습니다',
      content: `${signerName}님이 서명을 완료했습니다`,
      link: `/dashboard/contracts/${contractId}`,
      reference_type: 'contract',
      reference_id: contractId,
    })
    return { success: !!result.data, error: result.error }
  },

  /**
   * 계약서 완료 알림 (양측에게)
   */
  async notifyContractCompleted(
    userIds: string[],
    employeeName: string,
    contractId: string
  ): Promise<{ success: boolean; error: string | null }> {
    return this.createNotificationForUsers(userIds, {
      type: 'contract_completed',
      title: '근로계약서가 완료되었습니다',
      content: `${employeeName}님의 근로계약서 체결 완료`,
      link: `/dashboard/contracts/${contractId}`,
      reference_type: 'contract',
      reference_id: contractId,
    })
  },

  /**
   * 계약서 취소 알림
   */
  async notifyContractCancelled(
    userIds: string[],
    employeeName: string,
    contractId: string,
    reason?: string
  ): Promise<{ success: boolean; error: string | null }> {
    return this.createNotificationForUsers(userIds, {
      type: 'contract_cancelled',
      title: '근로계약서가 취소되었습니다',
      content: reason ? `${employeeName}님 / 사유: ${reason}` : `${employeeName}님의 근로계약서`,
      link: `/dashboard/contracts`,
      reference_type: 'contract',
      reference_id: contractId,
    })
  },
}

export default userNotificationService
