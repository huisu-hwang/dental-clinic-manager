// ============================================
// 출퇴근 관리 시스템 타입 정의
// Attendance Management System Types
// ============================================

/**
 * 근무 스케줄
 * Work Schedule
 */
export interface WorkSchedule {
  id: string;
  user_id: string;
  clinic_id: string;
  day_of_week: number; // 0=일요일, 1=월요일, ..., 6=토요일
  start_time: string; // HH:MM:SS 형식 (예: "09:00:00")
  end_time: string; // HH:MM:SS 형식 (예: "18:00:00")
  is_work_day: boolean; // 근무일 여부 (false면 휴무)
  effective_from: string; // YYYY-MM-DD 형식
  effective_until?: string | null; // YYYY-MM-DD 형식 (null이면 무기한)
  created_at: string;
  updated_at: string;
  created_by?: string;
}

/**
 * 근무 스케줄 생성/수정 DTO
 */
export interface WorkScheduleInput {
  user_id: string;
  clinic_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_work_day: boolean;
  effective_from: string;
  effective_until?: string | null;
}

/**
 * 주간 스케줄 (일주일 전체)
 */
export interface WeeklySchedule {
  user_id: string;
  schedules: WorkSchedule[];
}

/**
 * QR 코드
 * Attendance QR Code
 */
export interface AttendanceQRCode {
  id: string;
  clinic_id: string;
  qr_code: string; // QR 코드 값 (UUID)
  valid_date: string; // YYYY-MM-DD 형식
  latitude?: number | null; // 병원 위도
  longitude?: number | null; // 병원 경도
  radius_meters: number; // 인증 허용 반경 (미터)
  is_active: boolean;
  created_at: string;
  expires_at: string;
}

/**
 * QR 코드 생성 DTO
 */
export interface QRCodeGenerateInput {
  clinic_id: string;
  latitude?: number;
  longitude?: number;
  radius_meters?: number;
}

/**
 * QR 코드 검증 요청
 */
export interface QRCodeValidationRequest {
  qr_code: string;
  user_id: string;
  latitude?: number;
  longitude?: number;
  device_info?: string;
}

/**
 * QR 코드 검증 결과
 */
export interface QRCodeValidationResult {
  is_valid: boolean;
  error_message?: string;
  clinic_id?: string;
  distance_meters?: number;
}

/**
 * 출퇴근 기록
 * Attendance Record
 */
export interface AttendanceRecord {
  id: string;
  user_id: string;
  clinic_id: string;
  work_date: string; // YYYY-MM-DD 형식

  // 출근 정보
  check_in_time?: string | null; // ISO 8601 형식
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  check_in_device_info?: string | null;

  // 퇴근 정보
  check_out_time?: string | null; // ISO 8601 형식
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_device_info?: string | null;

  // 예정 시간
  scheduled_start?: string | null; // HH:MM:SS 형식
  scheduled_end?: string | null; // HH:MM:SS 형식

  // 근태 계산 결과
  late_minutes: number; // 지각 시간 (분)
  early_leave_minutes: number; // 조퇴 시간 (분)
  overtime_minutes: number; // 초과근무 시간 (분)
  total_work_minutes?: number | null; // 총 근무 시간 (분)

  // 근태 상태
  status: AttendanceStatus;

  // 기타
  notes?: string | null;
  is_manually_edited: boolean;
  edited_by?: string | null;
  edited_at?: string | null;

  created_at: string;
  updated_at: string;
}

/**
 * 근태 상태
 */
export type AttendanceStatus =
  | 'present' // 정상 출근
  | 'late' // 지각
  | 'early_leave' // 조퇴
  | 'absent' // 결근
  | 'leave' // 연차
  | 'holiday'; // 공휴일

/**
 * 출근 체크 요청
 */
export interface CheckInRequest {
  user_id: string;
  qr_code: string;
  work_date: string;
  latitude?: number;
  longitude?: number;
  device_info?: string;
}

/**
 * 퇴근 체크 요청
 */
export interface CheckOutRequest {
  user_id: string;
  qr_code: string;
  work_date: string;
  latitude?: number;
  longitude?: number;
  device_info?: string;
}

/**
 * 출퇴근 체크 응답
 */
export interface AttendanceCheckResponse {
  success: boolean;
  message: string;
  record?: AttendanceRecord;
  error?: string;
}

/**
 * 근태 통계
 * Attendance Statistics
 */
export interface AttendanceStatistics {
  id: string;
  user_id: string;
  clinic_id: string;
  year: number;
  month: number;

  // 근무 일수
  total_work_days: number; // 총 근무 예정일수
  present_days: number; // 출근 일수
  absent_days: number; // 결근 일수
  leave_days: number; // 연차 사용 일수
  holiday_days: number; // 공휴일 일수

  // 지각 통계
  late_count: number; // 지각 횟수
  total_late_minutes: number; // 총 지각 시간 (분)
  avg_late_minutes: number; // 평균 지각 시간 (분)

  // 조퇴 통계
  early_leave_count: number; // 조퇴 횟수
  total_early_leave_minutes: number; // 총 조퇴 시간 (분)
  avg_early_leave_minutes: number; // 평균 조퇴 시간 (분)

  // 초과근무 통계
  overtime_count: number; // 초과근무 횟수
  total_overtime_minutes: number; // 총 초과근무 시간 (분)
  avg_overtime_minutes: number; // 평균 초과근무 시간 (분)

  // 근무 시간 통계
  total_work_minutes: number; // 총 근무 시간 (분)
  avg_work_minutes_per_day: number; // 일평균 근무 시간 (분)

  // 출근율
  attendance_rate: number; // 출근율 (%)

  last_calculated_at: string;
  created_at: string;
  updated_at: string;
}

/**
 * 근태 통계 요약 (UI 표시용)
 */
export interface AttendanceStatisticsSummary {
  user_id: string;
  user_name: string;
  year: number;
  month: number;
  attendance_rate: number;
  present_days: number;
  total_work_days: number;
  late_count: number;
  early_leave_count: number;
  overtime_hours: number; // 시간 단위로 변환
  total_work_hours: number; // 시간 단위로 변환
}

/**
 * 월별 근태 조회 필터
 */
export interface AttendanceFilter {
  clinic_id: string;
  user_id?: string; // 특정 사용자 (없으면 전체)
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  status?: AttendanceStatus; // 특정 상태 필터
}

/**
 * 근태 조회 응답 (페이지네이션)
 */
export interface AttendanceRecordsResponse {
  records: AttendanceRecord[];
  total_count: number;
  page: number;
  page_size: number;
  has_more: boolean;
}

/**
 * 근태 캘린더 데이터
 */
export interface AttendanceCalendarData {
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  check_in_time?: string | null;
  check_out_time?: string | null;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  total_work_minutes?: number | null;
}

/**
 * 근태 대시보드 데이터
 */
export interface AttendanceDashboard {
  user: {
    id: string;
    name: string;
  };
  today: {
    date: string;
    status: AttendanceStatus;
    check_in_time?: string | null;
    check_out_time?: string | null;
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    current_work_minutes?: number;
    is_late: boolean;
  };
  monthly_stats: AttendanceStatistics;
  recent_records: AttendanceRecord[];
}

/**
 * 팀 출근 현황 (관리자용)
 */
export interface TeamAttendanceStatus {
  date: string;
  total_employees: number;
  checked_in: number;
  not_checked_in: number;
  on_leave: number;
  late_count: number;
  employees: {
    user_id: string;
    user_name: string;
    status: AttendanceStatus;
    check_in_time?: string | null;
    scheduled_start?: string | null;
    late_minutes: number;
  }[];
}

/**
 * 위치 정보
 */
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number; // 정확도 (미터)
  timestamp?: string;
}

/**
 * 근태 수정 요청 (관리자용)
 */
export interface AttendanceEditRequest {
  record_id: string;
  check_in_time?: string;
  check_out_time?: string;
  status?: AttendanceStatus;
  notes?: string;
  edited_by: string;
}

/**
 * 근태 보고서 (Excel/PDF 출력용)
 */
export interface AttendanceReport {
  clinic_name: string;
  report_period: {
    start_date: string;
    end_date: string;
  };
  generated_at: string;
  generated_by: string;
  employees: {
    user_id: string;
    user_name: string;
    role: string;
    statistics: AttendanceStatistics;
    records: AttendanceRecord[];
  }[];
  summary: {
    total_employees: number;
    average_attendance_rate: number;
    total_late_count: number;
    total_early_leave_count: number;
    total_overtime_hours: number;
  };
}

/**
 * 근태 이상 알림 (관리자용)
 */
export interface AttendanceAlert {
  id: string;
  user_id: string;
  user_name: string;
  alert_type: 'frequent_late' | 'frequent_absent' | 'no_checkout' | 'excessive_overtime';
  severity: 'low' | 'medium' | 'high';
  message: string;
  data: Record<string, any>;
  created_at: string;
  is_read: boolean;
}

/**
 * 시간 형식 유틸리티 타입
 */
export interface TimeRange {
  start: string; // HH:MM 형식
  end: string; // HH:MM 형식
}

/**
 * 근태 계산 결과
 */
export interface AttendanceCalculationResult {
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  total_work_minutes: number;
  status: AttendanceStatus;
}

/**
 * 요일 한글 매핑
 */
export const DAY_OF_WEEK_NAMES: Record<number, string> = {
  0: '일요일',
  1: '월요일',
  2: '화요일',
  3: '수요일',
  4: '목요일',
  5: '금요일',
  6: '토요일',
};

/**
 * 요일 약자 한글 매핑
 */
export const DAY_OF_WEEK_SHORT_NAMES: Record<number, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토',
};

/**
 * 근태 상태 한글 매핑
 */
export const ATTENDANCE_STATUS_NAMES: Record<AttendanceStatus, string> = {
  present: '정상출근',
  late: '지각',
  early_leave: '조퇴',
  absent: '결근',
  leave: '연차',
  holiday: '공휴일',
};

/**
 * 근태 상태 색상 매핑 (Tailwind CSS)
 */
export const ATTENDANCE_STATUS_COLORS: Record<AttendanceStatus, string> = {
  present: 'bg-green-100 text-green-800',
  late: 'bg-yellow-100 text-yellow-800',
  early_leave: 'bg-orange-100 text-orange-800',
  absent: 'bg-red-100 text-red-800',
  leave: 'bg-blue-100 text-blue-800',
  holiday: 'bg-gray-100 text-gray-800',
};
