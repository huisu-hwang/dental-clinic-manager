'use client'

import { useParams } from 'next/navigation'
import TelegramInviteJoin from '@/components/Telegram/TelegramInviteJoin'

export default function TelegramJoinPage() {
  const params = useParams()
  const code = params.code as string

  return (
    <div className="p-4 sm:p-6 bg-white min-h-screen flex items-center justify-center">
      <TelegramInviteJoin inviteCode={code} />
    </div>
  )
}
