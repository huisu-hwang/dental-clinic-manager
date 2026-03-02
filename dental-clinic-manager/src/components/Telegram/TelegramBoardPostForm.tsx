'use client'

import { useState } from 'react'
import { X, Loader2, Send as SendIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import TiptapEditor from '@/components/Protocol/TiptapEditor'
import type { TelegramBoardPost } from '@/types/telegram'

interface TelegramBoardPostFormProps {
  mode: 'create' | 'edit'
  post?: TelegramBoardPost | null
  onSubmit: (data: { title: string; content: string; notifyTelegram: boolean }) => Promise<void>
  onCancel: () => void
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setSubmitting(true)
    try {
      await onSubmit({ title: title.trim(), content, notifyTelegram })
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

        {/* 본문 에디터 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            내용
          </label>
          <TiptapEditor
            content={content}
            onChange={setContent}
            placeholder="내용을 작성하세요..."
          />
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
            disabled={submitting || !title.trim() || !content.trim()}
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
