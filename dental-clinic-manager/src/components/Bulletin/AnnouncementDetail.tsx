'use client'

import {
  ArrowLeft,
  Calendar,
  Eye,
  Edit2,
  Trash2,
  Pin,
  AlertCircle,
  User
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Announcement } from '@/types/bulletin'
import { ANNOUNCEMENT_CATEGORY_LABELS } from '@/types/bulletin'

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
      case 'policy':
        return 'bg-purple-100 text-purple-700'
      case 'welfare':
        return 'bg-green-100 text-green-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          목록으로
        </Button>
        {(onEdit || onDelete) && (
          <div className="flex items-center gap-2">
            {onEdit && (
              <Button variant="outline" onClick={onEdit} className="flex items-center gap-2">
                <Edit2 className="w-4 h-4" />
                수정
              </Button>
            )}
            {onDelete && (
              <Button
                variant="outline"
                onClick={onDelete}
                className="flex items-center gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
                삭제
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 공지사항 내용 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* 제목 영역 */}
        <div className="p-6 border-b border-gray-200">
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
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {announcement.author_name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(announcement.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              조회 {announcement.view_count}
            </span>
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
        <div className="p-6">
          <div
            className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap"
            dangerouslySetInnerHTML={{ __html: announcement.content }}
          />
        </div>
      </div>
    </div>
  )
}
