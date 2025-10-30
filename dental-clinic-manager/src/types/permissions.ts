// 기능별 권한 타입
export type Permission =
  | 'daily_report_view'      // 일일 보고서 보기
  | 'daily_report_create'    // 일일 보고서 작성
  | 'daily_report_edit'      // 일일 보고서 수정
  | 'daily_report_delete'    // 일일 보고서 삭제
  | 'stats_weekly_view'      // 주간 통계 보기
  | 'stats_monthly_view'     // 월간 통계 보기
  | 'stats_annual_view'      // 연간 통계 보기
  | 'logs_view'              // 상세 기록 보기
  | 'inventory_view'         // 재고 관리 보기
  | 'inventory_manage'       // 재고 관리 수정
  | 'staff_view'             // 직원 목록 보기
  | 'staff_manage'           // 직원 관리 (승인/거절/권한 수정)
  | 'clinic_settings'        // 병원 설정 관리
  | 'guide_view'             // 사용 안내 보기
  | 'protocol_view'          // 진료 프로토콜 조회
  | 'protocol_create'        // 진료 프로토콜 생성
  | 'protocol_edit'          // 진료 프로토콜 수정
  | 'protocol_delete'        // 진료 프로토콜 삭제
  | 'protocol_version_restore' // 프로토콜 버전 복원
  | 'protocol_history_view'  // 프로토콜 히스토리 조회
  | 'protocol_category_manage' // 프로토콜 카테고리 관리
  // 출퇴근 관리 권한
  | 'attendance_check_in'    // 본인 출퇴근 체크
  | 'attendance_view_own'    // 본인 근태 기록 조회
  | 'attendance_view_all'    // 전체 직원 근태 조회
  | 'attendance_manage'      // 근태 기록 수정/삭제 (관리자)
  | 'attendance_stats_view'  // 근태 통계 조회
  | 'schedule_view_own'      // 본인 스케줄 조회
  | 'schedule_view_all'      // 전체 스케줄 조회
  | 'schedule_manage'        // 스케줄 설정/수정 (관리자)
  | 'qr_code_view'           // QR 코드 조회
  | 'qr_code_manage'         // QR 코드 생성/관리 (관리자)
  // 연차 관리 권한
  | 'leave_request_create'   // 연차 신청
  | 'leave_request_view_own' // 본인 연차 조회
  | 'leave_request_view_all' // 전체 연차 조회
  | 'leave_request_cancel'   // 본인 연차 취소
  | 'leave_approve_step1'    // 1단계 승인 (실장 등)
  | 'leave_approve_step2'    // 2단계 승인 (원장)
  | 'leave_approve_final'    // 최종 승인 (원장)
  | 'leave_policy_view'      // 연차 정책 조회
  | 'leave_policy_manage'    // 연차 정책 관리 (관리자)
  | 'leave_balance_view_own' // 본인 연차 잔여 조회
  | 'leave_balance_view_all' // 전체 연차 잔여 조회
  | 'leave_balance_manage'   // 연차 잔여 수동 조정 (관리자)
  | 'leave_workflow_manage'  // 승인 프로세스 관리 (관리자)
  | 'leave_type_manage'      // 연차 종류 관리 (관리자)

// 역할별 기본 권한 설정
export const DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    // 대표원장은 모든 권한
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'staff_manage', 'clinic_settings', 'guide_view',
    'protocol_view', 'protocol_create', 'protocol_edit', 'protocol_delete',
    'protocol_version_restore', 'protocol_history_view', 'protocol_category_manage',
    // 출퇴근 관리 (모든 권한)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all', 'attendance_manage',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all', 'schedule_manage',
    'qr_code_view', 'qr_code_manage',
    // 연차 관리 (모든 권한)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_approve_step1', 'leave_approve_step2', 'leave_approve_final',
    'leave_policy_view', 'leave_policy_manage',
    'leave_balance_view_own', 'leave_balance_view_all', 'leave_balance_manage',
    'leave_workflow_manage', 'leave_type_manage'
  ],
  vice_director: [
    // 부원장은 직원 관리와 병원 설정, 프로토콜 삭제 제외한 모든 권한
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'guide_view',
    'protocol_view', 'protocol_create', 'protocol_edit',
    'protocol_version_restore', 'protocol_history_view', 'protocol_category_manage',
    // 출퇴근 관리 (관리 권한 일부)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all', 'schedule_manage',
    'qr_code_view', 'qr_code_manage',
    // 연차 관리 (최종 승인 제외)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_approve_step1', 'leave_approve_step2',
    'leave_policy_view',
    'leave_balance_view_own', 'leave_balance_view_all'
  ],
  manager: [
    // 실장은 프로토콜 조회와 히스토리, 1차 승인만 가능
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'guide_view',
    'protocol_view', 'protocol_history_view',
    // 출퇴근 관리 (조회 및 본인 체크)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all',
    'qr_code_view',
    // 연차 관리 (1차 승인)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_approve_step1',
    'leave_policy_view',
    'leave_balance_view_own', 'leave_balance_view_all'
  ],
  team_leader: [
    // 팀장은 프로토콜 조회와 히스토리만 가능, 자신의 계약서 조회 및 서명만 가능
    'daily_report_view', 'daily_report_create', 'daily_report_edit',
    'stats_weekly_view', 'stats_monthly_view',
    'logs_view', 'inventory_view', 'guide_view',
    'protocol_view', 'protocol_history_view',
    // 출퇴근 관리 (본인 및 팀 조회)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all',
    'qr_code_view',
    // 연차 관리 (신청 및 조회)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_policy_view',
    'leave_balance_view_own', 'leave_balance_view_all'
  ],
  staff: [
    // 일반 직원은 프로토콜 조회, 본인 출퇴근, 본인 연차만 가능
    'daily_report_view', 'daily_report_create',
    'stats_weekly_view',
    'inventory_view', 'guide_view',
    'protocol_view',
    // 출퇴근 관리 (본인만)
    'attendance_check_in', 'attendance_view_own',
    'schedule_view_own',
    'qr_code_view',
    // 연차 관리 (본인만)
    'leave_request_create', 'leave_request_view_own', 'leave_request_cancel',
    'leave_policy_view',
    'leave_balance_view_own'
  ]
}

// 권한 그룹 정의 (UI 표시용)
export const PERMISSION_GROUPS = {
  '일일 보고서': [
    { key: 'daily_report_view', label: '보고서 보기' },
    { key: 'daily_report_create', label: '보고서 작성' },
    { key: 'daily_report_edit', label: '보고서 수정' },
    { key: 'daily_report_delete', label: '보고서 삭제' }
  ],
  '통계': [
    { key: 'stats_weekly_view', label: '주간 통계 보기' },
    { key: 'stats_monthly_view', label: '월간 통계 보기' },
    { key: 'stats_annual_view', label: '연간 통계 보기' }
  ],
  '기록 및 재고': [
    { key: 'logs_view', label: '상세 기록 보기' },
    { key: 'inventory_view', label: '재고 현황 보기' },
    { key: 'inventory_manage', label: '재고 관리' }
  ],
  '직원 관리': [
    { key: 'staff_view', label: '직원 목록 보기' },
    { key: 'staff_manage', label: '직원 관리 (승인/권한)' }
  ],
  '병원 설정': [
    { key: 'clinic_settings', label: '병원 정보 관리' }
  ],
  '진료 프로토콜': [
    { key: 'protocol_view', label: '프로토콜 조회' },
    { key: 'protocol_create', label: '프로토콜 생성' },
    { key: 'protocol_edit', label: '프로토콜 수정' },
    { key: 'protocol_delete', label: '프로토콜 삭제' },
    { key: 'protocol_version_restore', label: '버전 복원' },
    { key: 'protocol_history_view', label: '히스토리 조회' },
    { key: 'protocol_category_manage', label: '카테고리 관리' }
  ],
  '출퇴근 관리': [
    { key: 'attendance_check_in', label: '출퇴근 체크' },
    { key: 'attendance_view_own', label: '본인 근태 조회' },
    { key: 'attendance_view_all', label: '전체 근태 조회' },
    { key: 'attendance_manage', label: '근태 기록 관리' },
    { key: 'attendance_stats_view', label: '근태 통계 조회' },
    { key: 'schedule_view_own', label: '본인 스케줄 조회' },
    { key: 'schedule_view_all', label: '전체 스케줄 조회' },
    { key: 'schedule_manage', label: '스케줄 관리' },
    { key: 'qr_code_view', label: 'QR 코드 조회' },
    { key: 'qr_code_manage', label: 'QR 코드 관리' }
  ],
  '연차 관리': [
    { key: 'leave_request_create', label: '연차 신청' },
    { key: 'leave_request_view_own', label: '본인 연차 조회' },
    { key: 'leave_request_view_all', label: '전체 연차 조회' },
    { key: 'leave_request_cancel', label: '연차 취소' },
    { key: 'leave_approve_step1', label: '1단계 승인' },
    { key: 'leave_approve_step2', label: '2단계 승인' },
    { key: 'leave_approve_final', label: '최종 승인' },
    { key: 'leave_policy_view', label: '연차 정책 조회' },
    { key: 'leave_policy_manage', label: '연차 정책 관리' },
    { key: 'leave_balance_view_own', label: '본인 연차 잔여 조회' },
    { key: 'leave_balance_view_all', label: '전체 연차 잔여 조회' },
    { key: 'leave_balance_manage', label: '연차 잔여 관리' },
    { key: 'leave_workflow_manage', label: '승인 프로세스 관리' },
    { key: 'leave_type_manage', label: '연차 종류 관리' }
  ],
  '기타': [
    { key: 'guide_view', label: '사용 안내 보기' }
  ]
}

// 권한 설명
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  'daily_report_view': '일일 보고서를 조회할 수 있습니다.',
  'daily_report_create': '새로운 일일 보고서를 작성할 수 있습니다.',
  'daily_report_edit': '기존 일일 보고서를 수정할 수 있습니다.',
  'daily_report_delete': '일일 보고서를 삭제할 수 있습니다.',
  'stats_weekly_view': '주간 통계를 조회할 수 있습니다.',
  'stats_monthly_view': '월간 통계를 조회할 수 있습니다.',
  'stats_annual_view': '연간 통계를 조회할 수 있습니다.',
  'logs_view': '상세 기록을 조회할 수 있습니다.',
  'inventory_view': '재고 현황을 조회할 수 있습니다.',
  'inventory_manage': '재고를 추가/수정/삭제할 수 있습니다.',
  'staff_view': '직원 목록을 조회할 수 있습니다.',
  'staff_manage': '직원 가입 승인 및 권한을 관리할 수 있습니다.',
  'clinic_settings': '병원 정보를 수정할 수 있습니다.',
  'guide_view': '사용 안내를 볼 수 있습니다.',
  'protocol_view': '진료 프로토콜을 조회할 수 있습니다.',
  'protocol_create': '새로운 진료 프로토콜을 생성할 수 있습니다.',
  'protocol_edit': '기존 진료 프로토콜을 수정할 수 있습니다.',
  'protocol_delete': '진료 프로토콜을 삭제할 수 있습니다.',
  'protocol_version_restore': '이전 버전의 프로토콜로 복원할 수 있습니다.',
  'protocol_history_view': '프로토콜 변경 히스토리를 조회할 수 있습니다.',
  'protocol_category_manage': '프로토콜 카테고리를 관리할 수 있습니다.',
  // 출퇴근 관리 권한 설명
  'attendance_check_in': 'QR 코드를 스캔하여 출퇴근 체크를 할 수 있습니다.',
  'attendance_view_own': '본인의 출퇴근 기록을 조회할 수 있습니다.',
  'attendance_view_all': '전체 직원의 출퇴근 기록을 조회할 수 있습니다.',
  'attendance_manage': '출퇴근 기록을 수정하거나 삭제할 수 있습니다.',
  'attendance_stats_view': '근태 통계를 조회할 수 있습니다.',
  'schedule_view_own': '본인의 근무 스케줄을 조회할 수 있습니다.',
  'schedule_view_all': '전체 직원의 근무 스케줄을 조회할 수 있습니다.',
  'schedule_manage': '직원의 근무 스케줄을 설정하고 수정할 수 있습니다.',
  'qr_code_view': '출퇴근 인증용 QR 코드를 조회할 수 있습니다.',
  'qr_code_manage': 'QR 코드를 생성하고 관리할 수 있습니다.',
  // 연차 관리 권한 설명
  'leave_request_create': '연차를 신청할 수 있습니다.',
  'leave_request_view_own': '본인의 연차 신청 내역을 조회할 수 있습니다.',
  'leave_request_view_all': '전체 직원의 연차 신청 내역을 조회할 수 있습니다.',
  'leave_request_cancel': '본인이 신청한 연차를 취소할 수 있습니다.',
  'leave_approve_step1': '연차 신청의 1단계 승인을 할 수 있습니다.',
  'leave_approve_step2': '연차 신청의 2단계 승인을 할 수 있습니다.',
  'leave_approve_final': '연차 신청의 최종 승인을 할 수 있습니다.',
  'leave_policy_view': '연차 정책을 조회할 수 있습니다.',
  'leave_policy_manage': '연차 정책을 생성하고 수정할 수 있습니다.',
  'leave_balance_view_own': '본인의 연차 잔여 현황을 조회할 수 있습니다.',
  'leave_balance_view_all': '전체 직원의 연차 잔여 현황을 조회할 수 있습니다.',
  'leave_balance_manage': '직원의 연차 잔여를 수동으로 조정할 수 있습니다.',
  'leave_workflow_manage': '연차 승인 프로세스를 설정하고 관리할 수 있습니다.',
  'leave_type_manage': '연차 종류를 추가하고 관리할 수 있습니다.'
}