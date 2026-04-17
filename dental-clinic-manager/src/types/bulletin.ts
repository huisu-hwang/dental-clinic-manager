// 공지사항 카테고리
export type AnnouncementCategory =
  | 'schedule'      // 일정 (휴가, 회식 등)
  | 'holiday'       // 연휴/휴진 일정
  | 'general'       // 일반 공지

// 공지사항
export interface Announcement {
  id: string
  clinic_id: string
  title: string
  content: string
  category: AnnouncementCategory
  is_pinned: boolean           // 상단 고정
  is_important: boolean        // 중요 공지
  start_date?: string          // 일정 시작일 (schedule, holiday 카테고리용)
  end_date?: string            // 일정 종료일
  author_id: string
  author_name?: string
  view_count: number
  created_at: string
  updated_at: string
}

// 공지사항 생성 DTO
export interface CreateAnnouncementDto {
  title: string
  content: string
  category: AnnouncementCategory
  is_pinned?: boolean
  is_important?: boolean
  start_date?: string
  end_date?: string
}

// 문서 카테고리
export type DocumentCategory =
  | 'manual'        // 업무 매뉴얼
  | 'form'          // 서식/양식
  | 'guideline'     // 가이드라인
  | 'reference'     // 참고자료
  | 'other'         // 기타

// 문서
export interface Document {
  id: string
  clinic_id: string
  title: string
  description?: string
  category: DocumentCategory
  file_url?: string            // 첨부파일 URL
  file_name?: string           // 첨부파일명
  file_size?: number           // 파일 크기 (bytes)
  content?: string             // 텍스트 콘텐츠 (에디터로 작성한 경우)
  author_id: string
  author_name?: string
  view_count: number
  download_count: number
  created_at: string
  updated_at: string
}

// 문서 생성 DTO
export interface CreateDocumentDto {
  title: string
  description?: string
  category: DocumentCategory
  file_url?: string
  file_name?: string
  file_size?: number
  content?: string
}

// 업무 상태
export type TaskStatus =
  | 'pending'       // 대기
  | 'in_progress'   // 진행 중
  | 'review'        // 검토 요청
  | 'completed'     // 완료
  | 'on_hold'       // 보류
  | 'cancelled'     // 취소

// 업무 우선순위
export type TaskPriority =
  | 'low'           // 낮음
  | 'medium'        // 보통
  | 'high'          // 높음
  | 'urgent'        // 긴급

// 업무 할당
export interface Task {
  id: string
  clinic_id: string
  title: string
  description?: string
  status: TaskStatus
  priority: TaskPriority
  assignee_id: string          // 담당자 ID
  assignee_name?: string       // 담당자 이름
  assigner_id: string          // 할당자 ID
  assigner_name?: string       // 할당자 이름
  due_date?: string            // 마감일
  completed_at?: string        // 완료일
  progress: number             // 진행률 (0-100)
  comments_count: number       // 댓글 수
  recurring_template_id?: string | null  // 반복 업무 템플릿 참조 (있으면 반복 생성된 인스턴스)
  created_at: string
  updated_at: string
}

// 업무 생성 DTO
export interface CreateTaskDto {
  title: string
  description?: string
  priority?: TaskPriority
  assignee_id: string
  due_date?: string
}

// 업무 업데이트 DTO
export interface UpdateTaskDto {
  title?: string
  description?: string
  status?: TaskStatus
  priority?: TaskPriority
  assignee_id?: string
  due_date?: string
  progress?: number
}

// 업무 댓글
export interface TaskComment {
  id: string
  task_id: string
  author_id: string
  author_name?: string
  content: string
  created_at: string
  updated_at: string
}

// 업무 댓글 생성 DTO
export interface CreateTaskCommentDto {
  content: string
}

// 게시판 탭 타입
export type BulletinTab = 'announcements' | 'documents' | 'tasks'

// 공지사항 카테고리 라벨
export const ANNOUNCEMENT_CATEGORY_LABELS: Record<AnnouncementCategory, string> = {
  schedule: '일정',
  holiday: '휴진/연휴',
  general: '일반 공지'
}

// 문서 카테고리 라벨
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  manual: '업무 매뉴얼',
  form: '서식/양식',
  guideline: '가이드라인',
  reference: '참고자료',
  other: '기타'
}

// 업무 상태 라벨
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  pending: '대기',
  in_progress: '진행 중',
  review: '검토 요청',
  completed: '완료',
  on_hold: '보류',
  cancelled: '취소'
}

// 업무 우선순위 라벨
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  urgent: '긴급'
}

// 업무 상태 색상
export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  cancelled: 'bg-red-100 text-red-700'
}

// 업무 우선순위 색상
export const TASK_PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-blue-100 text-blue-600',
  high: 'bg-orange-100 text-orange-600',
  urgent: 'bg-red-100 text-red-600'
}

// =====================================================
// 반복 업무 템플릿
// =====================================================

// 반복 주기 유형
export type RecurrenceType = 'weekly' | 'monthly' | 'yearly'

// 반복 업무 템플릿
export interface RecurringTaskTemplate {
  id: string
  clinic_id: string
  title: string
  description?: string | null
  priority: TaskPriority
  assignee_id: string
  assignee_name?: string
  assigner_id: string
  assigner_name?: string
  recurrence_type: RecurrenceType
  recurrence_weekday?: number | null       // weekly: 0(일) ~ 6(토)
  recurrence_day_of_month?: number | null  // monthly/yearly: 1~31
  recurrence_month?: number | null         // yearly: 1~12
  start_date: string                       // YYYY-MM-DD
  end_date?: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

// 반복 업무 템플릿 생성 DTO
export interface CreateRecurringTaskTemplateDto {
  title: string
  description?: string
  priority?: TaskPriority
  assignee_id: string
  recurrence_type: RecurrenceType
  recurrence_weekday?: number
  recurrence_day_of_month?: number
  recurrence_month?: number
  start_date?: string
  end_date?: string
}

// 반복 업무 템플릿 수정 DTO
export interface UpdateRecurringTaskTemplateDto {
  title?: string
  description?: string
  priority?: TaskPriority
  assignee_id?: string
  recurrence_type?: RecurrenceType
  recurrence_weekday?: number | null
  recurrence_day_of_month?: number | null
  recurrence_month?: number | null
  start_date?: string
  end_date?: string | null
  is_active?: boolean
}

// 요일 라벨 (0=일 ~ 6=토, Date.getDay()와 동일)
export const WEEKDAY_LABELS: Record<number, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
}

// 반복 주기 라벨
export const RECURRENCE_TYPE_LABELS: Record<RecurrenceType, string> = {
  weekly: '주간',
  monthly: '월간',
  yearly: '연간',
}

// 반복 설정을 사람이 읽을 수 있는 문구로 변환
export const formatRecurrenceRule = (template: Pick<RecurringTaskTemplate, 'recurrence_type' | 'recurrence_weekday' | 'recurrence_day_of_month' | 'recurrence_month'>): string => {
  switch (template.recurrence_type) {
    case 'weekly':
      return `매주 ${WEEKDAY_LABELS[template.recurrence_weekday ?? 0]}요일`
    case 'monthly':
      return `매월 ${template.recurrence_day_of_month ?? 1}일`
    case 'yearly':
      return `매년 ${template.recurrence_month ?? 1}월 ${template.recurrence_day_of_month ?? 1}일`
    default:
      return '반복'
  }
}
