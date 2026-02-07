'use client'

import { Eye, Heart, MessageSquare, Bookmark, Pin } from 'lucide-react'
import type { CommunityPost } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS, COMMUNITY_CATEGORY_COLORS } from '@/types/community'

interface CommunityPostCardProps {
  post: CommunityPost
  onClick: (post: CommunityPost) => void
}

export default function CommunityPostCard({ post, onClick }: CommunityPostCardProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return '방금 전'
    if (minutes < 60) return `${minutes}분 전`
    if (hours < 24) return `${hours}시간 전`
    if (days < 7) return `${days}일 전`
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  return (
    <div
      onClick={() => onClick(post)}
      className="p-4 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0"
    >
      <div className="flex items-start gap-3">
        {post.is_pinned && (
          <Pin className="w-4 h-4 text-red-500 flex-shrink-0 mt-1" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${COMMUNITY_CATEGORY_COLORS[post.category]}`}>
              {COMMUNITY_CATEGORY_LABELS[post.category]}
            </span>
            {post.has_poll && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">투표</span>
            )}
          </div>
          <h3 className="text-gray-900 font-medium truncate">{post.title}</h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span className="font-medium text-gray-500">{post.profile?.nickname || '익명'}</span>
            <span>{formatDate(post.created_at)}</span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />{post.view_count}
            </span>
            <span className="flex items-center gap-1">
              <Heart className={`w-3 h-3 ${post.is_liked ? 'fill-red-500 text-red-500' : ''}`} />{post.like_count}
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />{post.comment_count}
            </span>
            {post.is_bookmarked && (
              <Bookmark className="w-3 h-3 fill-yellow-500 text-yellow-500" />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
