// 경매 목록은 dashboard 의 독립 최상위 탭(/dashboard?tab=auction)에서 렌더되므로
// 이 라우트는 즐겨찾기 / 외부 링크 호환성을 위해 dashboard 로 redirect 한다.
import { redirect } from 'next/navigation'

export default function AuctionListRedirect() {
  redirect('/dashboard?tab=auction')
}
