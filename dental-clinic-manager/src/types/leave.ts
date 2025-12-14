// ============================================
// 연차 관리 시스템 타입 정의
// Leave Management System Types
// ============================================

/**
 * 연차 정책
 * Leave Policy
 */
export interface LeavePolicy {
  id: string;
  clinic_id: string;
  policy_name: string;
  description?: string;

  // 기본 연차 설정
  base_annual_days: number; // 기본 연차 일수

  // 근속연수별 연차 일수 (JSONB)
  days_per_year: YearlyLeaveRule[];

  // 이월 정책
  carryover_enabled: boolean; // 이월 허용 여부
  carryover_max_days?: number | null; // 최대 이월 일수
  carryover_expiry_months: number; // 이월 연차 만료 개월

  // 출근율 요건
  min_attendance_rate: number; // 최소 출근율 (%)

  // 결재 프로세스 설정
  require_manager_approval: boolean | ManagerApprovalByRank; // 실장 결재 포함 여부 (직급별 설정 가능)

  // 활성화 상태
  is_active: boolean;
  is_default: boolean; // 기본 정책 여부

  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * 직급별 실장 결재 포함 여부
 * Rank-based Manager Approval Settings
 */
export interface ManagerApprovalByRank {
  vice_director: boolean; // 부원장 - 실장 결재 포함 여부
  team_leader: boolean; // 팀장 - 실장 결재 포함 여부
  staff: boolean; // 직원 - 실장 결재 포함 여부
}

/**
 * 근속연수별 연차 규칙
 */
export interface YearlyLeaveRule {
  min_years: number; // 최소 근속 연수
  max_years: number; // 최대 근속 연수
  days: number; // 연차 일수
  rule?: 'monthly' | 'yearly'; // 발생 규칙 (월별/연별)
  description?: string; // 설명
}

/**
 * 연차 정책 생성/수정 DTO
 */
export interface LeavePolicyInput {
  clinic_id: string;
  policy_name: string;
  description?: string;
  base_annual_days: number;
  days_per_year: YearlyLeaveRule[];
  carryover_enabled: boolean;
  carryover_max_days?: number;
  carryover_expiry_months: number;
  min_attendance_rate: number;
  require_manager_approval?: boolean | ManagerApprovalByRank; // 실장 결재 포함 여부 (직급별 설정 가능)
  is_default?: boolean;
}

/**
 * 연차 종류
 * Leave Type
 */
export interface LeaveType {
  id: string;
  clinic_id: string;
  name: string; // 연차 종류 이름
  code: LeaveTypeCode; // 코드
  description?: string;

  // 연차 차감 설정
  is_paid: boolean; // 유급 여부
  deduct_from_annual: boolean; // 연차에서 차감 여부
  deduct_days: number; // 차감 일수 (반차는 0.5)

  // 신청 요건
  requires_proof: boolean; // 증빙 필요 여부
  proof_description?: string; // 필요한 증빙 설명
  max_consecutive_days?: number | null; // 최대 연속 사용 일수
  min_notice_days: number; // 최소 사전 신청 일수

  // UI 설정
  color: string; // 캘린더 표시 색상 (예: #3B82F6)
  icon?: string; // 아이콘
  display_order: number; // 표시 순서

  // 활성화 상태
  is_active: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * 연차 종류 코드
 */
export type LeaveTypeCode =
  | 'annual' // 연차
  | 'half_day' // 반차
  | 'sick' // 병가
  | 'family_event' // 경조사
  | 'compensatory' // 대체휴가
  | 'unpaid'; // 무급휴가

/**
 * 반차 타입
 */
export type HalfDayType = 'AM' | 'PM';

/**
 * 연차 종류 생성/수정 DTO
 */
export interface LeaveTypeInput {
  clinic_id: string;
  name: string;
  code: LeaveTypeCode;
  description?: string;
  is_paid: boolean;
  deduct_from_annual: boolean;
  deduct_days: number;
  requires_proof: boolean;
  proof_description?: string;
  max_consecutive_days?: number;
  min_notice_days: number;
  color: string;
  icon?: string;
  display_order: number;
}

/**
 * 승인 프로세스 (워크플로우)
 * Leave Approval Workflow
 */
export interface LeaveApprovalWorkflow {
  id: string;
  clinic_id: string;
  workflow_name: string;
  description?: string;
  steps: WorkflowStep[]; // 승인 단계 배열
  is_default: boolean; // 기본 워크플로우 여부
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * 워크플로우 승인 단계
 */
export interface WorkflowStep {
  step: number; // 단계 번호 (1, 2, 3, ...)
  role: string; // 승인자 역할 (manager, owner, team_leader 등)
  description?: string; // 단계 설명
}

/**
 * 승인 프로세스 생성/수정 DTO
 */
export interface WorkflowInput {
  clinic_id: string;
  workflow_name: string;
  description?: string;
  steps: WorkflowStep[];
  is_default?: boolean;
}

/**
 * 직원별 연차 현황
 * Employee Leave Balance
 */
export interface EmployeeLeaveBalance {
  id: string;
  user_id: string;
  clinic_id: string;
  year: number;

  // 연차 현황
  total_days: number; // 총 부여 연차 일수
  used_days: number; // 사용한 연차 일수
  pending_days: number; // 승인 대기 중인 연차 일수
  remaining_days: number; // 잔여 연차 일수

  // 특별휴가 사용 현황 (연차와 별도 관리)
  family_event_days?: number; // 경조사 휴가 사용 일수
  unpaid_days?: number; // 무급휴가 사용 일수

  // 이월 연차
  carryover_days: number; // 이월 연차 일수
  carryover_used: number; // 사용한 이월 연차
  carryover_expiry_date?: string | null; // 이월 연차 만료일

  // 근속 정보
  years_of_service: number; // 근속 연수
  hire_date?: string | null; // 입사일

  // 계산 정보
  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * 연차 잔여 요약 (UI 표시용)
 */
export interface LeaveBalanceSummary {
  user_id: string;
  user_name: string;
  year: number;
  total_days: number;
  used_days: number;
  pending_days: number;
  remaining_days: number;
  usage_rate: number; // 사용률 (%)
  carryover_days: number;
}

/**
 * 연차 신청
 * Leave Request
 */
export interface LeaveRequest {
  id: string;
  user_id: string;
  clinic_id: string;
  leave_type_id: string;

  // 신청 기간
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  half_day_type?: HalfDayType | null; // 반차 타입
  total_days: number; // 신청 일수

  // 신청 내용
  reason?: string; // 신청 사유
  proof_file_url?: string | null; // 증빙 파일 URL
  emergency: boolean; // 긴급 신청 여부

  // 승인 상태
  status: LeaveRequestStatus;
  workflow_id?: string | null;
  current_step: number; // 현재 승인 단계
  total_steps?: number | null; // 총 승인 단계 수

  // 최종 결과
  final_approver_id?: string | null;
  final_decision_at?: string | null;
  rejection_reason?: string | null;

  // 타임스탬프
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * 연차 신청 상태
 */
export type LeaveRequestStatus =
  | 'pending' // 승인 대기
  | 'approved' // 승인 완료
  | 'rejected' // 반려
  | 'cancelled' // 취소
  | 'withdrawn'; // 철회

/**
 * 연차 신청 생성 DTO
 */
export interface LeaveRequestInput {
  user_id: string;
  clinic_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day_type?: HalfDayType;
  total_days: number;
  reason?: string;
  proof_file_url?: string;
  emergency?: boolean;
}

/**
 * 연차 신청 응답
 */
export interface LeaveRequestResponse {
  success: boolean;
  message: string;
  request?: LeaveRequest;
  error?: string;
  validation_errors?: string[];
}

/**
 * 연차 신청 검증 결과
 */
export interface LeaveValidationResult {
  is_valid: boolean;
  error_message?: string;
  warnings?: string[];
  conflicting_requests?: LeaveRequest[];
}

/**
 * 연차 승인 히스토리
 * Leave Approval
 */
export interface LeaveApproval {
  id: string;
  leave_request_id: string;

  // 승인 단계
  step_number: number;
  step_name?: string;

  // 승인자 정보
  approver_id: string;
  approver_role?: string;
  approver_name?: string;

  // 승인 결과
  action: ApprovalAction;
  comment?: string;
  acted_at: string;

  created_at: string;
}

/**
 * 승인 액션
 */
export type ApprovalAction =
  | 'approved' // 승인
  | 'rejected' // 반려
  | 'forwarded'; // 다음 단계로 전달

/**
 * 연차 승인/반려 DTO
 */
export interface LeaveApprovalInput {
  leave_request_id: string;
  approver_id: string;
  action: ApprovalAction;
  comment?: string;
}

/**
 * 연차 신청 상세 (승인자용)
 */
export interface LeaveRequestDetail extends LeaveRequest {
  // 신청자 정보
  user_name: string;
  user_role: string;
  user_email: string;

  // 연차 종류 정보
  leave_type: LeaveType;

  // 승인 이력
  approvals: LeaveApproval[];

  // 다음 승인자
  next_approver?: {
    role: string;
    description: string;
  };

  // 잔여 연차 정보
  user_balance: EmployeeLeaveBalance;
}

/**
 * 연차 신청 목록 필터
 */
export interface LeaveRequestFilter {
  clinic_id: string;
  user_id?: string; // 특정 사용자
  status?: LeaveRequestStatus; // 특정 상태
  leave_type_id?: string; // 특정 연차 종류
  start_date?: string; // 시작일 이후
  end_date?: string; // 종료일 이전
  year?: number; // 특정 연도
  month?: number; // 특정 월
}

/**
 * 연차 신청 목록 응답
 */
export interface LeaveRequestsResponse {
  requests: LeaveRequestDetail[];
  total_count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/**
 * 연차 캘린더 데이터
 */
export interface LeaveCalendarData {
  date: string; // YYYY-MM-DD
  leaves: {
    user_id: string;
    user_name: string;
    leave_type: LeaveType;
    half_day_type?: HalfDayType;
    status: LeaveRequestStatus;
  }[];
}

/**
 * 팀 연차 캘린더 (월별)
 */
export interface TeamLeaveCalendar {
  year: number;
  month: number;
  clinic_id: string;
  days: LeaveCalendarData[];
  summary: {
    total_leave_days: number;
    employees_on_leave_count: number;
    busiest_day: {
      date: string;
      count: number;
    };
  };
}

/**
 * 연차 대시보드 데이터
 */
export interface LeaveDashboard {
  user: {
    id: string;
    name: string;
  };
  balance: EmployeeLeaveBalance;
  pending_requests: LeaveRequest[];
  upcoming_leaves: LeaveRequest[];
  recent_history: LeaveRequest[];
  quick_stats: {
    total_approved_this_year: number;
    total_pending: number;
    days_until_carryover_expiry?: number;
  };
}

/**
 * 승인 대기 목록 (관리자용)
 */
export interface PendingApprovalList {
  approver_id: string;
  approver_role: string;
  pending_requests: LeaveRequestDetail[];
  total_count: number;
}

/**
 * 연차 사용 보고서
 */
export interface LeaveUsageReport {
  clinic_name: string;
  report_period: {
    year: number;
    month?: number;
  };
  generated_at: string;
  generated_by: string;
  employees: {
    user_id: string;
    user_name: string;
    role: string;
    balance: EmployeeLeaveBalance;
    requests: LeaveRequest[];
    usage_summary: {
      total_approved: number;
      by_type: Record<string, number>;
    };
  }[];
  summary: {
    total_employees: number;
    total_leave_days_used: number;
    average_usage_rate: number;
    most_used_leave_type: {
      name: string;
      count: number;
    };
  };
}

/**
 * 연차 알림 (직원용)
 */
export interface LeaveNotification {
  id: string;
  user_id: string;
  notification_type:
    | 'request_approved'
    | 'request_rejected'
    | 'request_pending'
    | 'carryover_expiring'
    | 'leave_balance_low';
  title: string;
  message: string;
  related_request_id?: string;
  created_at: string;
  is_read: boolean;
}

/**
 * 연차 충돌 확인
 */
export interface LeaveConflictCheck {
  has_conflict: boolean;
  conflicting_employees: {
    user_id: string;
    user_name: string;
    leave_dates: string[];
  }[];
  team_coverage: {
    total_team_members: number;
    on_leave_count: number;
    available_count: number;
    coverage_rate: number; // %
  };
}

/**
 * 연차 종류 한글 매핑
 */
export const LEAVE_TYPE_NAMES: Record<LeaveTypeCode, string> = {
  annual: '연차',
  half_day: '반차',
  sick: '병가',
  family_event: '경조사',
  compensatory: '대체휴가',
  unpaid: '무급휴가',
};

/**
 * 연차 신청 상태 한글 매핑
 */
export const LEAVE_STATUS_NAMES: Record<LeaveRequestStatus, string> = {
  pending: '승인 대기',
  approved: '승인 완료',
  rejected: '반려',
  cancelled: '취소',
  withdrawn: '철회',
};

/**
 * 연차 신청 상태 색상 매핑 (Tailwind CSS)
 */
export const LEAVE_STATUS_COLORS: Record<LeaveRequestStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  withdrawn: 'bg-gray-100 text-gray-800',
};

/**
 * 반차 타입 한글 매핑
 */
export const HALF_DAY_TYPE_NAMES: Record<HalfDayType, string> = {
  AM: '오전',
  PM: '오후',
};

/**
 * 승인 액션 한글 매핑
 */
export const APPROVAL_ACTION_NAMES: Record<ApprovalAction, string> = {
  approved: '승인',
  rejected: '반려',
  forwarded: '전달',
};

/**
 * 기본 연차 종류 색상
 */
export const DEFAULT_LEAVE_TYPE_COLORS: Record<LeaveTypeCode, string> = {
  annual: '#3B82F6', // 파랑
  half_day: '#10B981', // 초록
  sick: '#F59E0B', // 주황
  family_event: '#8B5CF6', // 보라
  compensatory: '#06B6D4', // 청록
  unpaid: '#6B7280', // 회색
};
