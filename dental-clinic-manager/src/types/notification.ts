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
