// 병원 알림 관련 타입 정의

// 반복 주기 타입
export type RecurrenceType =
  | 'none'      // 반복 없음 (특정 날짜만)
  | 'daily'     // 매일
  | 'weekly'    // 매주
  | 'monthly'   // 매월
  | 'yearly'    // 매년

// 알림 카테고리
export type NotificationCategory =
  | 'general'     // 일반
  | 'insurance'   // 보험청구
  | 'event'       // 행사/회식
  | 'birthday'    // 직원 생일
  | 'reminder'    // 리마인더 (화분 물주기 등)
  | 'important'   // 중요 공지

// 알림 아이콘 매핑
export const NOTIFICATION_CATEGORY_ICONS: Record<NotificationCategory, string> = {
  general: 'megaphone',
  insurance: 'document',
  event: 'calendar',
  birthday: 'cake',
  reminder: 'bell',
  important: 'exclamation'
}

// 알림 카테고리 라벨
export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  general: '일반',
  insurance: '보험청구',
  event: '행사/회식',
  birthday: '직원 생일',
  reminder: '리마인더',
  important: '중요 공지'
}

// 반복 주기 라벨
export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년'
}

// 요일 타입
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6 // 일~토

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토'
}

// 알림 대상 역할
export type TargetRole = 'all' | 'owner' | 'vice_director' | 'manager' | 'team_leader' | 'staff'

export const TARGET_ROLE_LABELS: Record<TargetRole, string> = {
  all: '전체',
  owner: '대표원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '팀장',
  staff: '일반직원'
}

// 클리닉 알림 인터페이스
export interface ClinicNotification {
  id: string
  clinic_id: string
  title: string
  content?: string
  category: NotificationCategory
  target_roles: TargetRole[]  // 볼 수 있는 역할들
  recurrence_type: RecurrenceType
  recurrence_config?: RecurrenceConfig  // 반복 설정 상세
  start_date: string  // ISO date string
  end_date?: string   // ISO date string (null이면 무기한)
  is_active: boolean
  priority: number    // 우선순위 (낮을수록 먼저 표시)
  created_by: string  // user_id
  created_at: string
  updated_at: string
}

// 반복 설정 상세
export interface RecurrenceConfig {
  // 매주 반복 시 요일들 (0=일, 1=월, ..., 6=토)
  days_of_week?: DayOfWeek[]
  // 매월 반복 시 날짜 (1-31)
  day_of_month?: number
  // 매년 반복 시 월 (1-12)
  month?: number
  // 매년 반복 시 일 (1-31)
  day?: number
}

// 알림 생성/수정용 폼 데이터
export interface NotificationFormData {
  title: string
  content: string
  category: NotificationCategory
  target_roles: TargetRole[]
  recurrence_type: RecurrenceType
  recurrence_config: RecurrenceConfig
  start_date: string
  end_date: string
  is_active: boolean
  priority: number
}

// 오늘 표시할 알림 (계산된 결과)
export interface TodayNotification {
  id: string
  title: string
  content?: string
  category: NotificationCategory
  priority: number
}

// 알림이 오늘 표시되어야 하는지 확인하는 유틸리티 함수
export function shouldShowNotificationToday(notification: ClinicNotification): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const startDate = new Date(notification.start_date)
  startDate.setHours(0, 0, 0, 0)

  // 시작일 이전이면 표시 안 함
  if (today < startDate) return false

  // 종료일이 있고 지났으면 표시 안 함
  if (notification.end_date) {
    const endDate = new Date(notification.end_date)
    endDate.setHours(0, 0, 0, 0)
    if (today > endDate) return false
  }

  // 반복 타입에 따라 확인
  switch (notification.recurrence_type) {
    case 'none':
      // 반복 없음: 시작일부터 종료일까지 매일 표시 (종료일 없으면 무기한)
      return true

    case 'daily':
      // 매일 표시
      return true

    case 'weekly':
      // 매주 특정 요일
      const dayOfWeek = today.getDay() as DayOfWeek
      // 요일이 설정되지 않았으면 모든 요일에 표시
      if (!notification.recurrence_config?.days_of_week || notification.recurrence_config.days_of_week.length === 0) {
        return true
      }
      return notification.recurrence_config.days_of_week.includes(dayOfWeek)

    case 'monthly':
      // 매월 특정 일
      const dayOfMonth = today.getDate()
      // 날짜가 설정되지 않았으면 매일 표시
      if (!notification.recurrence_config?.day_of_month) {
        return true
      }
      return notification.recurrence_config.day_of_month === dayOfMonth

    case 'yearly':
      // 매년 특정 월/일
      const month = today.getMonth() + 1  // 0-indexed to 1-indexed
      const day = today.getDate()
      // 월/일이 설정되지 않았으면 매일 표시
      if (!notification.recurrence_config?.month || !notification.recurrence_config?.day) {
        return true
      }
      return (
        notification.recurrence_config.month === month &&
        notification.recurrence_config.day === day
      )

    default:
      return true
  }
}

// 사용자 역할이 알림 대상에 포함되는지 확인
export function canUserSeeNotification(notification: ClinicNotification, userRole: string): boolean {
  if (notification.target_roles.includes('all')) return true
  return notification.target_roles.includes(userRole as TargetRole)
}

// 기본 폼 데이터 생성
export function getDefaultNotificationFormData(): NotificationFormData {
  const today = new Date().toISOString().split('T')[0]
  return {
    title: '',
    content: '',
    category: 'general',
    target_roles: ['all'],
    recurrence_type: 'none',
    recurrence_config: {},
    start_date: today,
    end_date: '',
    is_active: true,
    priority: 10
  }
}

// =====================================================
// 사용자별 알림 (User Notifications) - 개인 알림 시스템
// =====================================================

// 사용자 알림 타입
export type UserNotificationType =
  | 'leave_approval_pending'      // 연차 승인 대기 (결재자에게)
  | 'leave_approved'              // 연차 승인됨 (신청자에게)
  | 'leave_rejected'              // 연차 반려됨 (신청자에게)
  | 'leave_forwarded'             // 연차 다음 단계로 전달 (신청자에게)
  | 'contract_signature_required' // 계약서 서명 필요 (서명 대상자에게)
  | 'contract_signed'             // 계약서 서명 완료 (양측에게)
  | 'contract_completed'          // 계약서 완료 (양측에게)
  | 'contract_cancelled'          // 계약서 취소 (양측에게)
  | 'system'                      // 시스템 알림

// 사용자 알림 타입 라벨
export const USER_NOTIFICATION_TYPE_LABELS: Record<UserNotificationType, string> = {
  leave_approval_pending: '연차 승인 요청',
  leave_approved: '연차 승인',
  leave_rejected: '연차 반려',
  leave_forwarded: '연차 승인 진행',
  contract_signature_required: '서명 요청',
  contract_signed: '서명 완료',
  contract_completed: '계약 완료',
  contract_cancelled: '계약 취소',
  system: '시스템 알림'
}

// 사용자 알림 아이콘 매핑
export const USER_NOTIFICATION_TYPE_ICONS: Record<UserNotificationType, string> = {
  leave_approval_pending: 'clock',
  leave_approved: 'check-circle',
  leave_rejected: 'x-circle',
  leave_forwarded: 'arrow-right',
  contract_signature_required: 'pencil',
  contract_signed: 'document-check',
  contract_completed: 'document-text',
  contract_cancelled: 'document-minus',
  system: 'bell'
}

// 사용자 알림 색상 매핑
export const USER_NOTIFICATION_TYPE_COLORS: Record<UserNotificationType, { icon: string; bg: string; text: string }> = {
  leave_approval_pending: { icon: 'text-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  leave_approved: { icon: 'text-green-500', bg: 'bg-green-50', text: 'text-green-700' },
  leave_rejected: { icon: 'text-red-500', bg: 'bg-red-50', text: 'text-red-700' },
  leave_forwarded: { icon: 'text-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
  contract_signature_required: { icon: 'text-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
  contract_signed: { icon: 'text-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  contract_completed: { icon: 'text-green-500', bg: 'bg-green-50', text: 'text-green-700' },
  contract_cancelled: { icon: 'text-gray-500', bg: 'bg-gray-50', text: 'text-gray-700' },
  system: { icon: 'text-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' }
}

// 사용자 알림 인터페이스
export interface UserNotification {
  id: string
  clinic_id: string
  user_id: string              // 알림 수신자
  type: UserNotificationType
  title: string
  content?: string
  link?: string                // 관련 페이지 링크 (예: /management?tab=leave)
  reference_type?: string      // 참조 타입 (leave_request, contract)
  reference_id?: string        // 참조 ID
  is_read: boolean
  read_at?: string
  created_at: string
  created_by?: string          // 알림 발생시킨 사용자
  expires_at?: string          // 알림 만료 시간 (선택)
}

// 사용자 알림 생성용 입력 인터페이스
export interface CreateUserNotificationInput {
  user_id: string
  type: UserNotificationType
  title: string
  content?: string
  link?: string
  reference_type?: string
  reference_id?: string
  created_by?: string
  expires_at?: string
}

// 사용자 알림 목록 응답
export interface UserNotificationListResponse {
  notifications: UserNotification[]
  unreadCount: number
  total: number
}
