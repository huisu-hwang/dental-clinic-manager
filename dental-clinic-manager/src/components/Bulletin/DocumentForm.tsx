'use client'

import { useState, useRef } from 'react'
import { ArrowLeft, Save, Upload, X, FileText, Image, FileSpreadsheet, FileType, Download, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { documentService } from '@/lib/bulletinService'
import { createClient } from '@/lib/supabase/client'
import type { Document, DocumentCategory, CreateDocumentDto, DocumentAttachment } from '@/types/bulletin'
import { DOCUMENT_CATEGORY_LABELS, normalizeDocumentAttachments } from '@/types/bulletin'
import EnhancedTiptapEditor from '@/components/Protocol/EnhancedTiptapEditor'

interface DocumentFormProps {
  document?: Document | null
  onSubmit: () => void
  onCancel: () => void
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export default function DocumentForm({
  document,
  onSubmit,
  onCancel,
}: DocumentFormProps) {
  const [formData, setFormData] = useState<CreateDocumentDto>({
    title: document?.title || '',
    description: document?.description || '',
    category: document?.category || 'manual',
    attachments: document ? normalizeDocumentAttachments(document) : [],
    content: document?.content || '',
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!document
  const attachments = formData.attachments || []

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return

    // 파일 크기 검사
    const oversized = files.find(f => f.size > MAX_FILE_SIZE)
    if (oversized) {
      setError(`"${oversized.name}" 파일이 10MB를 초과합니다. 각 파일은 10MB 이하여야 합니다.`)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const clinicId = sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')
      if (!clinicId) {
        throw new Error('클리닉 정보를 찾을 수 없습니다.')
      }

      const uploaded: DocumentAttachment[] = []

      for (const file of files) {
        const timestamp = Date.now()
        const random = Math.random().toString(36).slice(2, 8)
        const fileExt = file.name.split('.').pop()
        const safeName = `${timestamp}-${random}.${fileExt}`
        const filePath = `documents/${clinicId}/${safeName}`

        const { error: uploadError } = await supabase.storage
          .from('bulletin-files')
          .upload(filePath, file)

        if (uploadError) {
          if (uploadError.message.includes('not found')) {
            throw new Error('파일 저장소가 설정되지 않았습니다. 관리자에게 문의하세요.')
          }
          throw uploadError
        }

        const { data: urlData } = supabase.storage
          .from('bulletin-files')
          .getPublicUrl(filePath)

        uploaded.push({
          url: urlData.publicUrl,
          name: file.name,
          size: file.size,
        })
      }

      setFormData(prev => ({
        ...prev,
        attachments: [...(prev.attachments || []), ...uploaded],
      }))
    } catch (err) {
      console.error('File upload error:', err)
      setError(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveAttachment = (index: number) => {
    setFormData(prev => {
      const next = [...(prev.attachments || [])]
      next.splice(index, 1)
      return { ...prev, attachments: next }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('제목을 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isEditing) {
        const { error: updateError } = await documentService.updateDocument(document.id, formData)
        if (updateError) throw new Error(updateError)
      } else {
        const { error: createError } = await documentService.createDocument(formData)
        if (createError) throw new Error(createError)
      }
      onSubmit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
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

  // 이미지 파일인지 확인
  const isImageFile = (fileName?: string) => getFileType(fileName) === 'image'

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          취소
        </Button>
        <h2 className="text-lg font-semibold text-at-text">
          {isEditing ? '문서 수정' : '새 문서 등록'}
        </h2>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-at-border p-6 space-y-6">
        {error && (
          <div className="p-4 bg-at-error-bg text-at-error rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* 카테고리 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            카테고리 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as DocumentCategory })}
            className="w-full border border-at-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-at-accent"
          >
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            제목 <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="문서 제목을 입력하세요"
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            설명
          </label>
          <Input
            type="text"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="문서에 대한 간단한 설명을 입력하세요"
          />
        </div>

        {/* 파일 업로드 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-at-text-secondary">
              첨부파일
              {attachments.length > 0 && (
                <span className="ml-2 text-xs text-at-text-weak">({attachments.length}개)</span>
              )}
            </label>
            {attachments.length > 0 && !uploading && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-at-accent"
              >
                <Plus className="w-4 h-4" />
                파일 추가
              </Button>
            )}
          </div>

          {attachments.length > 0 ? (
            <div className="space-y-3">
              {attachments.map((att, idx) => (
                <div key={`${att.url}-${idx}`} className="space-y-2">
                  {/* 파일 정보 */}
                  <div className="flex items-center gap-3 p-3 bg-at-surface-alt rounded-xl">
                    {getFileIcon(att.name)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-at-text truncate">{att.name}</p>
                      {att.size > 0 && (
                        <p className="text-xs text-at-text-weak">{formatFileSize(att.size)}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <a
                        href={att.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-at-text-weak hover:text-at-accent transition-colors"
                        title="다운로드"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAttachment(idx)}
                        className="text-at-text-weak hover:text-red-500"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* 이미지 미리보기 */}
                  {isImageFile(att.name) && (
                    <div className="border border-at-border rounded-xl overflow-hidden bg-at-surface-alt">
                      <div className="p-2 bg-at-surface-alt border-b border-at-border">
                        <p className="text-xs text-at-text-weak font-medium">미리보기</p>
                      </div>
                      <div className="p-4 flex justify-center">
                        <img
                          src={att.url}
                          alt={att.name}
                          className="max-w-full max-h-64 object-contain rounded"
                        />
                      </div>
                    </div>
                  )}

                  {/* PDF 미리보기 */}
                  {getFileType(att.name) === 'pdf' && (
                    <div className="border border-at-border rounded-xl overflow-hidden bg-at-surface-alt">
                      <div className="p-2 bg-at-surface-alt border-b border-at-border">
                        <p className="text-xs text-at-text-weak font-medium">미리보기</p>
                      </div>
                      <div className="p-4">
                        <iframe
                          src={att.url}
                          className="w-full h-96 border-0 rounded"
                          title={`PDF 미리보기: ${att.name}`}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {uploading && (
                <div className="flex items-center justify-center gap-2 p-3 text-sm text-at-text-weak bg-at-surface-alt rounded-xl">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-at-accent" />
                  <span>업로드 중...</span>
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-at-border rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-at-text-weak">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-at-accent"></div>
                  <span>업로드 중...</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-at-text-weak mb-2" />
                  <p className="text-sm text-at-text-secondary">
                    클릭하여 파일을 선택하거나 드래그하세요 (여러 개 선택 가능)
                  </p>
                  <p className="text-xs text-at-text-weak mt-1">
                    각 파일 최대 10MB (이미지, PDF, 문서 파일)
                  </p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.hwp,.txt,.csv"
          />
        </div>

        {/* 내용 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">
            내용
          </label>
          <EnhancedTiptapEditor
            content={formData.content || ''}
            onChange={(content) => setFormData({ ...formData, content })}
            placeholder="문서 내용을 입력하세요 (선택사항)"
            enableTable={false}
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-at-border">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={loading || uploading} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            {loading ? '저장 중...' : (isEditing ? '수정' : '등록')}
          </Button>
        </div>
      </form>
    </div>
  )
}
