'use client'

import { ShieldAlert } from 'lucide-react'
import type { CommunityProfile } from '@/types/community'

interface BanNoticeProps {
  profile: CommunityProfile
}

export default function BanNotice({ profile }: BanNoticeProps) {
  const banUntilText = profile.ban_until
    ? new Date(profile.ban_until).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
      })
    : null

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
      <ShieldAlert className="w-12 h-12 text-red-500 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-red-700 mb-2">활동이 제한되었습니다</h3>
      <p className="text-sm text-red-600">
        커뮤니티 이용 규칙 위반으로 인해 활동이 제한되었습니다.
      </p>
      {banUntilText ? (
        <p className="text-sm text-red-500 mt-2">
          제한 해제일: <strong>{banUntilText}</strong>
        </p>
      ) : (
        <p className="text-sm text-red-500 mt-2">
          영구적으로 활동이 제한되었습니다.
        </p>
      )}
      <p className="text-xs text-gray-500 mt-4">
        이의가 있으시면 관리자에게 문의해주세요.
      </p>
    </div>
  )
}
