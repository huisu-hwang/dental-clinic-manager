'use client'

import { useState, useEffect } from 'react'
import { RefreshCw, MessageSquare, FileText, Clock, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { telegramBoardPostService } from '@/lib/telegramService'

interface AdminTelegramSyncStatusProps {
  groupId: string
  onTriggerSummary: () => void
  triggerLoading?: boolean
}

export default function AdminTelegramSyncStatus({ groupId, onTriggerSummary, triggerLoading }: AdminTelegramSyncStatusProps) {
  const [status, setStatus] = useState<{
    lastSync: string | null
    todayMessages: number
    totalPosts: number
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStatus = async () => {
      const { data } = await telegramBoardPostService.getSyncStatus(groupId)
      if (data) setStatus(data)
      setLoading(false)
    }
    fetchStatus()
  }, [groupId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-400 text-xs">
        <Loader2 className="w-3 h-3 animate-spin" />
        상태 확인 중...
      </div>
    )
  }

  if (!status) return null

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return '없음'
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <span className="flex items-center gap-1 text-gray-500">
        <Clock className="w-3 h-3" />
        마지막 동기화: {formatLastSync(status.lastSync)}
      </span>
      <span className="flex items-center gap-1 text-gray-500">
        <MessageSquare className="w-3 h-3" />
        오늘 메시지: {status.todayMessages}건
      </span>
      <span className="flex items-center gap-1 text-gray-500">
        <FileText className="w-3 h-3" />
        총 게시글: {status.totalPosts}건
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onTriggerSummary}
        disabled={triggerLoading}
        className="h-6 text-xs px-2"
      >
        {triggerLoading ? (
          <Loader2 className="w-3 h-3 animate-spin mr-1" />
        ) : (
          <RefreshCw className="w-3 h-3 mr-1" />
        )}
        수동 요약
      </Button>
    </div>
  )
}
