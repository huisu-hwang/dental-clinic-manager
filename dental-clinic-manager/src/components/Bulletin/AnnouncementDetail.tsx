'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Eye,
  Pencil,
  Trash2,
  Pin,
  AlertCircle,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Announcement } from '@/types/bulletin'
import { ANNOUNCEMENT_CATEGORY_LABELS } from '@/types/bulletin'
import ShareDialog from '@/components/shared/ShareDialog'
import { sanitizeHtml } from '@/utils/sanitize'

interface AnnouncementDetailProps {
  announcement: Announcement
  onBack: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export default function AnnouncementDetail({
  announcement,
  onBack,
  onEdit,
  onDelete,
}: AnnouncementDetailProps) {
  const [showShareDialog, setShowShareDialog] = useState(false)
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'schedule':
        return 'bg-at-tag text-at-accent'
      case 'holiday':
        return 'bg-at-error-bg text-at-error'
      default:
        return 'bg-at-surface-alt text-at-text-secondary'
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <nav className="flex items-center text-sm">
          <button onClick={onBack} className="text-at-accent hover:text-at-accent font-medium transition-colors">
            공지사항
          </button>
          <span className="mx-2 text-at-text-weak">›</span>
          <span className="text-at-text-weak truncate max-w-[200px] sm:max-w-[400px]">{announcement.title}</span>
        </nav>
      </div>

      {/* 공지사항 내용 */}
      <div className="bg-white rounded-2xl border border-at-border overflow-hidden">
        {/* 제목 영역 */}
        <div className="p-4 sm:p-6 border-b border-at-border">
          <div className="flex items-center gap-2 mb-3">
            {announcement.is_pinned && (
              <Pin className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryBadgeColor(announcement.category)}`}>
              {ANNOUNCEMENT_CATEGORY_LABELS[announcement.category as keyof typeof ANNOUNCEMENT_CATEGORY_LABELS]}
            </span>
            {announcement.is_important && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-at-error-bg text-at-error">
                <AlertCircle className="w-3 h-3" />
                중요
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-at-text mb-4">{announcement.title}</h1>
          {/* 메타 정보 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-at-border">
            <div className="flex items-center gap-3 text-xs text-at-text-weak">
              <span className="text-at-text-secondary font-medium">{announcement.author_name}</span>
              <span>{formatDate(announcement.created_at)}</span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />{announcement.view_count}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setShowShareDialog(true)} className="text-at-text-weak hover:text-at-accent hidden sm:inline-flex">
                <Share2 className="w-3.5 h-3.5 mr-1" />공유
              </Button>
              {onEdit && (
                <Button variant="ghost" size="sm" onClick={onEdit} className="text-at-text-weak hover:text-at-text-secondary hidden sm:inline-flex">
                  <Pencil className="w-3.5 h-3.5 mr-1" />수정
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="sm" onClick={onDelete} className="text-at-text-weak hover:text-red-500 hidden sm:inline-flex">
                  <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
                </Button>
              )}
            </div>
          </div>
          {/* 일정 정보 */}
          {announcement.start_date && (
            <div className="mt-4 p-3 bg-at-accent-light rounded-xl">
              <div className="flex items-center gap-2 text-at-accent">
                <Calendar className="w-4 h-4" />
                <span className="font-medium">일정</span>
              </div>
              <p className="mt-1 text-at-accent">
                {announcement.start_date}
                {announcement.end_date && announcement.end_date !== announcement.start_date && (
                  <> ~ {announcement.end_date}</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* 본문 영역 */}
        <div className="p-4 sm:p-6">
          <div
            className="prose prose-sm max-w-none text-at-text-secondary whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(announcement.content) }}
          />
        </div>
      </div>

      {/* 하단 액션 바 */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-text-secondary bg-white border border-at-border rounded-xl hover:bg-at-surface-alt transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로
        </button>
        <button
          onClick={() => setShowShareDialog(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-accent bg-white border border-at-border rounded-xl hover:bg-at-accent-light transition-colors"
        >
          <Share2 className="w-4 h-4" />
          공유
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-text-secondary bg-white border border-at-border rounded-xl hover:bg-at-surface-alt transition-colors"
          >
            <Pencil className="w-4 h-4" />
            수정
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-at-error bg-white border border-red-200 rounded-xl hover:bg-at-error-bg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            삭제
          </button>
        )}
      </div>

      {/* 공유 다이얼로그 */}
      <ShareDialog
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
        sourceType="announcement"
        sourceId={announcement.id}
      />
    </div>
  )
}
