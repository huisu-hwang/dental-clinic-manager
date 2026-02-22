// 업무 체크리스트 관련 타입 정의

// 업무 시간대 구분
export type TaskPeriod = 'before_treatment' | 'during_treatment' | 'before_leaving'

// 업무 템플릿 승인 상태
export type TaskTemplateStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected'

// 체크리스트 완료 상태
export type CheckStatus = 'pending' | 'completed'

// 시간대 라벨 매핑
export const TASK_PERIOD_LABELS: Record<TaskPeriod, string> = {
  before_treatment: '진료시작 전',
  during_treatment: '진료 중',
  before_leaving: '퇴근 전',
}

// 템플릿 상태 라벨 매핑
export const TEMPLATE_STATUS_LABELS: Record<TaskTemplateStatus, string> = {
  draft: '초안',
  pending_approval: '결재 대기',
  approved: '승인됨',
  rejected: '반려됨',
}

/**
 * 업무 템플릿 - 실장이 생성하고 원장이 승인
 * 직원별로 어떤 업무를 해야 하는지 정의
 */
export interface TaskTemplate {
  id: string
  clinic_id: string
  assigned_user_id: string  // 업무를 수행할 직원
  assigned_user_name?: string  // 직원 이름 (조인용)
  title: string              // 업무 이름
  description?: string       // 업무 설명
  period: TaskPeriod         // 시간대
  sort_order: number         // 정렬 순서
  status: TaskTemplateStatus // 승인 상태
  created_by: string         // 생성한 실장 ID
  created_by_name?: string   // 생성한 실장 이름 (조인용)
  approved_by?: string       // 승인한 원장 ID
  approved_by_name?: string  // 승인한 원장 이름 (조인용)
  approved_at?: string       // 승인 일시
  rejection_reason?: string  // 반려 사유
  is_active: boolean         // 활성 상태
  created_at: string
  updated_at: string
}

/**
 * 일일 체크리스트 기록 - 직원이 매일 업무 완료 체크
 */
export interface DailyTaskCheck {
  id: string
  clinic_id: string
  template_id: string        // 어떤 업무인지
  user_id: string            // 체크한 직원
  check_date: string         // 날짜 (YYYY-MM-DD)
  status: CheckStatus        // 완료 상태
  checked_at?: string        // 체크한 시간
  notes?: string             // 메모
  created_at: string
  updated_at: string
}

/**
 * 일일 체크리스트 + 템플릿 정보 결합 (화면 표시용)
 */
export interface DailyTaskCheckWithTemplate extends DailyTaskCheck {
  template: TaskTemplate
}

/**
 * 템플릿 생성/수정 폼 데이터
 */
export interface TaskTemplateFormData {
  assigned_user_id: string
  title: string
  description?: string
  period: TaskPeriod
  sort_order?: number
}

/**
 * 직원별 일일 업무 요약
 */
export interface UserDailyTaskSummary {
  user_id: string
  user_name: string
  date: string
  total_tasks: number
  completed_tasks: number
  completion_rate: number
  tasks_by_period: {
    before_treatment: { total: number; completed: number }
    during_treatment: { total: number; completed: number }
    before_leaving: { total: number; completed: number }
  }
}
