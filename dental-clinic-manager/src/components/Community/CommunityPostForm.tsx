'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, Loader2, Plus, X, BarChart3, Paperclip, Upload, FileText, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityPostService, communityAttachmentService } from '@/lib/communityService'
import type {
  CommunityCategory,
  CommunityPost,
  CommunityCategoryItem,
  CommunityPostAttachment,
  CreatePostDto,
} from '@/types/community'
import { COMMUNITY_ATTACHMENT_MAX_SIZE, COMMUNITY_ATTACHMENT_MAX_COUNT } from '@/types/community'

interface CommunityPostFormProps {
  profileId: string
  editingPost?: CommunityPost | null
  categories: CommunityCategoryItem[]
  labelMap: Record<string, string>
  onSubmit: () => void
  onCancel: () => void
}

type AttachmentDraft =
  | { kind: 'existing'; id: string; existing: CommunityPostAttachment }
  | { kind: 'new'; tempId: string; file: File; previewUrl?: string }

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-hwp',
])

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

const isImageType = (type?: string) => !!type && type.startsWith('image/')

const inferExtensionFromType = (type: string): string => {
  if (type === 'image/png') return 'png'
  if (type === 'image/jpeg') return 'jpg'
  if (type === 'image/gif') return 'gif'
  if (type === 'image/webp') return 'webp'
  return 'bin'
}

export default function CommunityPostForm({ profileId, editingPost, categories, labelMap, onSubmit, onCancel }: CommunityPostFormProps) {
  const [category, setCategory] = useState<CommunityCategory>(editingPost?.category || (categories[0]?.slug || 'free'))
  const [title, setTitle] = useState(editingPost?.title || '')
  const [content, setContent] = useState(editingPost?.content || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ uploaded: number; total: number } | null>(null)

  // 투표 상태
  const [showPoll, setShowPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [isMultipleChoice, setIsMultipleChoice] = useState(false)

  // 첨부 파일 상태
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [removedExistingIds, setRemovedExistingIds] = useState<string[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 수정 모드: 기존 첨부 로드
  useEffect(() => {
    if (!editingPost) return
    let cancelled = false
    ;(async () => {
      const { data } = await communityAttachmentService.getAttachments(editingPost.id)
      if (cancelled || data.length === 0) return
      setAttachments((prev) => {
        // 이미 새로 추가된 것이 있을 경우 보존
        const existing: AttachmentDraft[] = data.map((att) => ({ kind: 'existing', id: att.id, existing: att }))
        const newOnes = prev.filter((p) => p.kind === 'new')
        return [...existing, ...newOnes]
      })
    })()
    return () => {
      cancelled = true
    }
  }, [editingPost])

  // 새 파일 미리보기 URL 정리
  useEffect(() => {
    return () => {
      attachments.forEach((a) => {
        if (a.kind === 'new' && a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addPollOption = () => {
    if (pollOptions.length < 10) {
      setPollOptions([...pollOptions, ''])
    }
  }

  const removePollOption = (index: number) => {
    if (pollOptions.length > 2) {
      setPollOptions(pollOptions.filter((_, i) => i !== index))
    }
  }

  const updatePollOption = (index: number, value: string) => {
    const updated = [...pollOptions]
    updated[index] = value
    setPollOptions(updated)
  }

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return
    setError(null)

    setAttachments((prev) => {
      const next = [...prev]
      const localErrors: string[] = []

      for (const file of incoming) {
        if (next.length >= COMMUNITY_ATTACHMENT_MAX_COUNT) {
          localErrors.push(`첨부 파일은 최대 ${COMMUNITY_ATTACHMENT_MAX_COUNT}개까지 가능합니다.`)
          break
        }
        if (file.size <= 0) {
          localErrors.push(`${file.name || '파일'}: 빈 파일입니다.`)
          continue
        }
        if (file.size > COMMUNITY_ATTACHMENT_MAX_SIZE) {
          localErrors.push(`${file.name || '파일'}: 10MB를 초과합니다.`)
          continue
        }
        const type = file.type || 'application/octet-stream'
        if (!ALLOWED_MIME_TYPES.has(type)) {
          localErrors.push(`${file.name || '파일'}: 지원하지 않는 형식입니다.`)
          continue
        }
        const previewUrl = isImageType(type) ? URL.createObjectURL(file) : undefined
        next.push({
          kind: 'new',
          tempId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl,
        })
      }

      if (localErrors.length > 0) {
        setError(localErrors.join('\n'))
      }
      return next
    })
  }, [])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    addFiles(files)
    // 같은 파일 재선택 가능하게 input 초기화
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleRemoveAttachment = (target: AttachmentDraft) => {
    setAttachments((prev) =>
      prev.filter((a) => {
        if (target.kind === 'new' && a.kind === 'new') return a.tempId !== target.tempId
        if (target.kind === 'existing' && a.kind === 'existing') return a.id !== target.id
        return true
      })
    )
    if (target.kind === 'existing') {
      setRemovedExistingIds((prev) => (prev.includes(target.id) ? prev : [...prev, target.id]))
    }
    if (target.kind === 'new' && target.previewUrl) {
      URL.revokeObjectURL(target.previewUrl)
    }
  }

  // 드래그앤드롭
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragOver) setIsDragOver(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer?.files || [])
    if (files.length) addFiles(files)
  }

  // 클립보드 paste — 캡쳐한 이미지 자동 첨부
  // textarea와 form 양쪽에 부착: textarea native paste가 일부 브라우저에서
  // form까지 bubble되지 않는 케이스 대비. file을 발견했을 때만 stopPropagation으로
  // 같은 이벤트가 두 핸들러에서 중복 처리되지 않도록 차단.
  const handlePaste = (e: React.ClipboardEvent) => {
    // ClipboardEvent.clipboardData는 SyntheticEvent에서 native object를 그대로 노출
    const clipboardData = e.clipboardData || (e.nativeEvent as ClipboardEvent | undefined)?.clipboardData
    if (!clipboardData) return

    const items = clipboardData.items
    const filesFromList = clipboardData.files
    const pastedFiles: File[] = []

    // 1순위: items에서 kind === 'file' 추출 (가장 표준)
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) pastedFiles.push(file)
        }
      }
    }

    // 2순위: items가 비어있거나 file이 없으면 files 컬렉션 직접 확인 (Safari/구형 호환)
    if (pastedFiles.length === 0 && filesFromList && filesFromList.length > 0) {
      for (let i = 0; i < filesFromList.length; i++) {
        const file = filesFromList.item(i)
        if (file) pastedFiles.push(file)
      }
    }

    if (pastedFiles.length === 0) return

    // 캡쳐 이미지처럼 파일명이 없는 경우 보강
    const normalized = pastedFiles.map((file) => {
      if (!file.name || file.name === 'image.png' || file.name === '') {
        const ext = inferExtensionFromType(file.type || 'image/png')
        return new File([file], `pasted_${Date.now()}.${ext}`, {
          type: file.type || 'image/png',
        })
      }
      return file
    })

    // 파일 paste 확정 → default(텍스트 paste) 차단 + 다른 핸들러로 bubble되어 중복 처리되는 것 차단
    e.preventDefault()
    e.stopPropagation()
    addFiles(normalized)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      let postId: string | null = null

      if (editingPost) {
        const { data: updated, error: updateError } = await communityPostService.updatePost(editingPost.id, {
          title,
          content,
          category,
        })
        if (updateError) {
          setError(updateError)
          setSubmitting(false)
          return
        }
        postId = updated?.id || editingPost.id

        // 제거된 기존 첨부 삭제
        for (const removedId of removedExistingIds) {
          const { error: delErr } = await communityAttachmentService.deleteAttachment(removedId)
          if (delErr) console.warn('[CommunityPostForm] 첨부 삭제 실패:', delErr)
        }
      } else {
        const dto: CreatePostDto = { category, title, content }
        if (showPoll && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2) {
          dto.poll = {
            question: pollQuestion.trim(),
            options: pollOptions.filter((o) => o.trim()),
            is_multiple_choice: isMultipleChoice,
          }
        }
        const { data: created, error: createError } = await communityPostService.createPost(profileId, dto)
        if (createError || !created) {
          setError(createError || '게시글 생성에 실패했습니다.')
          setSubmitting(false)
          return
        }
        postId = created.id
      }

      // 새 첨부 업로드
      const newFiles = attachments.filter((a): a is Extract<AttachmentDraft, { kind: 'new' }> => a.kind === 'new')
      if (newFiles.length > 0 && postId) {
        setUploadProgress({ uploaded: 0, total: newFiles.length })
        const startSortOrder =
          attachments.filter((a) => a.kind === 'existing').length > 0
            ? attachments.filter((a) => a.kind === 'existing').length
            : 0
        const { errors: uploadErrors } = await communityAttachmentService.uploadAttachments({
          postId,
          profileId,
          files: newFiles.map((n) => n.file),
          startSortOrder,
          onProgress: (uploaded, total) => setUploadProgress({ uploaded, total }),
        })
        if (uploadErrors.length > 0) {
          // 업로드 실패가 있어도 게시글은 만들어진 상태이므로 사용자에게 알리고 진행
          setError(`일부 첨부 파일 업로드 실패:\n${uploadErrors.join('\n')}`)
          setUploadProgress(null)
          setSubmitting(false)
          return
        }
        setUploadProgress(null)
      }

      onSubmit()
    } catch (err) {
      console.error('[CommunityPostForm] submit error:', err)
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onCancel}>
        <ChevronLeft className="w-4 h-4 mr-1" />돌아가기
      </Button>

      <div className="bg-white rounded-2xl border border-at-border p-4 sm:p-6 shadow-at-card">
        <h2 className="text-lg font-bold text-at-text mb-4">{editingPost ? '게시글 수정' : '새 글 작성'}</h2>

        <form onSubmit={handleSubmit} className="space-y-4" onPaste={handlePaste}>
          {/* 카테고리 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CommunityCategory)}
              className="w-full border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent"
            >
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>{labelMap[cat.slug] || cat.label}</option>
              ))}
            </select>
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">제목</label>
            <Input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="제목을 입력하세요"
              maxLength={200}
            />
          </div>

          {/* 내용 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              placeholder="내용을 입력하세요. 캡쳐한 이미지를 바로 붙여넣기(Ctrl/Cmd+V)할 수 있습니다."
              rows={12}
              className="w-full border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent resize-y"
            />
          </div>

          {/* 첨부 파일 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-at-text-secondary">
                첨부 파일 <span className="text-xs text-at-text-weak">({attachments.length}/{COMMUNITY_ATTACHMENT_MAX_COUNT}, 개당 최대 10MB)</span>
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-at-border text-at-text-secondary hover:bg-at-surface-hover transition-colors"
              >
                <Paperclip className="w-3.5 h-3.5" />
                파일 선택
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.hwp"
              className="hidden"
              onChange={handleFileInputChange}
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                isDragOver
                  ? 'border-at-accent bg-at-accent/5'
                  : 'border-at-border hover:border-at-accent/60 hover:bg-at-surface-alt'
              }`}
            >
              <Upload className="w-5 h-5 mx-auto text-at-text-weak" />
              <p className="text-xs text-at-text-secondary mt-1">
                여기로 파일을 끌어오거나 클릭해서 선택, 또는 캡쳐 이미지 붙여넣기
              </p>
              <p className="text-[11px] text-at-text-weak mt-0.5">
                이미지(JPG/PNG/GIF/WebP), PDF, Office 문서, 한글, 텍스트, ZIP 지원
              </p>
            </div>

            {attachments.length > 0 && (
              <ul className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {attachments.map((a) => {
                  const fileType = a.kind === 'existing' ? a.existing.file_type : a.file.type
                  const fileName = a.kind === 'existing' ? a.existing.file_name : a.file.name
                  const fileSize = a.kind === 'existing' ? a.existing.file_size : a.file.size
                  const previewUrl = a.kind === 'existing' ? a.existing.public_url : a.previewUrl
                  const showPreview = isImageType(fileType) && previewUrl
                  const key = a.kind === 'existing' ? `e-${a.id}` : `n-${a.tempId}`

                  return (
                    <li
                      key={key}
                      className="flex items-center gap-2 border border-at-border rounded-xl p-2 bg-white"
                    >
                      <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-at-surface-alt overflow-hidden flex items-center justify-center">
                        {showPreview ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={previewUrl} alt={fileName} className="w-full h-full object-cover" />
                        ) : isImageType(fileType) ? (
                          <ImageIcon className="w-5 h-5 text-at-text-weak" />
                        ) : (
                          <FileText className="w-5 h-5 text-at-text-weak" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-at-text truncate" title={fileName}>{fileName}</p>
                        <p className="text-[11px] text-at-text-weak">
                          {formatBytes(fileSize)}
                          {a.kind === 'existing' && <span className="ml-1">· 기존</span>}
                          {a.kind === 'new' && <span className="ml-1">· 업로드 대기</span>}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(a)}
                        className="p-1.5 rounded-lg text-at-text-weak hover:text-at-error hover:bg-at-error-bg transition-colors"
                        aria-label="첨부 제거"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* 투표 (새 글 작성 시만) */}
          {!editingPost && (
            <div>
              {!showPoll ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowPoll(true)}>
                  <BarChart3 className="w-4 h-4 mr-1.5" />투표 추가
                </Button>
              ) : (
                <div className="border border-at-border rounded-xl p-4 bg-at-surface-alt">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-at-text-secondary">투표</h4>
                    <button type="button" onClick={() => setShowPoll(false)} className="text-at-text-weak hover:text-at-text-secondary">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <Input
                    type="text"
                    value={pollQuestion}
                    onChange={(e) => setPollQuestion(e.target.value)}
                    placeholder="투표 질문"
                    className="mb-3"
                  />
                  <div className="space-y-2 mb-3">
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          type="text"
                          value={opt}
                          onChange={(e) => updatePollOption(i, e.target.value)}
                          placeholder={`선택지 ${i + 1}`}
                        />
                        {pollOptions.length > 2 && (
                          <Button type="button" variant="outline" size="sm" onClick={() => removePollOption(i)}>
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <Button type="button" variant="outline" size="sm" onClick={addPollOption} disabled={pollOptions.length >= 10}>
                      <Plus className="w-4 h-4 mr-1" />선택지 추가
                    </Button>
                    <label className="flex items-center gap-2 text-sm text-at-text-secondary">
                      <input type="checkbox" checked={isMultipleChoice} onChange={(e) => setIsMultipleChoice(e.target.checked)} className="rounded" />
                      복수 선택
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-at-error whitespace-pre-line">{error}</p>
          )}

          {uploadProgress && (
            <p className="text-sm text-at-text-secondary">
              <Loader2 className="w-4 h-4 inline animate-spin mr-1" />
              첨부 업로드 중... ({uploadProgress.uploaded}/{uploadProgress.total})
            </p>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onCancel} className="flex-1">취소</Button>
            <Button type="submit" disabled={!title.trim() || !content.trim() || submitting} className="flex-1">
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {editingPost ? '수정하기' : '작성하기'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
