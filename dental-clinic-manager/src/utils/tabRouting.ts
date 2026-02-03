/**
 * 중앙 집중식 탭 라우팅 유틸리티
 *
 * 이 파일은 menuConfig.ts에서 라우팅 정보를 가져옵니다.
 * 새 메뉴 추가 시 src/config/menuConfig.ts만 수정하면 됩니다.
 */

// 중앙 메뉴 설정에서 import
export {
  TAB_ROUTES,
  VALID_TAB_IDS,
  getTabRoute,
} from '@/config/menuConfig'

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

    const { getTabRoute } = require('@/config/menuConfig')
    const route = getTabRoute(tab)
    router.push(route)
  }
}
