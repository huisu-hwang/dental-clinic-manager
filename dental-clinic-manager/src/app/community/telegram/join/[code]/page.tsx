'use client'

import { useParams } from 'next/navigation'
import TelegramInviteJoin from '@/components/Telegram/TelegramInviteJoin'

export default function TelegramJoinPage() {
  const params = useParams()
  const code = params.code as string

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <TelegramInviteJoin inviteCode={code} />
    </div>
  )
}
