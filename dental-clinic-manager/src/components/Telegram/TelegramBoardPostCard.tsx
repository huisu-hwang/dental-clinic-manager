'use client'

import { FileText, Link2, Brain, Pin, PenLine, Heart, MessageCircle, Vote, Check } from 'lucide-react'
import type { TelegramBoardPost } from '@/types/telegram'
import { TELEGRAM_POST_TYPE_COLORS, getCategoryColorClasses } from '@/types/telegram'

interface TelegramBoardPostCardProps {
  post: TelegramBoardPost
  onClick: (post: TelegramBoardPost) => void
  selectMode?: boolean
  selected?: boolean
  onToggleSelect?: (postId: string) => void
  selectable?: boolean
  alwaysShowCheckbox?: boolean
}

export default function TelegramBoardPostCard({ post, onClick, selectMode = false, selected = false, onToggleSelect, selectable = true, alwaysShowCheckbox = false }: TelegramBoardPostCardProps) {
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

  const categoryName = post.category?.name || '미분류'
  const categoryColor = post.category?.color || 'gray'
  const catColorClasses = getCategoryColorClasses(categoryColor)

  const TypeIcon = post.post_type === 'summary' ? Brain
    : post.post_type === 'file' ? FileText
    : post.post_type === 'general' ? PenLine
    : post.post_type === 'vote' ? Vote
    : Link2
  const typeColor = TELEGRAM_POST_TYPE_COLORS[post.post_type] || { text: 'text-at-text-weak' }

  const showCheckbox = selectMode || alwaysShowCheckbox

  const handleClick = () => {
    if (selectMode && selectable && onToggleSelect) {
      onToggleSelect(post.id)
    } else if (!selectMode) {
      onClick(post)
    }
  }

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectable && onToggleSelect) {
      onToggleSelect(post.id)
    }
  }

  return (
    <div
      onClick={alwaysShowCheckbox && !selectMode ? () => onClick(post) : handleClick}
      className={`flex items-center px-4 py-3 hover:bg-at-surface-hover cursor-pointer transition-colors border-b border-at-border last:border-b-0 border-l-2 ${
        post.is_pinned ? 'border-l-red-400 bg-red-50/30' : 'border-l-transparent'
      } ${showCheckbox && selected ? 'bg-at-accent-light' : ''} ${selectMode && !selectable ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {/* 고정 또는 체크박스 */}
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        {showCheckbox ? (
          <div
            onClick={handleCheckboxClick}
            className={`w-4 h-4 rounded border flex items-center justify-center ${
              !selectable
                ? 'border-at-border bg-at-surface-alt'
                : selected
                  ? 'border-at-accent bg-at-accent'
                  : 'border-at-border hover:border-at-accent'
            }`}
          >
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        ) : (
          post.is_pinned && <Pin className="w-3.5 h-3.5 text-red-500" />
        )}
      </div>
      {/* 카테고리 배지 */}
      <div className="hidden sm:block w-20 flex-shrink-0 text-center">
        <span className={`text-xs px-1.5 py-0.5 rounded ${catColorClasses.bg} ${catColorClasses.text}`}>
          {categoryName}
        </span>
      </div>
      {/* 제목 */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className={`sm:hidden text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${catColorClasses.bg} ${catColorClasses.text}`}>
          {categoryName}
        </span>
        {alwaysShowCheckbox && post.is_pinned && <Pin className="w-3 h-3 text-red-500 flex-shrink-0" />}
        <TypeIcon className={`w-3.5 h-3.5 flex-shrink-0 ${typeColor.text}`} />
        <span className="text-sm text-at-text truncate">{post.title}</span>
        {(() => {
          const created = new Date(post.created_at)
          const now = new Date()
          const isToday = created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth() && created.getDate() === now.getDate()
          return isToday ? <span className="flex-shrink-0 ml-1 px-1 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded">N</span> : null
        })()}
        {(post.comment_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-at-accent flex-shrink-0">
            <MessageCircle className="w-3 h-3" />{post.comment_count}
          </span>
        )}
        {(post.like_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-red-400 flex-shrink-0">
            <Heart className="w-3 h-3" />{post.like_count}
          </span>
        )}
      </div>
      {/* 작성자 */}
      <div className="hidden sm:block w-20 text-center text-sm text-at-text-secondary flex-shrink-0 truncate">
        {post.author?.name || post.telegram_sender_name || ''}
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
