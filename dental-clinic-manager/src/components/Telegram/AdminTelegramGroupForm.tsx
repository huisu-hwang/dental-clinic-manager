'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import type { CreateTelegramGroupDto } from '@/types/telegram'

interface AdminTelegramGroupFormProps {
  onSubmit: (dto: CreateTelegramGroupDto) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

export default function AdminTelegramGroupForm({ onSubmit, onCancel, loading }: AdminTelegramGroupFormProps) {
  const [chatId, setChatId] = useState('')
  const [chatTitle, setChatTitle] = useState('')
  const [boardSlug, setBoardSlug] = useState('')
  const [boardTitle, setBoardTitle] = useState('')
  const [boardDescription, setBoardDescription] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatId || !chatTitle || !boardSlug || !boardTitle) return

    await onSubmit({
      telegram_chat_id: parseInt(chatId),
      chat_title: chatTitle,
      board_slug: boardSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      board_title: boardTitle,
      board_description: boardDescription || undefined,
    })
  }

  // 채팅 제목 입력 시 slug 자동 생성
  const handleChatTitleChange = (value: string) => {
    setChatTitle(value)
    if (!boardTitle) setBoardTitle(value)
    if (!boardSlug) {
      setBoardSlug(value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <h4 className="text-sm font-semibold text-gray-700">새 텔레그램 그룹 연동</h4>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">텔레그램 Chat ID *</label>
          <Input
            type="text"
            value={chatId}
            onChange={e => setChatId(e.target.value)}
            placeholder="-1001234567890"
            className="h-8 text-sm"
            required
          />
          <p className="text-[10px] text-gray-400 mt-0.5">그룹의 Chat ID (음수 포함)</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">텔레그램 그룹 이름 *</label>
          <Input
            value={chatTitle}
            onChange={e => handleChatTitleChange(e.target.value)}
            placeholder="치과의사 모임"
            className="h-8 text-sm"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">게시판 URL 슬러그 *</label>
          <Input
            value={boardSlug}
            onChange={e => setBoardSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="dental-group"
            className="h-8 text-sm font-mono"
            required
          />
          <p className="text-[10px] text-gray-400 mt-0.5">/community/telegram/{boardSlug || '...'}</p>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">게시판 제목 *</label>
          <Input
            value={boardTitle}
            onChange={e => setBoardTitle(e.target.value)}
            placeholder="치과의사 모임 게시판"
            className="h-8 text-sm"
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">게시판 설명 (선택)</label>
        <Input
          value={boardDescription}
          onChange={e => setBoardDescription(e.target.value)}
          placeholder="이 모임의 대화 내용이 자동으로 정리됩니다"
          className="h-8 text-sm"
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button type="submit" size="sm" disabled={loading || !chatId || !chatTitle || !boardSlug || !boardTitle}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          연동하기
        </Button>
      </div>
    </form>
  )
}
