// 경매 상세는 dashboard 내부(/dashboard?tab=investment&sub=auction&item=<id>)에서 통합 렌더되므로
// 이 라우트는 즐겨찾기 / 외부 링크 호환성을 위해 dashboard 로 redirect 한다.
import { redirect } from 'next/navigation'

export default async function AuctionDetailRedirect({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  redirect(`/dashboard?tab=investment&sub=auction&item=${encodeURIComponent(itemId)}`)
}
