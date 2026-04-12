'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Loader2, Info, CheckCircle2, RefreshCw, ExternalLink, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { telegramGroupService } from '@/lib/telegramService'
import type { ApplyTelegramGroupDto, TelegramGroupVisibility } from '@/types/telegram'
import { TELEGRAM_VISIBILITY_LABELS, TELEGRAM_VISIBILITY_DESCRIPTIONS } from '@/types/telegram'

interface DetectedGroup {
  id: string
  telegram_chat_id: number
  chat_title: string
  chat_type: string
  created_at: string
}

interface TelegramBoardApplicationFormProps {
  onSubmit: (dto: ApplyTelegramGroupDto) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

export default function TelegramBoardApplicationForm({ onSubmit, onCancel, loading }: TelegramBoardApplicationFormProps) {
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [botLoading, setBotLoading] = useState(true)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const [polling, setPolling] = useState(false)
  const [detectedGroup, setDetectedGroup] = useState<DetectedGroup | null>(null)
  const [showManualInput, setShowManualInput] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollingStartRef = useRef<number>(0)

  const [visibility, setVisibility] = useState<TelegramGroupVisibility>('private')
  const [chatId, setChatId] = useState('')
  const [chatTitle, setChatTitle] = useState('')
  const [boardSlug, setBoardSlug] = useState('')
  const [boardTitle, setBoardTitle] = useState('')
  const [boardDescription, setBoardDescription] = useState('')
  const [applicationReason, setApplicationReason] = useState('')

  useEffect(() => {
    async function fetchBotInfo() {
      setBotLoading(true)
      const { data, error } = await telegramGroupService.getBotInfo()
      if (data?.username) {
        setBotUsername(data.username)
      } else {
        console.error('Failed to fetch bot info:', error)
      }
      setBotLoading(false)
    }
    fetchBotInfo()
  }, [])

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
    setPolling(false)
  }, [])

  const pollForGroup = useCallback(async (token: string) => {
    const { data } = await telegramGroupService.getDetectedGroups(token)
    if (data && data.length > 0) {
      const group = data[0]
      setDetectedGroup(group)
      setChatId(String(group.telegram_chat_id))
      setChatTitle(group.chat_title)
      if (!boardTitle) setBoardTitle(group.chat_title)
      if (!boardSlug) {
        setBoardSlug(
          group.chat_title
            .toLowerCase()
            .replace(/[^a-z0-9가-힣]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
        )
      }
      stopPolling()
      return true
    }

    if (Date.now() - pollingStartRef.current > 120000) {
      stopPolling()
    }
    return false
  }, [boardTitle, boardSlug, stopPolling])

  const handleAddBotClick = () => {
    if (!botUsername) return

    const token = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
    setLinkToken(token)

    const deepLink = `https://t.me/${botUsername}?startgroup=${token}`
    window.open(deepLink, '_blank')

    setPolling(true)
    pollingStartRef.current = Date.now()
    pollingRef.current = setInterval(() => {
      pollForGroup(token)
    }, 3000)
  }

  const handleResetGroup = () => {
    setDetectedGroup(null)
    setChatId('')
    setChatTitle('')
    setBoardSlug('')
    setBoardTitle('')
    setLinkToken(null)
    stopPolling()
  }

  const handleChatTitleChange = (value: string) => {
    setChatTitle(value)
    if (!boardTitle) setBoardTitle(value)
    if (!boardSlug) {
      setBoardSlug(value.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatId || !chatTitle || !boardSlug || !boardTitle) return

    await onSubmit({
      telegram_chat_id: parseInt(chatId),
      chat_title: chatTitle,
      board_slug: boardSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
      board_title: boardTitle,
      board_description: boardDescription || undefined,
      application_reason: applicationReason || undefined,
      visibility,
    })
  }

  const isGroupConnected = !!detectedGroup || (showManualInput && !!chatId)

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-at-accent-light rounded-xl border border-at-border">
      {/* Step 1: 그룹 연결 */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isGroupConnected ? 'bg-green-500 text-white' : 'bg-at-accent text-white'}`}>
            {isGroupConnected ? <CheckCircle2 className="w-3.5 h-3.5" /> : '1'}
          </div>
          <h3 className="text-sm font-semibold text-at-text">텔레그램 그룹 연결</h3>
        </div>

        {detectedGroup ? (
          <div className="p-3 bg-at-success-bg border border-green-200 rounded-xl">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-at-success mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">{detectedGroup.chat_title}</p>
                  <p className="text-xs text-at-success mt-0.5">
                    {detectedGroup.chat_type === 'supergroup' ? '슈퍼그룹' : '그룹'} · Chat ID: {detectedGroup.telegram_chat_id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleResetGroup}
                className="text-xs text-at-success hover:text-green-800 underline"
              >
                다른 그룹 선택
              </button>
            </div>
          </div>
        ) : polling ? (
          <div className="p-3 bg-at-warning-bg border border-at-border rounded-xl">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-at-warning animate-spin" />
              <div>
                <p className="text-sm text-at-text">텔레그램에서 그룹을 선택해주세요...</p>
                <p className="text-xs text-at-text-secondary mt-0.5">봇이 그룹에 추가되면 자동으로 감지됩니다 (최대 2분)</p>
              </div>
            </div>
          </div>
        ) : showManualInput ? (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-at-accent mt-0.5 flex-shrink-0" />
              <p className="text-xs text-at-text-secondary">
                텔레그램 그룹의 Chat ID를 직접 입력합니다. 봇을 그룹에 추가한 후 Chat ID를 확인해주세요.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-at-text-secondary mb-1">텔레그램 Chat ID *</label>
                <Input
                  type="text"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="h-8 text-sm"
                  required
                />
                <p className="text-[10px] text-at-text-weak mt-0.5">그룹의 Chat ID (음수 포함)</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-at-text-secondary mb-1">텔레그램 그룹 이름 *</label>
                <Input
                  value={chatTitle}
                  onChange={e => handleChatTitleChange(e.target.value)}
                  placeholder="치과의사 모임"
                  className="h-8 text-sm"
                  required
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setShowManualInput(false); setChatId(''); setChatTitle('') }}
              className="text-xs text-at-accent hover:text-at-accent-hover underline"
            >
              자동 연결로 돌아가기
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-at-accent mt-0.5 flex-shrink-0" />
              <p className="text-xs text-at-text-secondary">
                아래 버튼을 클릭하면 텔레그램이 열리고, 그룹을 선택하면 봇이 자동으로 추가됩니다. 돌아오면 그룹 정보가 자동으로 채워집니다.
              </p>
            </div>

            {/* Keep Telegram brand color */}
            <Button
              type="button"
              onClick={handleAddBotClick}
              disabled={botLoading || !botUsername}
              className="w-full h-10 bg-[#0088cc] hover:bg-[#006daa] text-white"
            >
              {botLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <ExternalLink className="w-4 h-4 mr-2" />
              )}
              텔레그램 그룹에 봇 추가하기
            </Button>

            <button
              type="button"
              onClick={() => setShowManualInput(true)}
              className="flex items-center gap-1 text-xs text-at-text-weak hover:text-at-text-secondary"
            >
              <ChevronDown className="w-3 h-3" />
              Chat ID를 직접 입력하기
            </button>
          </div>
        )}
      </div>

      {/* Step 2: 게시판 정보 (그룹 연결 후 활성화) */}
      <div className={`space-y-3 ${!isGroupConnected ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center gap-2">
          <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${isGroupConnected ? 'bg-at-accent text-white' : 'bg-at-surface-alt text-at-text-weak'}`}>
            2
          </div>
          <h3 className="text-sm font-semibold text-at-text">게시판 정보 입력</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1">게시판 URL 슬러그 *</label>
            <Input
              value={boardSlug}
              onChange={e => setBoardSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
              placeholder="dental-group"
              className="h-8 text-sm font-mono"
              required
            />
            <p className="text-[10px] text-at-text-weak mt-0.5">/community/telegram/{boardSlug || '...'}</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1">게시판 제목 *</label>
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
          <label className="block text-xs font-medium text-at-text-secondary mb-1">게시판 설명 (선택)</label>
          <Input
            value={boardDescription}
            onChange={e => setBoardDescription(e.target.value)}
            placeholder="이 모임의 대화 내용이 자동으로 정리됩니다"
            className="h-8 text-sm"
          />
        </div>

        {/* 공개 범위 설정 */}
        <div>
          <label className="block text-xs font-medium text-at-text-secondary mb-1.5">공개 범위</label>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(TELEGRAM_VISIBILITY_LABELS) as TelegramGroupVisibility[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  visibility === v
                    ? 'border-at-accent bg-at-accent-light ring-1 ring-at-accent'
                    : 'border-at-border hover:bg-at-surface-hover'
                }`}
              >
                <span className={`text-xs font-semibold ${visibility === v ? 'text-at-accent' : 'text-at-text-secondary'}`}>
                  {TELEGRAM_VISIBILITY_LABELS[v]}
                </span>
                <p className="text-[10px] text-at-text-weak mt-0.5 leading-tight">
                  {TELEGRAM_VISIBILITY_DESCRIPTIONS[v]}
                </p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-at-text-secondary mb-1">신청 사유 (선택)</label>
          <textarea
            value={applicationReason}
            onChange={e => setApplicationReason(e.target.value)}
            placeholder="게시판 연동을 신청하는 이유를 간단히 작성해주세요"
            className="w-full h-16 px-3 py-2 text-sm border border-at-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-at-accent focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          취소
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={loading || !chatId || !chatTitle || !boardSlug || !boardTitle}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
          게시판 신청
        </Button>
      </div>
    </form>
  )
}
