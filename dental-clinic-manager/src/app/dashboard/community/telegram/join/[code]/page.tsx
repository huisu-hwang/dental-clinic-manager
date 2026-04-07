'use client'

import { useParams } from 'next/navigation'
import TelegramInviteJoin from '@/components/Telegram/TelegramInviteJoin'

export default function TelegramJoinPage() {
  const params = useParams()
  const code = params.code as string

  return (
    <div className="flex items-center justify-center py-10">
      <TelegramInviteJoin inviteCode={code} />
    </div>
  )
}
