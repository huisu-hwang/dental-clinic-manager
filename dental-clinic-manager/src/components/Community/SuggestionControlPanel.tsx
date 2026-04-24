'use client'

import { useEffect, useState, useCallback } from 'react'
import { Bot, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { getSupabase } from '@/lib/supabase'
import { aiSuggestionService } from '@/lib/aiSuggestionService'
import { useAuth } from '@/contexts/AuthContext'
import {
  AI_SUGGESTION_STATUS_LABELS,
  AI_SUGGESTION_PROGRESS_LABELS,
  type AiSuggestionTask,
  type AiSuggestionTaskStatus,
} from '@/types/community'

interface SuggestionControlPanelProps {
  postId: string
}

const STATUS_BADGE_CLASSES: Record<AiSuggestionTaskStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  running: 'bg-blue-100 text-blue-800 border-blue-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  failed: 'bg-red-100 text-red-800 border-red-200',
  cancelled: 'bg-gray-100 text-gray-700 border-gray-200',
}

export default function SuggestionControlPanel({ postId }: SuggestionControlPanelProps) {
  const { user } = useAuth()
  const [task, setTask] = useState<AiSuggestionTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const isMasterAdmin = user?.role === 'master_admin'

  const fetchTask = useCallback(async () => {
    const { data } = await aiSuggestionService.getTaskByPostId(postId)
    setTask(data)
    setLoading(false)
  }, [postId])

  useEffect(() => {
    fetchTask()
  }, [fetchTask])

  // Realtime 구독: 해당 post_id의 태스크 변경 감지
  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase
      .channel(`ai_suggestion_tasks_${postId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_suggestion_tasks',
          filter: `post_id=eq.${postId}`,
        },
        (payload: any) => {
          if (payload.eventType === 'DELETE') {
            setTask(null)
          } else if (payload.new) {
            setTask(payload.new as AiSuggestionTask)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [postId])

  const handleRequest = async () => {
    if (!user?.id) {
      setActionError('로그인이 필요합니다.')
      return
    }
    setActionError(null)
    setSubmitting(true)
    try {
      const { data, error } = await aiSuggestionService.requestTask(postId, user.id)
      if (error) {
        setActionError(error)
      } else if (data) {
        setTask(data)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async () => {
    setActionError(null)
    setSubmitting(true)
    try {
      const { error } = await aiSuggestionService.cancelTask(postId)
      if (error) {
        setActionError(error)
      } else {
        await fetchTask()
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetry = async () => {
    if (!user?.id) {
      setActionError('로그인이 필요합니다.')
      return
    }
    setActionError(null)
    setSubmitting(true)
    try {
      const { data, error } = await aiSuggestionService.retryTask(postId, user.id)
      if (error) {
        setActionError(error)
      } else if (data) {
        setTask(data)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const status = task?.status
  const statusLabel = status ? AI_SUGGESTION_STATUS_LABELS[status] : null
  const statusBadgeClass = status ? STATUS_BADGE_CLASSES[status] : ''

  if (!isMasterAdmin) return null

  return (
    <div className="bg-white rounded-2xl border border-at-border p-4 sm:p-6 shadow-at-card">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-at-accent" />
          <h3 className="text-base font-semibold text-at-text">AI 자동 구현</h3>
        </div>
        {statusLabel && (
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full border ${statusBadgeClass}`}
          >
            {status === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
            {statusLabel}
          </span>
        )}
      </div>

      <p className="text-sm text-at-text-secondary mb-4">
        이 제안을 AI가 코드로 구현하고 PR을 생성합니다.
      </p>

      {status === 'running' && task?.progress_step && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800 mb-3">
          <Loader2 className="w-4 h-4 mt-0.5 shrink-0 animate-spin" />
          <div className="flex-1 min-w-0">
            <div className="font-medium">
              {AI_SUGGESTION_PROGRESS_LABELS[task.progress_step] || task.progress_step}
              {task.progress_detail?.iteration && task.progress_detail?.maxIterations && (
                <span className="ml-1 text-blue-600 font-normal">
                  ({task.progress_detail.iteration}/{task.progress_detail.maxIterations})
                </span>
              )}
              {typeof task.progress_detail?.buildRetry === 'number' && task.progress_detail.buildRetry > 0 && (
                <span className="ml-1 text-blue-600 font-normal">
                  (재시도 {task.progress_detail.buildRetry})
                </span>
              )}
            </div>
            {task.progress_detail?.currentFile && (
              <div className="text-xs text-blue-700 mt-0.5 truncate font-mono">
                📝 {task.progress_detail.currentFile}
              </div>
            )}
            {task.progress_detail?.message && (
              <div className="text-xs text-blue-700 mt-0.5 break-words">
                {task.progress_detail.message}
              </div>
            )}
          </div>
        </div>
      )}

      {task?.branch_name && (
        <div className="text-xs text-at-text-weak mb-2 font-mono truncate">
          🌿 {task.branch_name}
        </div>
      )}

      {task?.pr_url && (
        <a
          href={task.pr_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-at-accent hover:text-at-accent-hover transition-colors mb-3"
        >
          <ExternalLink className="w-4 h-4" />
          PR 보기
          {task.pr_number ? ` #${task.pr_number}` : ''}
        </a>
      )}

      {task?.error_message && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 mb-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="whitespace-pre-wrap break-words">{task.error_message}</div>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 mb-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>{actionError}</div>
        </div>
      )}

      {isMasterAdmin && !loading && (
        <div className="flex items-center gap-2 flex-wrap">
          {!task && (
            <Button onClick={handleRequest} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  요청 중...
                </>
              ) : (
                <>
                  <Bot className="w-4 h-4" />
                  AI 자동 구현 시작
                </>
              )}
            </Button>
          )}

          {task && (status === 'pending' || status === 'running') && (
            <Button variant="outline" onClick={handleCancel} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              취소
            </Button>
          )}

          {task && (status === 'failed' || status === 'cancelled') && (
            <Button onClick={handleRetry} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              다시 시도
            </Button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-at-text-weak">
          <Loader2 className="w-4 h-4 animate-spin" />
          상태 확인 중...
        </div>
      )}
    </div>
  )
}
