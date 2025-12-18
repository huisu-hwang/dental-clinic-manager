'use client'

import {
  ArrowLeft,
  Calendar,
  Eye,
  Download,
  Edit2,
  Trash2,
  User,
  FileText
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Document } from '@/types/bulletin'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/bulletin'

interface DocumentDetailProps {
  document: Document
  onBack: () => void
  onEdit?: () => void
  onDelete?: () => void
  onDownload?: () => void
}

export default function DocumentDetail({
  document,
  onBack,
  onEdit,
  onDelete,
  onDownload,
}: DocumentDetailProps) {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case 'manual':
        return 'bg-blue-100 text-blue-700'
      case 'form':
        return 'bg-green-100 text-green-700'
      case 'guideline':
        return 'bg-purple-100 text-purple-700'
      case 'reference':
        return 'bg-orange-100 text-orange-700'
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
        <div className="flex items-center gap-2">
          {document.file_url && onDownload && (
            <Button variant="outline" onClick={onDownload} className="flex items-center gap-2">
              <Download className="w-4 h-4" />
              다운로드
            </Button>
          )}
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
      </div>

      {/* 문서 내용 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* 제목 영역 */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryBadgeColor(document.category)}`}>
              {DOCUMENT_CATEGORY_LABELS[document.category as keyof typeof DOCUMENT_CATEGORY_LABELS]}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{document.title}</h1>
          {document.description && (
            <p className="text-gray-600 mb-4">{document.description}</p>
          )}
          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-4 h-4" />
              {document.author_name}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {formatDate(document.created_at)}
            </span>
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" />
              조회 {document.view_count}
            </span>
            {document.file_name && (
              <span className="flex items-center gap-1">
                <Download className="w-4 h-4" />
                다운로드 {document.download_count}
              </span>
            )}
          </div>

          {/* 첨부파일 정보 */}
          {document.file_name && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-700">
                <FileText className="w-4 h-4" />
                <span className="font-medium">첨부파일</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-gray-600">{document.file_name}</span>
                {document.file_size && (
                  <span className="text-xs text-gray-400">({formatFileSize(document.file_size)})</span>
                )}
                {document.file_url && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={onDownload}
                    className="text-blue-600 hover:text-blue-700"
                  >
                    다운로드
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 본문 영역 */}
        {document.content && (
          <div className="p-6">
            <div
              className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: document.content }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
