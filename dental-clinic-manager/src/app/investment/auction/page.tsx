// 경매 목록은 dashboard 내부(/dashboard?tab=investment&sub=auction)에서 통합 렌더되므로
// 이 라우트는 즐겨찾기 / 외부 링크 호환성을 위해 dashboard 로 redirect 한다.
import { redirect } from 'next/navigation'

export default function AuctionListRedirect() {
  redirect('/dashboard?tab=investment&sub=auction')
}
