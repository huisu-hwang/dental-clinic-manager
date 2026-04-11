'use client'

import { Heart, MessageSquare, Pin } from 'lucide-react'
import type { CommunityPost } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS, COMMUNITY_CATEGORY_COLORS } from '@/types/community'

interface CommunityPostCardProps {
  post: CommunityPost
  onClick: (post: CommunityPost) => void
  labelMap?: Record<string, string>
  colorMap?: Record<string, string>
}

export default function CommunityPostCard({ post, onClick, labelMap, colorMap }: CommunityPostCardProps) {
  const labels = labelMap || COMMUNITY_CATEGORY_LABELS
  const colors = colorMap || COMMUNITY_CATEGORY_COLORS
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    if (date.getFullYear() === now.getFullYear()) {
      return `${month}.${day}`
    }
    const year = String(date.getFullYear()).slice(2)
    return `${year}.${month}.${day}`
  }

  return (
    <div
      onClick={() => onClick(post)}
      className={`flex items-center px-4 py-3 hover:bg-at-surface-hover cursor-pointer transition-colors border-b border-at-border last:border-b-0 border-l-2 ${
        post.is_pinned ? 'border-l-red-400 bg-red-50/30' : 'border-l-transparent'
      }`}
    >
      {/* 고정 */}
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        {post.is_pinned && (
          <Pin className="w-3.5 h-3.5 text-red-500" />
        )}
      </div>
      {/* 분류 */}
      <div className="hidden sm:block w-20 flex-shrink-0 text-center">
        <span className={`text-xs px-1.5 py-0.5 rounded ${colors[post.category] || 'bg-at-surface-alt text-at-text-secondary'}`}>
          {labels[post.category] || post.category}
        </span>
      </div>
      {/* 제목 */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className={`sm:hidden text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${colors[post.category] || 'bg-at-surface-alt text-at-text-secondary'}`}>
          {labels[post.category] || post.category}
        </span>
        {post.has_poll && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 flex-shrink-0">투표</span>
        )}
        <span className="text-sm text-at-text truncate">{post.title}</span>
        {(() => {
          const created = new Date(post.created_at)
          const now = new Date()
          const isToday = created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth() && created.getDate() === now.getDate()
          return isToday ? <span className="flex-shrink-0 ml-1 px-1 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded">N</span> : null
        })()}
        {(post.comment_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-sky-500 flex-shrink-0">
            <MessageSquare className="w-3 h-3" />{post.comment_count}
          </span>
        )}
        {(post.like_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-red-400 flex-shrink-0">
            <Heart className={`w-3 h-3 ${post.is_liked ? 'fill-red-500 text-red-500' : ''}`} />{post.like_count}
          </span>
        )}
      </div>
      {/* 작성자 */}
      <div className="hidden sm:block w-20 text-center text-sm text-at-text-secondary flex-shrink-0 truncate">
        {post.profile?.nickname || '익명'}
      </div>
      {/* 작성일 */}
      <div className="w-20 text-center text-sm text-at-text-secondary flex-shrink-0">
        {formatDate(post.created_at)}
      </div>
      {/* 조회수 */}
      <div className="hidden sm:block w-12 text-center text-sm text-at-text-secondary flex-shrink-0">
        {post.view_count}
      </div>
    </div>
  )
}
