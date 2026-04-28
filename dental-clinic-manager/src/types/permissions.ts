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
  // 근로계약서 관리 권한
  | 'contract_view'          // 본인 근로계약서 조회 (모든 직원 기본 보유)
  | 'contract_view_all'      // 전체 직원 근로계약서 조회 (대표원장이 위임 가능)
  | 'contract_create'        // 계약서 생성
  | 'contract_edit'          // 계약서 수정
  | 'contract_delete'        // 계약서 삭제
  | 'contract_template_manage' // 계약서 템플릿 관리
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
  // 알림 관리 권한
  | 'notification_view'      // 알림 조회
  | 'notification_manage'    // 알림 생성/수정/삭제
  // 업체 연락처 관리 권한
  | 'vendor_contacts_view'   // 업체 연락처 조회
  | 'vendor_contacts_create' // 업체 연락처 생성
  | 'vendor_contacts_edit'   // 업체 연락처 수정
  | 'vendor_contacts_delete' // 업체 연락처 삭제
  | 'vendor_contacts_import' // 업체 연락처 일괄 등록
  // 급여 명세서 권한
  | 'payroll_view'            // 본인 급여 명세서 조회
  | 'payroll_manage'          // 급여 설정 및 전체 직원 급여 관리 (원장)
  // 업무 체크리스트 권한
  | 'task_checklist_view'     // 본인 업무 체크리스트 조회/체크
  | 'task_checklist_manage'   // 업무 체크리스트 템플릿 생성/수정 (실장)
  | 'task_checklist_approve'  // 업무 체크리스트 결재 (원장)
  | 'task_checklist_view_all' // 전체 직원 체크리스트 현황 조회
  // 업무 지시 권한
  | 'task_directive_view'     // 업무 지시 조회
  | 'task_directive_create'   // 업무 지시 생성
  | 'task_directive_manage'   // 업무 지시 관리(수정/삭제/할당)
  // 병원 게시판 권한
  | 'bulletin_view'           // 병원 게시판 조회
  | 'bulletin_manage'         // 병원 게시판 관리(작성/수정/삭제)
  // 커뮤니티 권한
  | 'community_view'          // 자유게시판/소모임 조회
  | 'community_post'          // 자유게시판/소모임 게시글/댓글 작성
  | 'community_manage'        // 자유게시판/소모임 관리(수정/삭제/모임 운영)
  // 리콜 관리 권한
  | 'recall_view'             // 리콜 관리 조회
  | 'recall_manage'           // 리콜 관리 캠페인/처리
  // AI 데이터 분석 권한
  | 'ai_analysis_view'        // AI 데이터 분석 조회
  // 경영 현황 권한
  | 'financial_view'          // 경영 현황 조회
  | 'financial_manage'        // 경영 현황 입력/수정
  // 마케팅 자동화 권한
  | 'marketing_view'          // 마케팅 자동화 조회
  | 'marketing_manage'        // 마케팅 자동화 발행/관리
  // 주식 자동매매 권한
  | 'investment_view'         // 주식 자동매매 조회
  | 'investment_manage'       // 주식 자동매매 전략/주문 관리

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
    // 근로계약서 관리 (모든 권한)
    'contract_view', 'contract_view_all', 'contract_create', 'contract_edit', 'contract_delete', 'contract_template_manage',
    // 출퇴근 관리 (모든 권한)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all', 'attendance_manage',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all', 'schedule_manage',
    'qr_code_view', 'qr_code_manage',
    // 연차 관리 (모든 권한)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_approve_step1', 'leave_approve_step2', 'leave_approve_final',
    'leave_policy_view', 'leave_policy_manage',
    'leave_balance_view_own', 'leave_balance_view_all', 'leave_balance_manage',
    'leave_workflow_manage', 'leave_type_manage',
    // 알림 관리 (모든 권한)
    'notification_view', 'notification_manage',
    // 업체 연락처 관리 (모든 권한)
    'vendor_contacts_view', 'vendor_contacts_create', 'vendor_contacts_edit', 'vendor_contacts_delete', 'vendor_contacts_import',
    // 급여 명세서 (모든 권한)
    'payroll_view', 'payroll_manage',
    // 업무 체크리스트 (모든 권한)
    'task_checklist_view', 'task_checklist_manage', 'task_checklist_approve', 'task_checklist_view_all',
    // 업무 지시 (모든 권한)
    'task_directive_view', 'task_directive_create', 'task_directive_manage',
    // 병원 게시판 (모든 권한)
    'bulletin_view', 'bulletin_manage',
    // 커뮤니티 (모든 권한)
    'community_view', 'community_post', 'community_manage',
    // 리콜 관리 (모든 권한)
    'recall_view', 'recall_manage',
    // AI 데이터 분석
    'ai_analysis_view',
    // 경영 현황 (모든 권한)
    'financial_view', 'financial_manage',
    // 마케팅 자동화 (모든 권한)
    'marketing_view', 'marketing_manage',
    // 주식 자동매매 (모든 권한)
    'investment_view', 'investment_manage'
  ],
  vice_director: [
    // 부원장은 직원 관리와 병원 설정, 프로토콜 삭제 제외한 모든 권한
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'guide_view',
    'protocol_view', 'protocol_create', 'protocol_edit',
    'protocol_version_restore', 'protocol_history_view', 'protocol_category_manage',
    // 근로계약서 관리 (삭제 제외)
    'contract_view', 'contract_create', 'contract_edit', 'contract_template_manage',
    // 출퇴근 관리 (관리 권한 일부)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all', 'schedule_manage',
    'qr_code_view', 'qr_code_manage',
    // 연차 관리 (최종 승인 제외)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_approve_step1', 'leave_approve_step2',
    'leave_policy_view',
    'leave_balance_view_own', 'leave_balance_view_all',
    // 알림 조회
    'notification_view',
    // 업체 연락처 관리 (삭제, 일괄 등록 제외)
    'vendor_contacts_view', 'vendor_contacts_create', 'vendor_contacts_edit',
    // 급여 명세서 (본인 조회)
    'payroll_view',
    // 업무 체크리스트 (본인 체크만 - 직원과 동일)
    'task_checklist_view',
    // 업무 지시 (조회/생성/관리)
    'task_directive_view', 'task_directive_create', 'task_directive_manage',
    // 병원 게시판 (조회/관리)
    'bulletin_view', 'bulletin_manage',
    // 커뮤니티 (조회/작성)
    'community_view', 'community_post',
    // 리콜 관리 (조회/관리)
    'recall_view', 'recall_manage',
    // AI 데이터 분석 (조회)
    'ai_analysis_view',
    // 경영 현황 (조회)
    'financial_view',
    // 마케팅 자동화 (조회)
    'marketing_view'
  ],
  manager: [
    // 실장은 프로토콜 조회와 히스토리, 1차 승인만 가능
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'guide_view',
    'protocol_view', 'protocol_history_view',
    // 근로계약서 관리 (조회만)
    'contract_view',
    // 출퇴근 관리 (조회 및 본인 체크)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all',
    'qr_code_view',
    // 연차 관리 (1차 승인)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_approve_step1',
    'leave_policy_view',
    'leave_balance_view_own', 'leave_balance_view_all',
    // 업체 연락처 관리 (조회, 생성, 수정)
    'vendor_contacts_view', 'vendor_contacts_create', 'vendor_contacts_edit',
    // 급여 명세서 (본인 조회)
    'payroll_view',
    // 업무 체크리스트 (관리 및 전체 현황 - 실장은 템플릿 생성/수정 가능)
    'task_checklist_view', 'task_checklist_manage', 'task_checklist_view_all',
    // 업무 지시 (조회/생성/관리)
    'task_directive_view', 'task_directive_create', 'task_directive_manage',
    // 병원 게시판 (조회/관리)
    'bulletin_view', 'bulletin_manage',
    // 커뮤니티 (조회/작성)
    'community_view', 'community_post',
    // 리콜 관리 (조회/관리)
    'recall_view', 'recall_manage'
  ],
  team_leader: [
    // 팀장은 프로토콜 조회와 히스토리만 가능, 자신의 계약서 조회 및 서명만 가능
    'daily_report_view', 'daily_report_create', 'daily_report_edit',
    'stats_weekly_view', 'stats_monthly_view',
    'logs_view', 'inventory_view', 'guide_view',
    'protocol_view', 'protocol_history_view',
    // 근로계약서 관리 (본인 것만 조회)
    'contract_view',
    // 출퇴근 관리 (본인 및 팀 조회)
    'attendance_check_in', 'attendance_view_own', 'attendance_view_all',
    'attendance_stats_view', 'schedule_view_own', 'schedule_view_all',
    'qr_code_view',
    // 연차 관리 (신청 및 조회)
    'leave_request_create', 'leave_request_view_own', 'leave_request_view_all', 'leave_request_cancel',
    'leave_policy_view',
    'leave_balance_view_own', 'leave_balance_view_all',
    // 업체 연락처 관리 (조회, 생성)
    'vendor_contacts_view', 'vendor_contacts_create',
    // 급여 명세서 (본인 조회)
    'payroll_view',
    // 업무 체크리스트 (본인 체크만)
    'task_checklist_view',
    // 업무 지시 (조회)
    'task_directive_view',
    // 병원 게시판 (조회)
    'bulletin_view',
    // 커뮤니티 (조회/작성)
    'community_view', 'community_post',
    // 리콜 관리 (조회)
    'recall_view'
  ],
  staff: [
    // 일반 직원은 프로토콜 조회, 본인 출퇴근, 본인 연차만 가능
    'daily_report_view', 'daily_report_create',
    'stats_weekly_view',
    'inventory_view', 'guide_view',
    'protocol_view',
    // 근로계약서 관리 (본인 것만)
    'contract_view',
    // 출퇴근 관리 (본인만)
    'attendance_check_in', 'attendance_view_own',
    'schedule_view_own',
    'qr_code_view',
    // 연차 관리 (본인만)
    'leave_request_create', 'leave_request_view_own', 'leave_request_cancel',
    'leave_policy_view',
    'leave_balance_view_own',
    // 업체 연락처 관리 (조회만)
    'vendor_contacts_view',
    // 급여 명세서 (본인 조회)
    'payroll_view',
    // 업무 체크리스트 (본인 체크만)
    'task_checklist_view',
    // 업무 지시 (조회)
    'task_directive_view',
    // 병원 게시판 (조회)
    'bulletin_view',
    // 커뮤니티 (조회/작성)
    'community_view', 'community_post',
    // 리콜 관리 (조회)
    'recall_view'
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
  '근로계약서': [
    { key: 'contract_view', label: '본인 근로계약서 조회' },
    { key: 'contract_view_all', label: '전체 직원 근로계약서 조회' },
    { key: 'contract_create', label: '계약서 생성' },
    { key: 'contract_edit', label: '계약서 수정' },
    { key: 'contract_delete', label: '계약서 삭제' },
    { key: 'contract_template_manage', label: '템플릿 관리' }
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
  '알림 관리': [
    { key: 'notification_view', label: '알림 조회' },
    { key: 'notification_manage', label: '알림 관리' }
  ],
  '업체 연락처': [
    { key: 'vendor_contacts_view', label: '연락처 조회' },
    { key: 'vendor_contacts_create', label: '연락처 생성' },
    { key: 'vendor_contacts_edit', label: '연락처 수정' },
    { key: 'vendor_contacts_delete', label: '연락처 삭제' },
    { key: 'vendor_contacts_import', label: '일괄 등록' }
  ],
  '급여 명세서': [
    { key: 'payroll_view', label: '본인 급여 명세서 조회' },
    { key: 'payroll_manage', label: '급여 설정 및 관리' }
  ],
  '업무 체크리스트': [
    { key: 'task_checklist_view', label: '본인 체크리스트 조회' },
    { key: 'task_checklist_manage', label: '체크리스트 관리' },
    { key: 'task_checklist_approve', label: '체크리스트 결재' },
    { key: 'task_checklist_view_all', label: '전체 현황 조회' }
  ],
  '업무 지시': [
    { key: 'task_directive_view', label: '업무 지시 조회' },
    { key: 'task_directive_create', label: '업무 지시 생성' },
    { key: 'task_directive_manage', label: '업무 지시 관리(수정/삭제/할당)' }
  ],
  '병원 게시판': [
    { key: 'bulletin_view', label: '병원 게시판 조회' },
    { key: 'bulletin_manage', label: '게시판 관리(작성/수정/삭제)' }
  ],
  '커뮤니티(자유게시판/소모임)': [
    { key: 'community_view', label: '커뮤니티 조회' },
    { key: 'community_post', label: '게시글/댓글 작성' },
    { key: 'community_manage', label: '커뮤니티 관리(수정/삭제/모임 운영)' }
  ],
  '리콜 관리': [
    { key: 'recall_view', label: '리콜 관리 조회' },
    { key: 'recall_manage', label: '리콜 캠페인/처리 관리' }
  ],
  'AI 데이터 분석': [
    { key: 'ai_analysis_view', label: 'AI 데이터 분석 조회' }
  ],
  '경영 현황': [
    { key: 'financial_view', label: '경영 현황 조회' },
    { key: 'financial_manage', label: '경영 현황 입력/수정' }
  ],
  '마케팅 자동화': [
    { key: 'marketing_view', label: '마케팅 자동화 조회' },
    { key: 'marketing_manage', label: '마케팅 발행/관리' }
  ],
  '주식 자동매매': [
    { key: 'investment_view', label: '주식 자동매매 조회' },
    { key: 'investment_manage', label: '전략/주문 관리' }
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
  // 근로계약서 관리 권한 설명
  'contract_view': '본인의 근로계약서를 조회할 수 있습니다. (모든 직원 기본 보유)',
  'contract_view_all': '전체 직원의 근로계약서를 조회할 수 있습니다. (대표원장이 위임)',
  'contract_create': '새로운 근로계약서를 생성할 수 있습니다.',
  'contract_edit': '근로계약서를 수정할 수 있습니다.',
  'contract_delete': '근로계약서를 삭제할 수 있습니다.',
  'contract_template_manage': '계약서 템플릿을 관리할 수 있습니다.',
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
  'leave_type_manage': '연차 종류를 추가하고 관리할 수 있습니다.',
  // 알림 관리 권한 설명
  'notification_view': '병원 알림을 조회할 수 있습니다.',
  'notification_manage': '병원 알림을 생성, 수정, 삭제할 수 있습니다.',
  // 업체 연락처 관리 권한 설명
  'vendor_contacts_view': '업체 연락처를 조회할 수 있습니다.',
  'vendor_contacts_create': '새로운 업체 연락처를 등록할 수 있습니다.',
  'vendor_contacts_edit': '업체 연락처 정보를 수정할 수 있습니다.',
  'vendor_contacts_delete': '업체 연락처를 삭제할 수 있습니다.',
  'vendor_contacts_import': '엑셀/CSV 파일로 업체 연락처를 일괄 등록할 수 있습니다.',
  // 급여 명세서 권한 설명
  'payroll_view': '본인의 급여 명세서를 조회할 수 있습니다.',
  'payroll_manage': '급여 설정 및 전체 직원의 급여 명세서를 관리할 수 있습니다.',
  // 업무 체크리스트 권한 설명
  'task_checklist_view': '본인의 업무 체크리스트를 조회하고 체크할 수 있습니다.',
  'task_checklist_manage': '업무 체크리스트 템플릿을 생성하고 수정할 수 있습니다.',
  'task_checklist_approve': '업무 체크리스트 변경사항을 결재할 수 있습니다.',
  'task_checklist_view_all': '전체 직원의 업무 체크리스트 현황을 조회할 수 있습니다.',
  // 업무 지시 권한 설명
  'task_directive_view': '업무 지시 내역을 조회할 수 있습니다.',
  'task_directive_create': '새로운 업무 지시를 생성할 수 있습니다.',
  'task_directive_manage': '업무 지시를 수정/삭제하거나 담당자를 할당할 수 있습니다.',
  // 병원 게시판 권한 설명
  'bulletin_view': '병원 게시판 글을 조회할 수 있습니다.',
  'bulletin_manage': '병원 게시판에 글을 작성/수정/삭제할 수 있습니다.',
  // 커뮤니티 권한 설명
  'community_view': '자유게시판과 소모임을 조회할 수 있습니다.',
  'community_post': '자유게시판/소모임에 글과 댓글을 작성할 수 있습니다.',
  'community_manage': '자유게시판/소모임 게시글을 수정/삭제하거나 모임을 운영할 수 있습니다.',
  // 리콜 관리 권한 설명
  'recall_view': '리콜 관리 페이지의 환자 목록과 현황을 조회할 수 있습니다.',
  'recall_manage': '리콜 캠페인을 실행하고 처리 결과를 등록/수정할 수 있습니다.',
  // AI 데이터 분석 권한 설명
  'ai_analysis_view': 'AI 데이터 분석 결과를 조회할 수 있습니다.',
  // 경영 현황 권한 설명
  'financial_view': '경영 현황(수입/지출/손익)을 조회할 수 있습니다.',
  'financial_manage': '경영 현황 데이터를 입력하거나 수정할 수 있습니다.',
  // 마케팅 자동화 권한 설명
  'marketing_view': '마케팅 자동화 콘텐츠와 발행 현황을 조회할 수 있습니다.',
  'marketing_manage': '마케팅 자동화 콘텐츠를 생성/수정/발행할 수 있습니다.',
  // 주식 자동매매 권한 설명
  'investment_view': '주식 자동매매 현황과 포트폴리오를 조회할 수 있습니다.',
  'investment_manage': '자동매매 전략을 설정하거나 주문을 관리할 수 있습니다.'
}