'use client'

import { FileText, Link2, Brain, Pin, PenLine, Heart, MessageCircle, Vote, Check } from 'lucide-react'
import type { TelegramBoardPost } from '@/types/telegram'
import { TELEGRAM_POST_TYPE_LABELS, TELEGRAM_POST_TYPE_COLORS, getCategoryColorClasses } from '@/types/telegram'

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

  const typeColor = TELEGRAM_POST_TYPE_COLORS[post.post_type] || { bg: 'bg-gray-100', text: 'text-gray-700' }
  const typeLabel = TELEGRAM_POST_TYPE_LABELS[post.post_type] || post.post_type

  const TypeIcon = post.post_type === 'summary' ? Brain
    : post.post_type === 'file' ? FileText
    : post.post_type === 'general' ? PenLine
    : post.post_type === 'vote' ? Vote
    : Link2

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
      className={`flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 ${
        showCheckbox && selected ? 'bg-sky-50' : ''
      } ${selectMode && !selectable ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {/* 고정 또는 체크박스 */}
      <div className="w-5 flex-shrink-0 flex items-center justify-center">
        {showCheckbox ? (
          <div
            onClick={handleCheckboxClick}
            className={`w-4 h-4 rounded border flex items-center justify-center ${
              !selectable
                ? 'border-gray-200 bg-gray-100'
                : selected
                  ? 'border-sky-500 bg-sky-500'
                  : 'border-gray-300 hover:border-sky-400'
            }`}
          >
            {selected && <Check className="w-3 h-3 text-white" />}
          </div>
        ) : (
          post.is_pinned && <Pin className="w-3.5 h-3.5 text-red-500" />
        )}
      </div>
      {/* 유형 */}
      <div className="hidden sm:block w-20 flex-shrink-0 text-center">
        <span className={`text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 ${typeColor.bg} ${typeColor.text}`}>
          <TypeIcon className="w-3 h-3" />
          {typeLabel}
        </span>
      </div>
      {/* 제목 */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5">
        <span className={`sm:hidden text-xs px-1.5 py-0.5 rounded inline-flex items-center gap-0.5 flex-shrink-0 ${typeColor.bg} ${typeColor.text}`}>
          <TypeIcon className="w-3 h-3" />
          {typeLabel}
        </span>
        {alwaysShowCheckbox && post.is_pinned && <Pin className="w-3 h-3 text-red-500 flex-shrink-0" />}
        {post.category && !post.category.is_default && (() => {
          const catColor = getCategoryColorClasses(post.category.color)
          return (
            <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${catColor.bg} ${catColor.text}`}>
              {post.category.name}
            </span>
          )
        })()}
        <span className="text-sm text-gray-900 truncate">{post.title}</span>
        {(post.comment_count ?? 0) > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-sky-500 flex-shrink-0">
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
      <div className="hidden sm:block w-20 text-center text-sm text-gray-500 flex-shrink-0 truncate">
        {post.author?.name || ''}
      </div>
      {/* 작성일 */}
      <div className="w-20 text-center text-sm text-gray-500 flex-shrink-0">
        {formatDate(post.created_at)}
      </div>
      {/* 조회수 */}
      <div className="hidden sm:block w-12 text-center text-sm text-gray-500 flex-shrink-0">
        {post.view_count}
      </div>
    </div>
  )
}
