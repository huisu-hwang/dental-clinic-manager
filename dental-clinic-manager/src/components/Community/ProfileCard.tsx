'use client'

import { User, MessageSquare, FileText, AlertTriangle } from 'lucide-react'
import type { CommunityProfile } from '@/types/community'

interface ProfileCardProps {
  profile: CommunityProfile
  compact?: boolean
}

export default function ProfileCard({ profile, compact = false }: ProfileCardProps) {
  // 아바타 색상 생성 (seed 기반)
  const getAvatarColor = (seed: string) => {
    const colors = [
      'bg-at-accent', 'bg-green-500', 'bg-purple-500', 'bg-orange-500',
      'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-red-500',
    ]
    let hash = 0
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash)
    }
    return colors[Math.abs(hash) % colors.length]
  }

  const avatarColor = getAvatarColor(profile.avatar_seed || profile.nickname)
  const initial = profile.nickname.charAt(0).toUpperCase()

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div className={`w-6 h-6 rounded-full ${avatarColor} flex items-center justify-center`}>
          <span className="text-white text-xs font-bold">{initial}</span>
        </div>
        <span className="text-sm font-medium text-at-text-secondary">{profile.nickname}</span>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-at-border p-4 shadow-at-card">
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-full ${avatarColor} flex items-center justify-center`}>
          <span className="text-white text-lg font-bold">{initial}</span>
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-at-text">{profile.nickname}</h3>
          {profile.bio && (
            <p className="text-sm text-at-text-secondary mt-0.5">{profile.bio}</p>
          )}
          <div className="flex items-center gap-4 mt-2 text-xs text-at-text-weak">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              게시글 {profile.total_posts}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              댓글 {profile.total_comments}
            </span>
          </div>
        </div>
      </div>
      {profile.is_banned && (
        <div className="mt-3 flex items-center gap-2 text-sm text-at-error bg-at-error-bg rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4" />
          <span>활동이 제한된 계정입니다.</span>
        </div>
      )}
    </div>
  )
}
