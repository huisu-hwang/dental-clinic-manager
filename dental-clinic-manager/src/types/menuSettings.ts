/**
 * 메뉴 설정 타입 정의
 * 대표 원장이 좌측 탭 메뉴의 표시 여부와 순서를 설정할 수 있도록 함
 */

// 메뉴 아이템 설정
export interface MenuItemSetting {
  id: string            // 탭 ID (예: 'daily-input', 'attendance' 등)
  label: string         // 표시 이름
  visible: boolean      // 표시 여부
  order: number         // 표시 순서 (0부터 시작)
  categoryId?: string   // 소속 카테고리 ID (없으면 기본 카테고리)
}

// 카테고리 설정
export interface MenuCategorySetting {
  id: string            // 카테고리 ID
  label: string         // 표시 이름
  icon: string          // 아이콘 이름 (lucide-react)
  order: number         // 표시 순서
  visible: boolean      // 표시 여부
  collapsed?: boolean   // 기본 접힘 상태
}

// 병원별 메뉴 설정
export interface ClinicMenuSettings {
  id?: string
  clinic_id: string
  settings: MenuItemSetting[]
  categories?: MenuCategorySetting[]
  created_at?: string
  updated_at?: string
}

// 기본 카테고리 목록
export const DEFAULT_CATEGORIES: MenuCategorySetting[] = [
  { id: 'work', label: '업무 관리', icon: 'Briefcase', order: 0, visible: true },
  { id: 'documents', label: '문서 · 자료', icon: 'FolderOpen', order: 1, visible: true },
  { id: 'operations', label: '운영 관리', icon: 'Settings', order: 2, visible: true }
]

// 기본 메뉴 목록 (TabNavigation.tsx의 tabs와 동일한 순서)
export const DEFAULT_MENU_ITEMS: MenuItemSetting[] = [
  { id: 'home', label: '대시보드', visible: true, order: 0 },
  { id: 'daily-input', label: '일일보고서', visible: true, order: 1, categoryId: 'work' },
  { id: 'attendance', label: '출근 관리', visible: true, order: 2, categoryId: 'work' },
  { id: 'leave', label: '연차 관리', visible: true, order: 3, categoryId: 'work' },
  { id: 'stats', label: '통계', visible: true, order: 4, categoryId: 'work' },
  { id: 'logs', label: '상세 기록', visible: true, order: 5, categoryId: 'work' },
  { id: 'bulletin', label: '병원 게시판', visible: true, order: 6 },
  { id: 'protocols', label: '진료 프로토콜', visible: true, order: 7, categoryId: 'documents' },
  { id: 'contracts', label: '근로계약서', visible: true, order: 8, categoryId: 'documents' },
  { id: 'documents', label: '문서 양식', visible: true, order: 9, categoryId: 'documents' },
  { id: 'vendors', label: '업체 연락처', visible: true, order: 10, categoryId: 'operations' },
  { id: 'settings', label: '재고 관리', visible: true, order: 11, categoryId: 'operations' },
  { id: 'guide', label: '사용 안내', visible: true, order: 12 },
]

// 메뉴 ID 목록 (유효성 검사용)
export const VALID_MENU_IDS = DEFAULT_MENU_ITEMS.map(item => item.id)

// 카테고리 ID 목록 (유효성 검사용)
export const VALID_CATEGORY_IDS = DEFAULT_CATEGORIES.map(cat => cat.id)

// 사용 가능한 카테고리 아이콘 목록
export const AVAILABLE_CATEGORY_ICONS = [
  'Briefcase',
  'MessageSquare',
  'FolderOpen',
  'Settings',
  'Users',
  'Calendar',
  'FileText',
  'BarChart',
  'Heart',
  'Building2',
  'Clipboard',
  'Star'
] as const

// 메뉴 설정 유효성 검사
export function validateMenuSettings(settings: MenuItemSetting[]): boolean {
  // 모든 필수 메뉴가 포함되어 있는지 확인
  const settingIds = new Set(settings.map(s => s.id))
  return VALID_MENU_IDS.every(id => settingIds.has(id))
}

// 메뉴 설정 정규화 (새로운 메뉴가 추가되었을 때 기본값으로 병합)
export function normalizeMenuSettings(settings: MenuItemSetting[]): MenuItemSetting[] {
  const existingIds = new Set(settings.map(s => s.id))

  // 더 이상 존재하지 않는 메뉴 제거
  let validSettings = settings.filter(s => VALID_MENU_IDS.includes(s.id))

  // 'home' 메뉴가 없으면 맨 앞에 추가하고 기존 메뉴 order를 1씩 증가
  if (!existingIds.has('home')) {
    validSettings = validSettings.map(s => ({ ...s, order: s.order + 1 }))
    const homeItem = DEFAULT_MENU_ITEMS.find(item => item.id === 'home')!
    validSettings.unshift({ ...homeItem, order: 0 })
  }

  // 나머지 새 메뉴는 맨 뒤에 추가
  const updatedIds = new Set(validSettings.map(s => s.id))
  const maxOrder = Math.max(...validSettings.map(s => s.order), -1)
  const newItems = DEFAULT_MENU_ITEMS
    .filter(item => !updatedIds.has(item.id))
    .map((item, index) => ({
      ...item,
      order: maxOrder + index + 1
    }))

  return [...validSettings, ...newItems].sort((a, b) => a.order - b.order)
}

// 카테고리 설정 정규화
export function normalizeCategorySettings(categories: MenuCategorySetting[] | undefined): MenuCategorySetting[] {
  if (!categories || categories.length === 0) {
    return [...DEFAULT_CATEGORIES]
  }

  const existingIds = new Set(categories.map(c => c.id))

  // 기존 카테고리 중 유효한 것만 유지
  let validCategories = categories.filter(c => VALID_CATEGORY_IDS.includes(c.id))

  // 누락된 기본 카테고리 추가
  const maxOrder = Math.max(...validCategories.map(c => c.order), -1)
  const missingCategories = DEFAULT_CATEGORIES
    .filter(c => !existingIds.has(c.id))
    .map((c, index) => ({
      ...c,
      order: maxOrder + index + 1
    }))

  return [...validCategories, ...missingCategories].sort((a, b) => a.order - b.order)
}
