'use client'

import { useState, useRef, useCallback } from 'react'
import { X, Loader2, Send as SendIcon, Upload, FileText, Image as ImageIcon, FileSpreadsheet, FileType, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import EnhancedTiptapEditor from '@/components/Protocol/EnhancedTiptapEditor'
import { mediaService } from '@/lib/mediaService'
import type { TelegramBoardPost, TelegramBoardCategory } from '@/types/telegram'
import { getCategoryColorClasses } from '@/types/telegram'

interface FileAttachment {
  url: string
  name: string
  type?: string
  size?: number
}

interface TelegramBoardPostFormProps {
  mode: 'create' | 'edit'
  post?: TelegramBoardPost | null
  categories?: TelegramBoardCategory[]
  onSubmit: (data: {
    title: string
    content: string
    notifyTelegram: boolean
    fileUrls: FileAttachment[]
    categoryId?: string | null
  }) => Promise<void>
  onCancel: () => void
}

const MAX_FILES = 5

const getFileType = (fileName?: string): 'image' | 'pdf' | 'excel' | 'word' | 'video' | 'other' => {
  if (!fileName) return 'other'
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'csv'].includes(ext || '')) return 'excel'
  if (['doc', 'docx', 'hwp'].includes(ext || '')) return 'word'
  if (['mp4', 'webm', 'mov'].includes(ext || '')) return 'video'
  return 'other'
}

const getFileIcon = (fileName?: string) => {
  const type = getFileType(fileName)
  switch (type) {
    case 'image':
      return <ImageIcon className="w-4 h-4 text-green-500" />
    case 'pdf':
      return <FileText className="w-4 h-4 text-red-500" />
    case 'excel':
      return <FileSpreadsheet className="w-4 h-4 text-green-600" />
    case 'word':
      return <FileType className="w-4 h-4 text-blue-600" />
    default:
      return <FileText className="w-4 h-4 text-at-text-weak" />
  }
}

const formatFileSize = (bytes?: number) => {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1048576).toFixed(1)}MB`
}

export default function TelegramBoardPostForm({
  mode,
  post,
  categories = [],
  onSubmit,
  onCancel,
}: TelegramBoardPostFormProps) {
  const [title, setTitle] = useState(post?.title || '')
  const [content, setContent] = useState(post?.content || '')
  const [notifyTelegram, setNotifyTelegram] = useState(mode === 'create')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(post?.category_id || '')
  const [submitting, setSubmitting] = useState(false)
  const [fileUrls, setFileUrls] = useState<FileAttachment[]>(
    post?.file_urls?.map(f => ({ url: f.url, name: f.name || '', type: f.type, size: f.size })) || []
  )
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleMediaUpload = useCallback(async (file: File) => {
    return mediaService.uploadTelegramBoardMedia(file)
  }, [])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    const remaining = MAX_FILES - fileUrls.length
    if (remaining <= 0) {
      setUploadError(`최대 ${MAX_FILES}개까지 첨부할 수 있습니다.`)
      return
    }

    const filesToUpload = Array.from(files).slice(0, remaining)
    setUploading(true)
    setUploadError(null)

    try {
      for (const file of filesToUpload) {
        const result = await mediaService.uploadTelegramBoardFile(file)
        if (result.error) {
          setUploadError(result.error)
          break
        }
        if (result.url) {
          setFileUrls(prev => [...prev, {
            url: result.url!,
            name: result.name || file.name,
            type: result.type || file.type,
            size: result.size || file.size,
          }])
        }
      }
    } catch {
      setUploadError('파일 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleRemoveFile = (index: number) => {
    setFileUrls(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setSubmitting(true)
    try {
      await onSubmit({ title: title.trim(), content, notifyTelegram, fileUrls, categoryId: selectedCategoryId || null })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-at-border overflow-hidden shadow-at-card">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-at-border bg-at-surface-alt">
        <h3 className="text-sm font-semibold text-at-text">
          {mode === 'create' ? '새 글 작성' : '글 수정'}
        </h3>
        <button onClick={onCancel} className="text-at-text-weak hover:text-at-text-secondary">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 제목 */}
        <div>
          <label htmlFor="post-title" className="block text-sm font-medium text-at-text-secondary mb-1">
            제목
          </label>
          <Input
            id="post-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="제목을 입력하세요"
            className="text-sm"
            required
          />
        </div>

        {/* 카테고리 선택 */}
        {categories.length > 0 && (
          <div>
            <label htmlFor="post-category" className="block text-sm font-medium text-at-text-secondary mb-1">
              카테고리
            </label>
            <select
              id="post-category"
              value={selectedCategoryId}
              onChange={e => setSelectedCategoryId(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-at-border rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-at-accent focus:border-at-accent"
            >
              <option value="">자동 분류 (AI)</option>
              {categories.filter(c => !c.is_default).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
              {categories.filter(c => c.is_default).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
            <p className="text-xs text-at-text-weak mt-1">
              선택하지 않으면 AI가 자동으로 카테고리를 분류합니다.
            </p>
          </div>
        )}

        {/* 본문 에디터 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-1">
            내용
          </label>
          <EnhancedTiptapEditor
            content={content}
            onChange={setContent}
            placeholder="내용을 작성하세요... (이미지/동영상을 드래그하거나 붙여넣기 할 수 있습니다)"
            onMediaUpload={handleMediaUpload}
            enableVideoUpload={true}
          />
        </div>

        {/* 첨부 파일 섹션 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-1">
            첨부 파일 <span className="text-xs text-at-text-weak font-normal">({fileUrls.length}/{MAX_FILES})</span>
          </label>

          {fileUrls.length > 0 && (
            <div className="space-y-2 mb-3">
              {fileUrls.map((file, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-at-surface-alt rounded-xl">
                  {getFileIcon(file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-at-text truncate">{file.name}</p>
                    {file.size && (
                      <p className="text-xs text-at-text-weak">{formatFileSize(file.size)}</p>
                    )}
                  </div>
                  {getFileType(file.name) === 'image' && file.url && (
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    className="p-1 text-at-text-weak hover:text-at-error transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {fileUrls.length < MAX_FILES && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-at-border rounded-xl p-4 text-center cursor-pointer hover:border-at-accent transition-colors"
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-at-text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">업로드 중...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-at-text-weak">
                  <Upload className="w-4 h-4" />
                  <span className="text-sm">클릭하여 파일 첨부 (최대 50MB, {MAX_FILES}개)</span>
                </div>
              )}
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileUpload}
            className="hidden"
            accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.hwp,.txt,.csv,.zip,.pptx"
          />

          {uploadError && (
            <p className="text-xs text-at-error mt-1">{uploadError}</p>
          )}
        </div>

        {/* 텔레그램 알림 (생성 시만) */}
        {mode === 'create' && (
          <label className="flex items-center gap-2 text-sm text-at-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={notifyTelegram}
              onChange={e => setNotifyTelegram(e.target.checked)}
              className="rounded border-at-border text-at-accent focus:ring-at-accent"
            />
            <SendIcon className="w-3.5 h-3.5 text-at-accent" />
            텔레그램 그룹에 알림 전송
          </label>
        )}

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
            취소
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || uploading || !title.trim() || !content.trim()}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                저장 중...
              </>
            ) : (
              mode === 'create' ? '게시' : '수정'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
