'use client'

import { useState } from 'react'
import { ChevronLeft, Loader2, Plus, X, BarChart3 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityPostService } from '@/lib/communityService'
import type { CommunityCategory, CommunityPost, CreatePostDto } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS } from '@/types/community'

interface CommunityPostFormProps {
  profileId: string
  editingPost?: CommunityPost | null
  onSubmit: () => void
  onCancel: () => void
}

const categories: CommunityCategory[] = ['free', 'advice', 'info', 'humor', 'daily', 'career']

export default function CommunityPostForm({ profileId, editingPost, onSubmit, onCancel }: CommunityPostFormProps) {
  const [category, setCategory] = useState<CommunityCategory>(editingPost?.category || 'free')
  const [title, setTitle] = useState(editingPost?.title || '')
  const [content, setContent] = useState(editingPost?.content || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 투표 상태
  const [showPoll, setShowPoll] = useState(false)
  const [pollQuestion, setPollQuestion] = useState('')
  const [pollOptions, setPollOptions] = useState<string[]>(['', ''])
  const [isMultipleChoice, setIsMultipleChoice] = useState(false)

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

    onSubmit()
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onCancel}>
        <ChevronLeft className="w-4 h-4 mr-1" />돌아가기
      </Button>

      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">{editingPost ? '게시글 수정' : '새 글 작성'}</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 카테고리 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as CommunityCategory)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{COMMUNITY_CATEGORY_LABELS[cat]}</option>
              ))}
            </select>
          </div>

          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">제목</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">내용</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="내용을 입력하세요"
              rows={12}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
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
                <div className="border border-indigo-200 rounded-lg p-4 bg-indigo-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-indigo-700">투표</h4>
                    <button type="button" onClick={() => setShowPoll(false)} className="text-gray-400 hover:text-gray-600">
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
                    <label className="flex items-center gap-2 text-sm text-gray-600">
                      <input type="checkbox" checked={isMultipleChoice} onChange={(e) => setIsMultipleChoice(e.target.checked)} className="rounded" />
                      복수 선택
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}

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
