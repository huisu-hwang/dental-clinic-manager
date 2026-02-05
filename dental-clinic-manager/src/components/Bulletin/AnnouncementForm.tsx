'use client'

import { useState } from 'react'
import { ArrowLeft, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { announcementService } from '@/lib/bulletinService'
import type { Announcement, AnnouncementCategory, CreateAnnouncementDto } from '@/types/bulletin'
import { ANNOUNCEMENT_CATEGORY_LABELS } from '@/types/bulletin'
import EnhancedTiptapEditor from '@/components/Protocol/EnhancedTiptapEditor'

interface AnnouncementFormProps {
  announcement?: Announcement | null
  onSubmit: () => void
  onCancel: () => void
}

export default function AnnouncementForm({
  announcement,
  onSubmit,
  onCancel,
}: AnnouncementFormProps) {
  const [formData, setFormData] = useState<CreateAnnouncementDto>({
    title: announcement?.title || '',
    content: announcement?.content || '',
    category: announcement?.category || 'general',
    is_pinned: announcement?.is_pinned || false,
    is_important: announcement?.is_important || false,
    start_date: announcement?.start_date || '',
    end_date: announcement?.end_date || '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isEditing = !!announcement

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('제목을 입력해주세요.')
      return
    }
    if (!formData.content.trim()) {
      setError('내용을 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isEditing) {
        const { error: updateError } = await announcementService.updateAnnouncement(announcement.id, formData)
        if (updateError) throw new Error(updateError)
      } else {
        const { error: createError } = await announcementService.createAnnouncement(formData)
        if (createError) throw new Error(createError)
      }
      onSubmit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const showDateFields = formData.category === 'schedule' || formData.category === 'holiday'

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          취소
        </Button>
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditing ? '공지사항 수정' : '새 공지사항 작성'}
        </h2>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 카테고리 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            카테고리 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as AnnouncementCategory })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(ANNOUNCEMENT_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            제목 <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="공지사항 제목을 입력하세요"
          />
        </div>

        {/* 일정 날짜 (schedule, holiday 카테고리인 경우) */}
        {showDateFields && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                시작일
              </label>
              <Input
                type="date"
                value={formData.start_date || ''}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                종료일
              </label>
              <Input
                type="date"
                value={formData.end_date || ''}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* 내용 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            내용 <span className="text-red-500">*</span>
          </label>
          <EnhancedTiptapEditor
            content={formData.content}
            onChange={(content) => setFormData({ ...formData, content })}
            placeholder="공지사항 내용을 입력하세요"
          />
        </div>

        {/* 옵션 */}
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_pinned}
              onChange={(e) => setFormData({ ...formData, is_pinned: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">상단 고정</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_important}
              onChange={(e) => setFormData({ ...formData, is_important: e.target.checked })}
              className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">중요 공지</span>
          </label>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={loading} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            {loading ? '저장 중...' : (isEditing ? '수정' : '등록')}
          </Button>
        </div>
      </form>
    </div>
  )
}
