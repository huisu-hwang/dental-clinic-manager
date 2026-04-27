'use client'

import { useState } from 'react'
import {
  ArrowLeft,
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
import { DOCUMENT_CATEGORY_LABELS, normalizeDocumentAttachments } from '@/types/bulletin'
import { documentService } from '@/lib/bulletinService'
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
  const attachments = normalizeDocumentAttachments(document)
  const hasAttachments = attachments.length > 0

  const handleDownloadAttachment = async (url: string) => {
    await documentService.incrementDownloadCount(document.id)
    window.open(url, '_blank')
  }

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
        return <FileSpreadsheet className="w-5 h-5 text-at-success" />
      case 'word':
        return <FileType className="w-5 h-5 text-at-accent" />
      default:
        return <FileText className="w-5 h-5 text-at-text-weak" />
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
        return 'bg-at-tag text-at-accent'
      case 'form':
        return 'bg-at-success-bg text-at-success'
      case 'guideline':
        return 'bg-purple-100 text-purple-700'
      case 'reference':
        return 'bg-orange-100 text-orange-700'
      default:
        return 'bg-at-surface-alt text-at-text-secondary'
    }
  }

  const previewableAttachments = attachments.filter(a => canPreview(a.name))

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <nav className="flex items-center text-sm">
          <button onClick={onBack} className="text-at-accent hover:text-at-accent font-medium transition-colors">
            문서 모음
          </button>
          <span className="mx-2 text-at-text-weak">›</span>
          <span className="text-at-text-weak truncate max-w-[200px] sm:max-w-[400px]">{document.title}</span>
        </nav>
      </div>

      {/* 문서 내용 */}
      <div className="bg-white rounded-2xl border border-at-border overflow-hidden">
        {/* 제목 영역 */}
        <div className="p-4 sm:p-6 border-b border-at-border">
          <div className="flex items-center gap-2 mb-3">
            <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryBadgeColor(document.category)}`}>
              {DOCUMENT_CATEGORY_LABELS[document.category as keyof typeof DOCUMENT_CATEGORY_LABELS]}
            </span>
          </div>
          <h1 className="text-xl font-bold text-at-text mb-2">{document.title}</h1>
          {document.description && (
            <p className="text-at-text-secondary mb-4">{document.description}</p>
          )}
          {/* 메타 정보 */}
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-at-border">
            <div className="flex items-center gap-3 text-xs text-at-text-weak">
              <span className="text-at-text-secondary font-medium">{document.author_name}</span>
              <span>{formatDate(document.created_at)}</span>
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />{document.view_count}
              </span>
              {hasAttachments && (
                <span className="flex items-center gap-1">
                  <Download className="w-3 h-3" />{document.download_count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {hasAttachments && onDownload && (
                <Button variant="ghost" size="sm" onClick={onDownload} className="text-at-text-weak hover:text-at-accent">
                  <Download className="w-3.5 h-3.5 mr-1" />다운로드
                </Button>
              )}
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

          {/* 첨부파일 정보 */}
          {hasAttachments && (
            <div className="mt-4 p-3 bg-at-surface-alt rounded-xl">
              <div className="flex items-center gap-2 text-at-text-secondary mb-2">
                <FileText className="w-4 h-4" />
                <span className="font-medium">첨부파일 ({attachments.length}개)</span>
              </div>
              <ul className="divide-y divide-at-border">
                {attachments.map((att, idx) => (
                  <li key={`${att.url}-${idx}`} className="py-2 flex items-center gap-3">
                    {getFileIcon(att.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-at-text-secondary truncate">{att.name}</p>
                      {att.size > 0 && (
                        <p className="text-xs text-at-text-weak">{formatFileSize(att.size)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => handleDownloadAttachment(att.url)}
                        className="text-at-accent hover:text-at-accent"
                      >
                        다운로드
                      </Button>
                      {canPreview(att.name) && (
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-at-text-weak hover:text-at-text-secondary flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          새 탭
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* 파일 미리보기 영역 */}
        {previewableAttachments.length > 0 && (
          <div className="border-b border-at-border">
            <div className="p-3 bg-at-surface-alt border-b border-at-border">
              <p className="text-sm text-at-text-secondary font-medium flex items-center gap-2">
                <FileText className="w-4 h-4" />
                파일 미리보기
              </p>
            </div>
            <div className="p-4 bg-at-surface-alt space-y-4">
              {previewableAttachments.map((att, idx) => {
                const type = getFileType(att.name)
                return (
                  <div key={`preview-${att.url}-${idx}`} className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-at-text-weak">
                      {getFileIcon(att.name)}
                      <span className="truncate">{att.name}</span>
                    </div>
                    {type === 'image' && (
                      <div className="flex justify-center">
                        <img
                          src={att.url}
                          alt={att.name}
                          className="max-w-full max-h-[600px] object-contain rounded-xl shadow-at-card"
                        />
                      </div>
                    )}
                    {type === 'pdf' && (
                      <div className="bg-white rounded-xl overflow-hidden shadow-at-card">
                        <iframe
                          src={att.url}
                          className="w-full h-[600px] border-0"
                          title={`PDF 미리보기: ${att.name}`}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 본문 영역 */}
        {document.content && (
          <div className="p-4 sm:p-6">
            <div
              className="prose prose-sm max-w-none text-at-text-secondary whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(document.content) }}
            />
          </div>
        )}

        {/* 본문도 파일도 없는 경우 */}
        {!document.content && !hasAttachments && (
          <div className="p-4 sm:p-6 text-center text-at-text-weak">
            <FileText className="w-12 h-12 mx-auto text-at-text-weak mb-2" />
            <p>등록된 내용이 없습니다.</p>
          </div>
        )}
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
        sourceType="document"
        sourceId={document.id}
      />
    </div>
  )
}
