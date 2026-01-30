/**
 * 중앙 집중식 메뉴 설정
 *
 * 새 메뉴 추가 시 이 파일만 수정하면 됩니다.
 * 다른 파일들은 이 설정을 참조합니다.
 *
 * 체크리스트:
 * 1. MENU_CONFIG에 메뉴 추가 ✓ (이 파일)
 * 2. dashboard/page.tsx에 탭 렌더링 추가 (컴포넌트는 자동화 불가)
 */

import type { Permission } from '@/types/permissions'

// 메뉴 설정 타입
export interface MenuConfigItem {
  id: string
  label: string
  icon: string  // lucide-react 아이콘 이름
  route: string
  permissions: Permission[]
  categoryId?: string  // 'work' | 'documents' | 'operations' 또는 undefined (고정 메뉴)
  order: number
  visible: boolean
  fixedPosition?: 'top' | 'bottom'
}

/**
 * 메뉴 설정 (순서대로 정의)
 *
 * 새 메뉴 추가 시:
 * 1. 이 배열에 메뉴 추가
 * 2. src/app/dashboard/page.tsx에서 해당 탭의 컴포넌트 렌더링 추가
 */
export const MENU_CONFIG: MenuConfigItem[] = [
  // === 상단 고정 메뉴 ===
  {
    id: 'home',
    label: '대시보드',
    icon: 'Home',
    route: '/dashboard',
    permissions: [],
    order: 0,
    visible: true,
  },

  // === 업무 관리 카테고리 ===
  {
    id: 'daily-input',
    label: '일일보고서',
    icon: 'ClipboardList',
    route: '/dashboard?tab=daily-input',
    permissions: ['daily_report_view'],
    categoryId: 'work',
    order: 1,
    visible: true,
  },
  {
    id: 'attendance',
    label: '근태관리',
    icon: 'Clock',
    route: '/attendance',
    permissions: ['attendance_check_in', 'attendance_view_own'],
    categoryId: 'work',
    order: 2,
    visible: true,
  },
  {
    id: 'leave',
    label: '연차 관리',
    icon: 'CalendarDays',
    route: '/dashboard?tab=leave',
    permissions: ['leave_request_view_own', 'leave_balance_view_own'],
    categoryId: 'work',
    order: 3,
    visible: true,
  },
  {
    id: 'stats',
    label: '통계',
    icon: 'BarChart3',
    route: '/dashboard?tab=stats',
    permissions: ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'],
    categoryId: 'work',
    order: 4,
    visible: true,
  },
  {
    id: 'logs',
    label: '상세 기록',
    icon: 'History',
    route: '/dashboard?tab=logs',
    permissions: ['logs_view'],
    categoryId: 'work',
    order: 5,
    visible: true,
  },
  {
    id: 'ai-analysis',
    label: 'AI 데이터 분석',
    icon: 'Sparkles',
    route: '/dashboard?tab=ai-analysis',
    permissions: ['stats_weekly_view', 'stats_monthly_view', 'stats_annual_view'],
    categoryId: 'work',
    order: 6,
    visible: true,
  },

  // === 중간 고정 메뉴 ===
  {
    id: 'bulletin',
    label: '병원 게시판',
    icon: 'Megaphone',
    route: '/bulletin',
    permissions: [],
    order: 7,
    visible: true,
  },

  // === 문서 · 자료 카테고리 ===
  {
    id: 'protocols',
    label: '진료 프로토콜',
    icon: 'BookOpen',
    route: '/dashboard?tab=protocols',
    permissions: ['protocol_view'],
    categoryId: 'documents',
    order: 8,
    visible: true,
  },
  {
    id: 'contracts',
    label: '근로계약서',
    icon: 'FileSignature',
    route: '/dashboard/contracts',
    permissions: ['contract_view'],
    categoryId: 'documents',
    order: 9,
    visible: true,
  },
  {
    id: 'payroll',
    label: '급여 명세서',
    icon: 'Banknote',
    route: '/dashboard?tab=payroll',
    permissions: ['contract_view'],
    categoryId: 'documents',
    order: 10,
    visible: true,
  },
  {
    id: 'documents',
    label: '문서 양식',
    icon: 'FileText',
    route: '/dashboard?tab=documents',
    permissions: ['contract_view'],
    categoryId: 'documents',
    order: 11,
    visible: true,
  },

  // === 운영 관리 카테고리 ===
  {
    id: 'vendors',
    label: '업체 연락처',
    icon: 'Building2',
    route: '/dashboard?tab=vendors',
    permissions: ['vendor_contacts_view'],
    categoryId: 'operations',
    order: 12,
    visible: true,
  },
  {
    id: 'settings',
    label: '재고 관리',
    icon: 'Package',
    route: '/dashboard?tab=settings',
    permissions: ['inventory_view'],
    categoryId: 'operations',
    order: 13,
    visible: true,
  },
  {
    id: 'recall',
    label: '리콜 관리',
    icon: 'PhoneCall',
    route: '/dashboard?tab=recall',
    permissions: ['daily_report_view'],
    categoryId: 'operations',
    order: 14,
    visible: true,
  },

  // === 하단 고정 메뉴 ===
  {
    id: 'guide',
    label: '사용 안내',
    icon: 'HelpCircle',
    route: '/dashboard?tab=guide',
    permissions: ['guide_view'],
    order: 15,
    visible: true,
  },
  {
    id: 'menu-settings',
    label: '메뉴 설정',
    icon: 'SlidersHorizontal',
    route: '/dashboard?tab=menu-settings',
    permissions: [],
    order: 16,
    visible: false,  // 기본적으로 숨김
  },
]

// ============================================
// 자동 생성되는 유틸리티 (다른 파일에서 사용)
// ============================================

/**
 * 탭 라우팅 맵 (tabRouting.ts 대체)
 */
export const TAB_ROUTES: Record<string, string> = Object.fromEntries(
  MENU_CONFIG.map(item => [item.id, item.route])
)

/**
 * 아이콘 맵 (TabNavigation.tsx에서 사용)
 */
export const MENU_ICON_MAP: Record<string, string> = Object.fromEntries(
  MENU_CONFIG.map(item => [item.id, item.icon])
)

/**
 * 권한 맵 (TabNavigation.tsx에서 사용)
 */
export const MENU_PERMISSIONS_MAP: Record<string, Permission[]> = Object.fromEntries(
  MENU_CONFIG.map(item => [item.id, item.permissions])
)

/**
 * 기본 메뉴 아이템 (menuSettings.ts 대체)
 */
export const DEFAULT_MENU_ITEMS = MENU_CONFIG.map(item => ({
  id: item.id,
  label: item.label,
  visible: item.visible,
  order: item.order,
  categoryId: item.categoryId,
  fixedPosition: item.fixedPosition,
}))

/**
 * 유효한 메뉴 ID 목록
 */
export const VALID_MENU_IDS = MENU_CONFIG.map(item => item.id)

/**
 * 유효한 탭 ID 목록
 */
export const VALID_TAB_IDS = Object.keys(TAB_ROUTES)

/**
 * 탭 ID에 해당하는 라우팅 경로를 반환
 */
export function getTabRoute(tabId: string): string {
  return TAB_ROUTES[tabId] || '/dashboard'
}

/**
 * 메뉴 ID로 설정 가져오기
 */
export function getMenuConfig(menuId: string): MenuConfigItem | undefined {
  return MENU_CONFIG.find(item => item.id === menuId)
}
