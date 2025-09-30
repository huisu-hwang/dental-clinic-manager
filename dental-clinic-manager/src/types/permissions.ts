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

// 역할별 기본 권한 설정
export const DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  owner: [
    // 대표원장은 모든 권한
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'staff_manage', 'clinic_settings', 'guide_view'
  ],
  vice_director: [
    // 부원장은 직원 관리와 병원 설정 제외한 모든 권한
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'guide_view'
  ],
  manager: [
    // 실장은 모든 기능 접근 가능 (병원 설정 제외)
    'daily_report_view', 'daily_report_create', 'daily_report_edit', 'daily_report_delete',
    'stats_weekly_view', 'stats_monthly_view', 'stats_annual_view',
    'logs_view', 'inventory_view', 'inventory_manage',
    'staff_view', 'guide_view'
  ],
  team_leader: [
    // 팀장은 기본적인 업무와 통계 보기
    'daily_report_view', 'daily_report_create', 'daily_report_edit',
    'stats_weekly_view', 'stats_monthly_view',
    'logs_view', 'inventory_view', 'guide_view'
  ],
  staff: [
    // 일반 직원은 기본 업무만
    'daily_report_view', 'daily_report_create',
    'stats_weekly_view',
    'inventory_view', 'guide_view'
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
  'guide_view': '사용 안내를 볼 수 있습니다.'
}