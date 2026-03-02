'use client'

import { Eye, FileText, Link2, Brain, Pin, PenLine, MessageCircle } from 'lucide-react'
import type { TelegramBoardPost } from '@/types/telegram'
import { TELEGRAM_POST_TYPE_LABELS, TELEGRAM_POST_TYPE_COLORS } from '@/types/telegram'

interface TelegramBoardPostCardProps {
  post: TelegramBoardPost
  onClick: (post: TelegramBoardPost) => void
}

export default function TelegramBoardPostCard({ post, onClick }: TelegramBoardPostCardProps) {
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

  const typeColor = TELEGRAM_POST_TYPE_COLORS[post.post_type] || { bg: 'bg-gray-100', text: 'text-gray-700' }
  const typeLabel = TELEGRAM_POST_TYPE_LABELS[post.post_type] || post.post_type

  const TypeIcon = post.post_type === 'summary' ? Brain
    : post.post_type === 'file' ? FileText
    : post.post_type === 'general' ? PenLine
    : Link2

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
            <span className={`text-xs px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${typeColor.bg} ${typeColor.text}`}>
              <TypeIcon className="w-3 h-3" />
              {typeLabel}
            </span>
            {post.summary_date && (
              <span className="text-xs text-gray-400">
                {post.summary_date}
              </span>
            )}
          </div>
          <h3 className="text-gray-900 font-medium truncate">{post.title}</h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            {post.author?.name && (
              <span className="text-gray-500 font-medium">{post.author.name}</span>
            )}
            <span>{formatDate(post.created_at)}</span>
            <span className="flex items-center gap-1">
              <Eye className="w-3 h-3" />{post.view_count}
            </span>
            {(post.comment_count ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />{post.comment_count}
              </span>
            )}
            {(post.file_urls?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />{post.file_urls.length}개 파일
              </span>
            )}
            {(post.link_urls?.length ?? 0) > 0 && (
              <span className="flex items-center gap-1">
                <Link2 className="w-3 h-3" />{post.link_urls.length}개 링크
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
