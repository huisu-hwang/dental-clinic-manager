'use client'

import { useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  Eye,
  Download,
  Pencil,
  Trash2,
  FileText,
  Image,
  FileSpreadsheet,
  FileType,
  ExternalLink,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { Document } from '@/types/bulletin'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/bulletin'
import ShareDialog from '@/components/shared/ShareDialog'
import { sanitizeHtml } from '@/utils/sanitize'

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

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // 파일 확장자로 타입 판단
  const getFileType = (fileName?: string): 'image' | 'pdf' | 'excel' | 'word' | 'other' => {
    if (!fileName) return 'other'
    const ext = fileName.split('.').pop()?.toLowerCase()
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image'
    if (ext === 'pdf') return 'pdf'
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return 'excel'
    if (['doc', 'docx', 'hwp'].includes(ext || '')) return 'word'
    return 'other'
  }

  // 파일 아이콘 선택
  const getFileIcon = (fileName?: string) => {
    const type = getFileType(fileName)
    switch (type) {
      case 'image':
        return <Image className="w-5 h-5 text-green-500" />
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-500" />
      case 'excel':
        return <FileSpreadsheet className="w-5 h-5 text-green-600" />
      case 'word':
        return <FileType className="w-5 h-5 text-blue-600" />
      default:
        return <FileText className="w-5 h-5 text-gray-500" />
    }
  }

  // 미리보기 가능 여부
  const canPreview = (fileName?: string) => {
    const type = getFileType(fileName)
    return type === 'image' || type === 'pdf'
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

  const fileType = getFileType(document.file_name)

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <nav className="flex items-center text-sm">
          <button onClick={onBack} className="text-blue-600 hover:text-blue-700 font-medium transition-colors">
            문서 모음
          </button>
          <span className="mx-2 text-gray-400">›</span>
          <span className="text-gray-500 truncate max-w-[200px] sm:max-w-[400px]">{document.title}</span>
        </nav>
      </div>

      {/* 문서 내용 */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* 제목 영역 */}
        <div className="p-4 sm:p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryBadgeColor(document.category)}`}>
              {DOCUMENT_CATEGORY_LABELS[document.category as keyof typeof DOCUMENT_CATEGORY_LABELS]}
            </span>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">{document.title}</h1>
          {document.description && (
            <p className="text-gray-600 mb-4">{document.description}</p>
          )}
          {/* 메타 정보 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="text-gray-600 font-medium">{document.author_name}</span>
              <span>{formatDate(document.created_at)}</span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />{document.view_count}
              </span>
              {document.file_name && (
                <span className="flex items-center gap-1">
                  <Download className="w-3 h-3" />{document.download_count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {document.file_url && onDownload && (
                <Button variant="ghost" size="sm" onClick={onDownload} className="text-gray-400 hover:text-blue-500">
                  <Download className="w-3.5 h-3.5 mr-1" />다운로드
                </Button>
              )}
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

          {/* 첨부파일 정보 */}
          {document.file_name && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-gray-700">
                {getFileIcon(document.file_name)}
                <span className="font-medium">첨부파일</span>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className="text-sm text-gray-600">{document.file_name}</span>
                {document.file_size && (
                  <span className="text-xs text-gray-400">({formatFileSize(document.file_size)})</span>
                )}
                {document.file_url && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="link"
                      size="sm"
                      onClick={onDownload}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      다운로드
                    </Button>
                    {canPreview(document.file_name) && (
                      <a
                        href={document.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        새 탭에서 열기
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 파일 미리보기 영역 */}
        {document.file_url && canPreview(document.file_name) && (
          <div className="border-b border-gray-200">
            <div className="p-3 bg-gray-100 border-b border-gray-200">
              <p className="text-sm text-gray-600 font-medium flex items-center gap-2">
                {getFileIcon(document.file_name)}
                파일 미리보기
              </p>
            </div>
            <div className="p-4 bg-gray-50">
              {fileType === 'image' && (
                <div className="flex justify-center">
                  <img
                    src={document.file_url}
                    alt={document.file_name || document.title}
                    className="max-w-full max-h-[600px] object-contain rounded-lg shadow-sm"
                  />
                </div>
              )}
              {fileType === 'pdf' && (
                <div className="bg-white rounded-lg overflow-hidden shadow-sm">
                  <iframe
                    src={document.file_url}
                    className="w-full h-[600px] border-0"
                    title="PDF 미리보기"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* 본문 영역 */}
        {document.content && (
          <div className="p-4 sm:p-6">
            <div
              className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(document.content) }}
            />
          </div>
        )}

        {/* 본문도 파일도 없는 경우 */}
        {!document.content && !document.file_url && (
          <div className="p-4 sm:p-6 text-center text-gray-500">
            <FileText className="w-12 h-12 mx-auto text-gray-300 mb-2" />
            <p>등록된 내용이 없습니다.</p>
          </div>
        )}
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
        sourceType="document"
        sourceId={document.id}
      />
    </div>
  )
}
