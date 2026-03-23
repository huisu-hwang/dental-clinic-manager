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
        return 'bg-blue-100 text-blue-700'
      case 'holiday':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <nav className="flex items-center text-sm">
          <button onClick={onBack} className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
            공지사항
          </button>
          <span className="mx-2 text-gray-400">›</span>
          <span className="text-gray-500 truncate max-w-[200px] sm:max-w-[400px]">{announcement.title}</span>
        </nav>
      </div>

      {/* 공지사항 내용 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 제목 영역 */}
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            {announcement.is_pinned && (
              <Pin className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryBadgeColor(announcement.category)}`}>
              {ANNOUNCEMENT_CATEGORY_LABELS[announcement.category as keyof typeof ANNOUNCEMENT_CATEGORY_LABELS]}
            </span>
            {announcement.is_important && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                <AlertCircle className="w-3 h-3" />
                중요
              </span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-4">{announcement.title}</h1>
          {/* 메타 정보 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="text-gray-600 font-medium">{announcement.author_name}</span>
              <span>{formatDate(announcement.created_at)}</span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />{announcement.view_count}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => setShowShareDialog(true)} className="text-gray-400 hover:text-blue-500 hidden sm:inline-flex">
                <Share2 className="w-3.5 h-3.5 mr-1" />공유
              </Button>
              {onEdit && (
                <Button variant="ghost" size="sm" onClick={onEdit} className="text-gray-400 hover:text-gray-600 hidden sm:inline-flex">
                  <Pencil className="w-3.5 h-3.5 mr-1" />수정
                </Button>
              )}
              {onDelete && (
                <Button variant="ghost" size="sm" onClick={onDelete} className="text-gray-400 hover:text-red-500 hidden sm:inline-flex">
                  <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
                </Button>
              )}
            </div>
          </div>
          {/* 일정 정보 */}
          {announcement.start_date && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <div className="flex items-center gap-2 text-blue-700">
                <Calendar className="w-4 h-4" />
                <span className="font-medium">일정</span>
              </div>
              <p className="mt-1 text-blue-600">
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
            className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: announcement.content }}
          />
        </div>
      </div>

      {/* 하단 액션 바 */}
      <div className="flex items-center justify-center gap-2 mt-2">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          목록으로
        </button>
        <button
          onClick={() => setShowShareDialog(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Share2 className="w-4 h-4" />
          공유
        </button>
        {onEdit && (
          <button
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Pencil className="w-4 h-4" />
            수정
          </button>
        )}
        {onDelete && (
          <button
            onClick={onDelete}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
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
