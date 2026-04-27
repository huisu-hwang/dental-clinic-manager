'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, Loader2, Plus, X, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityPostService } from '@/lib/communityService'
import type { CommunityCategory, CommunityPost, CommunityCategoryItem, CreatePostDto } from '@/types/community'

interface CommunityPostFormProps {
  profileId: string
  editingPost?: CommunityPost | null
  categories: CommunityCategoryItem[]
  labelMap: Record<string, string>
  onSubmit: () => void
  onCancel: () => void
}

// 임시저장 키 — 사용자별로 분리하여 다른 계정의 초안이 섞이지 않도록 함.
// sessionStorage 사용: 탭 전환·페이지 이동·새로고침 시 보존되며 탭 종료 시 자동 폐기.
const DRAFT_KEY_PREFIX = 'community-post-draft:'

interface DraftPayload {
  title?: string
  content?: string
  category?: CommunityCategory
  showPoll?: boolean
  pollQuestion?: string
  pollOptions?: string[]
  isMultipleChoice?: boolean
}

export default function CommunityPostForm({ profileId, editingPost, categories, labelMap, onSubmit, onCancel }: CommunityPostFormProps) {
  const [category, setCategory] = useState<CommunityCategory>(editingPost?.category || (categories[0]?.slug || 'free'))
  const [title, setTitle] = useState(editingPost?.title || '')
  const [content, setContent] = useState(editingPost?.content || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 투표 상태
  const [showPoll, setShowPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [isMultipleChoice, setIsMultipleChoice] = useState(false)

  const draftKey = `${DRAFT_KEY_PREFIX}${profileId}`

  // 마운트 시 저장된 초안 복원 (새 글 작성 시에만, 수정 모드에서는 건너뜀).
  // SSR-safe하게 useEffect에서 처리하여 hydration mismatch 방지.
  useEffect(() => {
    if (editingPost) return
    if (typeof window === 'undefined') return
    try {
      const raw = sessionStorage.getItem(draftKey)
      if (!raw) return
      const draft: DraftPayload = JSON.parse(raw)
      if (draft.title) setTitle(draft.title)
      if (draft.content) setContent(draft.content)
      if (draft.category) setCategory(draft.category)
      if (draft.showPoll) setShowPoll(true)
      if (draft.pollQuestion) setPollQuestion(draft.pollQuestion)
      if (Array.isArray(draft.pollOptions) && draft.pollOptions.length >= 2) {
        setPollOptions(draft.pollOptions)
      }
      if (typeof draft.isMultipleChoice === 'boolean') setIsMultipleChoice(draft.isMultipleChoice)
    } catch {
      // 파싱 실패 시 무시 (초안만 손실, 동작에는 영향 없음)
    }
    // 의도적으로 마운트 시 1회만 실행 — 이후 입력은 아래 effect가 저장
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, editingPost])

  // 입력 변경 시마다 sessionStorage에 저장 (수정 모드 제외).
  // title, content가 모두 비면 저장된 초안 제거.
  useEffect(() => {
    if (editingPost) return
    if (typeof window === 'undefined') return
    if (!title && !content) {
      sessionStorage.removeItem(draftKey)
      return
    }
    try {
      const payload: DraftPayload = {
        title, content, category,
        showPoll, pollQuestion, pollOptions, isMultipleChoice,
      }
      sessionStorage.setItem(draftKey, JSON.stringify(payload))
    } catch {
      // 용량 초과 등 저장 실패 시 무시 (입력은 정상 유지됨)
    }
  }, [title, content, category, showPoll, pollQuestion, pollOptions, isMultipleChoice, draftKey, editingPost])

  const clearDraft = () => {
    if (typeof window === 'undefined') return
    sessionStorage.removeItem(draftKey)
  }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setSubmitting(true)
    setError(null)

    if (editingPost) {
      const { error: updateError } = await communityPostService.updatePost(editingPost.id, { title, content, category })
      if (updateError) {
        setError(updateError)
        setSubmitting(false)
        return
      }
    } else {
      const dto: CreatePostDto = { category, title, content }
      if (showPoll && pollQuestion.trim() && pollOptions.filter(o => o.trim()).length >= 2) {
        dto.poll = {
          question: pollQuestion.trim(),
          options: pollOptions.filter(o => o.trim()),
          is_multiple_choice: isMultipleChoice,
        }
      }
      const { error: createError } = await communityPostService.createPost(profileId, dto)
      if (createError) {
        setError(createError)
        setSubmitting(false)
        return
      }
    }

    // 작성/수정 성공 시 임시저장 초안 제거
    clearDraft()
    onSubmit()
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onCancel}>
        <ChevronLeft className="w-4 h-4 mr-1" />돌아가기
      </Button>

      <div className="bg-white rounded-2xl border border-at-border p-4 sm:p-6 shadow-at-card">
        <h2 className="text-lg font-bold text-at-text mb-4">{editingPost ? '게시글 수정' : '새 글 작성'}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              placeholder="내용을 입력하세요"
              rows={12}
              className="w-full border border-at-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-at-accent resize-y"
            />
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

          {error && <p className="text-sm text-at-error">{error}</p>}

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
