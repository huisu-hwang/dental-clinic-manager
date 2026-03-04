'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Megaphone,
  Pin,
  Plus,
  Search,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { announcementService } from '@/lib/bulletinService'
import type { Announcement, AnnouncementCategory } from '@/types/bulletin'
import { ANNOUNCEMENT_CATEGORY_LABELS } from '@/types/bulletin'
import AnnouncementDetail from './AnnouncementDetail'
import AnnouncementForm from './AnnouncementForm'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

interface AnnouncementListProps {
  canCreate?: boolean
}

export default function AnnouncementList({ canCreate = false }: AnnouncementListProps) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<AnnouncementCategory | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)

  const ITEMS_PER_PAGE = 10

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, total: totalCount, error: fetchError } = await announcementService.getAnnouncements({
      category: selectedCategory || undefined,
      search: searchQuery || undefined,
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    })

    if (fetchError) {
      setError(fetchError)
    } else {
      setAnnouncements(data || [])
      setTotal(totalCount)
    }
    setLoading(false)
  }, [selectedCategory, searchQuery, page])

  useEffect(() => {
    fetchAnnouncements()
  }, [fetchAnnouncements])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchAnnouncements()
  }

  const handleCategoryChange = (category: AnnouncementCategory | '') => {
    setSelectedCategory(category)
    setPage(1)
  }

  const handleAnnouncementClick = async (announcement: Announcement) => {
    const { data } = await announcementService.getAnnouncement(announcement.id)
    if (data) {
      setSelectedAnnouncement(data)
    }
  }

  const handleEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setShowForm(true)
    setSelectedAnnouncement(null)
  }

  const handleDelete = async (id: string) => {
    if (!await appConfirm('정말 삭제하시겠습니까?')) return

    const { success, error: deleteError } = await announcementService.deleteAnnouncement(id)
    if (success) {
      fetchAnnouncements()
      setSelectedAnnouncement(null)
    } else {
      await appAlert(deleteError || '삭제에 실패했습니다.')
    }
  }

  const handleFormSubmit = () => {
    setShowForm(false)
    setEditingAnnouncement(null)
    fetchAnnouncements()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingAnnouncement(null)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  const getCategoryBadgeColor = (category: AnnouncementCategory) => {
    switch (category) {
      case 'schedule':
        return 'bg-blue-100 text-blue-700'
      case 'holiday':
        return 'bg-red-100 text-red-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

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

  if (showForm) {
    return (
      <AnnouncementForm
        announcement={editingAnnouncement}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
      />
    )
  }

  if (selectedAnnouncement) {
    return (
      <AnnouncementDetail
        announcement={selectedAnnouncement}
        onBack={() => setSelectedAnnouncement(null)}
        onEdit={canCreate ? () => handleEdit(selectedAnnouncement) : undefined}
        onDelete={canCreate ? () => handleDelete(selectedAnnouncement.id) : undefined}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">공지사항</h2>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            새 공지 작성
          </Button>
        )}
      </div>

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value as AnnouncementCategory | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 카테고리</option>
            {Object.entries(ANNOUNCEMENT_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="제목 또는 내용 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="outline">검색</Button>
        </form>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <Megaphone className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>등록된 공지사항이 없습니다.</p>
        </div>
      ) : (
        <>
          {/* 공지사항 목록 */}
          <div className="bg-white rounded-lg border border-gray-200">
            {/* 테이블 헤더 */}
            <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
              <div className="w-5 flex-shrink-0" />
              <div className="hidden sm:block w-16 flex-shrink-0 text-center">분류</div>
              <div className="hidden sm:block w-10 flex-shrink-0 text-center">중요</div>
              <div className="flex-1 min-w-0 text-center">제목</div>
              <div className="hidden sm:block w-20 text-center flex-shrink-0">작성자</div>
              <div className="w-20 text-center flex-shrink-0">작성일</div>
              <div className="hidden sm:block w-12 text-center flex-shrink-0">조회</div>
            </div>
            {/* 목록 */}
            <div className="divide-y divide-gray-200">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  onClick={() => handleAnnouncementClick(announcement)}
                  className="flex items-center px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  {/* 고정 아이콘 */}
                  <div className="w-5 flex-shrink-0 flex items-center justify-center">
                    {announcement.is_pinned && (
                      <Pin className="w-3.5 h-3.5 text-red-500" />
                    )}
                  </div>
                  {/* 분류 */}
                  <div className="hidden sm:block w-16 flex-shrink-0 text-center">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getCategoryBadgeColor(announcement.category)}`}>
                      {ANNOUNCEMENT_CATEGORY_LABELS[announcement.category]}
                    </span>
                  </div>
                  {/* 중요 */}
                  <div className="hidden sm:block w-10 flex-shrink-0 text-center">
                    {announcement.is_important && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                        중요
                      </span>
                    )}
                  </div>
                  {/* 제목 */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    {/* 모바일: 배지를 제목 앞에 인라인 표시 */}
                    <span className={`sm:hidden text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${getCategoryBadgeColor(announcement.category)}`}>
                      {ANNOUNCEMENT_CATEGORY_LABELS[announcement.category]}
                    </span>
                    {announcement.is_important && (
                      <span className="sm:hidden text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 flex-shrink-0">
                        중요
                      </span>
                    )}
                    <span className="text-sm text-gray-900 truncate">{announcement.title}</span>
                  </div>
                  {/* 작성자 */}
                  <div className="hidden sm:block w-20 text-center text-sm text-gray-500 flex-shrink-0">
                    {announcement.author_name}
                  </div>
                  {/* 작성일 */}
                  <div className="w-20 text-center text-sm text-gray-500 flex-shrink-0">
                    {formatDate(announcement.created_at)}
                  </div>
                  {/* 조회수 */}
                  <div className="hidden sm:block w-12 text-center text-sm text-gray-500 flex-shrink-0">
                    {announcement.view_count}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
