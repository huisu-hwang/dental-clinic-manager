/**
 * 중앙 집중식 탭 라우팅 유틸리티
 * 모든 페이지에서 이 함수를 사용하여 탭 변경을 처리합니다.
 * 새 메뉴 추가 시 이 파일만 수정하면 됩니다.
 */

// 탭별 라우팅 경로 정의
const TAB_ROUTES: Record<string, string> = {
  'home': '/dashboard',
  'daily-input': '/dashboard?tab=daily-input',
  'attendance': '/attendance',
  'leave': '/dashboard?tab=leave',
  'bulletin': '/bulletin',
  'stats': '/dashboard?tab=stats',
  'logs': '/dashboard?tab=logs',
  'protocols': '/dashboard?tab=protocols',
  'contracts': '/dashboard/contracts',
  'vendors': '/dashboard?tab=vendors',
  'documents': '/dashboard?tab=documents',
  'payroll': '/dashboard?tab=payroll',
  'recall': '/dashboard?tab=recall',
  'sns-generator': '/dashboard?tab=sns-generator',
  'settings': '/dashboard?tab=settings',
  'guide': '/dashboard?tab=guide',
  'menu-settings': '/dashboard?tab=menu-settings',
}

/**
 * 탭 ID에 해당하는 라우팅 경로를 반환합니다.
 * @param tabId 탭 ID
 * @returns 라우팅 경로 (없으면 '/dashboard')
 */
export function getTabRoute(tabId: string): string {
  return TAB_ROUTES[tabId] || '/dashboard'
}

/**
 * 탭 변경 핸들러를 생성합니다.
 * @param router Next.js router 인스턴스
 * @param currentTab 현재 페이지의 탭 ID (해당 탭이면 이동하지 않음)
 * @returns 탭 변경 핸들러 함수
 */
export function createTabChangeHandler(
  router: { push: (url: string) => void },
  currentTab?: string
) {
  return (tab: string) => {
    // 현재 탭과 동일하면 이동하지 않음
    if (currentTab && tab === currentTab) return

    const route = getTabRoute(tab)
    router.push(route)
  }
}

/**
 * 모든 유효한 탭 ID 목록
 */
export const VALID_TAB_IDS = Object.keys(TAB_ROUTES)
