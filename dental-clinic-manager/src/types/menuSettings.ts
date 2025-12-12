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
}

// 병원별 메뉴 설정
export interface ClinicMenuSettings {
  id?: string
  clinic_id: string
  settings: MenuItemSetting[]
  created_at?: string
  updated_at?: string
}

// 기본 메뉴 목록 (TabNavigation.tsx의 tabs와 동일한 순서)
export const DEFAULT_MENU_ITEMS: MenuItemSetting[] = [
  { id: 'daily-input', label: '일일보고서', visible: true, order: 0 },
  { id: 'attendance', label: '출근 관리', visible: true, order: 1 },
  { id: 'leave', label: '연차 관리', visible: true, order: 2 },
  { id: 'stats', label: '통계', visible: true, order: 3 },
  { id: 'logs', label: '상세 기록', visible: true, order: 4 },
  { id: 'protocols', label: '진료 프로토콜', visible: true, order: 5 },
  { id: 'vendors', label: '업체 연락처', visible: true, order: 6 },
  { id: 'contracts', label: '근로계약서', visible: true, order: 7 },
  { id: 'documents', label: '문서 양식', visible: true, order: 8 },
  { id: 'settings', label: '재고 관리', visible: true, order: 9 },
  { id: 'guide', label: '사용 안내', visible: true, order: 10 },
]

// 메뉴 ID 목록 (유효성 검사용)
export const VALID_MENU_IDS = DEFAULT_MENU_ITEMS.map(item => item.id)

// 메뉴 설정 유효성 검사
export function validateMenuSettings(settings: MenuItemSetting[]): boolean {
  // 모든 필수 메뉴가 포함되어 있는지 확인
  const settingIds = new Set(settings.map(s => s.id))
  return VALID_MENU_IDS.every(id => settingIds.has(id))
}

// 메뉴 설정 정규화 (새로운 메뉴가 추가되었을 때 기본값으로 병합)
export function normalizeMenuSettings(settings: MenuItemSetting[]): MenuItemSetting[] {
  const existingIds = new Set(settings.map(s => s.id))
  const maxOrder = Math.max(...settings.map(s => s.order), -1)

  // 기존 설정에 없는 새 메뉴 추가
  const newItems = DEFAULT_MENU_ITEMS
    .filter(item => !existingIds.has(item.id))
    .map((item, index) => ({
      ...item,
      order: maxOrder + index + 1
    }))

  // 더 이상 존재하지 않는 메뉴 제거
  const validSettings = settings.filter(s => VALID_MENU_IDS.includes(s.id))

  return [...validSettings, ...newItems].sort((a, b) => a.order - b.order)
}
