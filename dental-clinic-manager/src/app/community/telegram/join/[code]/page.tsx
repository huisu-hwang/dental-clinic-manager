/**
 * Legacy redirect — 이전 버전에서 복사한 초대 링크가
 * 잘못된 경로(/community/telegram/join/...)로 만들어진 경우
 * 정식 경로(/dashboard/community/telegram/join/...)로 자동 이동.
 */

import { redirect } from 'next/navigation'

export default async function LegacyInviteRedirect({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  redirect(`/dashboard/community/telegram/join/${code}`)
}
