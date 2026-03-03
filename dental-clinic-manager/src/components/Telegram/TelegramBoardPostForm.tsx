'use client'

import { useState, useRef, useCallback } from 'react'
import { X, Loader2, Send as SendIcon, Upload, FileText, Image as ImageIcon, FileSpreadsheet, FileType, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import EnhancedTiptapEditor from '@/components/Protocol/EnhancedTiptapEditor'
import { mediaService } from '@/lib/mediaService'
import type { TelegramBoardPost } from '@/types/telegram'

interface FileAttachment {
  url: string
  name: string
  type?: string
  size?: number
}

interface TelegramBoardPostFormProps {
  mode: 'create' | 'edit'
  post?: TelegramBoardPost | null
  onSubmit: (data: {
    title: string
    content: string
    notifyTelegram: boolean
    fileUrls: FileAttachment[]
  }) => Promise<void>
  onCancel: () => void
}

const MAX_FILES = 5

// 파일 확장자로 타입 판단
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
      return <FileText className="w-4 h-4 text-gray-500" />
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
  onSubmit,
  onCancel,
}: TelegramBoardPostFormProps) {
  const [title, setTitle] = useState(post?.title || '')
  const [content, setContent] = useState(post?.content || '')
  const [notifyTelegram, setNotifyTelegram] = useState(mode === 'create')
  const [submitting, setSubmitting] = useState(false)
  const [fileUrls, setFileUrls] = useState<FileAttachment[]>(
    post?.file_urls?.map(f => ({ url: f.url, name: f.name || '', type: f.type, size: f.size })) || []
  )
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 에디터 내 미디어 업로드 핸들러 (이미지/동영상 본문 삽입)
  const handleMediaUpload = useCallback(async (file: File) => {
    return mediaService.uploadTelegramBoardMedia(file)
  }, [])

  // 첨부 파일 업로드
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
      await onSubmit({ title: title.trim(), content, notifyTelegram, fileUrls })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-900">
          {mode === 'create' ? '새 글 작성' : '글 수정'}
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 제목 */}
        <div>
          <label htmlFor="post-title" className="block text-sm font-medium text-gray-700 mb-1">
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

        {/* 본문 에디터 (EnhancedTiptapEditor) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
          <label className="block text-sm font-medium text-gray-700 mb-1">
            첨부 파일 <span className="text-xs text-gray-400 font-normal">({fileUrls.length}/{MAX_FILES})</span>
          </label>

          {/* 파일 목록 */}
          {fileUrls.length > 0 && (
            <div className="space-y-2 mb-3">
              {fileUrls.map((file, i) => (
                <div key={i} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                  {getFileIcon(file.name)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 truncate">{file.name}</p>
                    {file.size && (
                      <p className="text-xs text-gray-400">{formatFileSize(file.size)}</p>
                    )}
                  </div>
                  {/* 이미지 썸네일 미리보기 */}
                  {getFileType(file.name) === 'image' && file.url && (
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-10 h-10 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => handleRemoveFile(i)}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 파일 업로드 버튼 */}
          {fileUrls.length < MAX_FILES && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center cursor-pointer hover:border-sky-300 transition-colors"
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">업로드 중...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 text-gray-400">
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
            <p className="text-xs text-red-500 mt-1">{uploadError}</p>
          )}
        </div>

        {/* 텔레그램 알림 (생성 시만) */}
        {mode === 'create' && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={notifyTelegram}
              onChange={e => setNotifyTelegram(e.target.checked)}
              className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
            />
            <SendIcon className="w-3.5 h-3.5 text-sky-500" />
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
