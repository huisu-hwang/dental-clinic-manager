'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, UserPlus, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled'
interface JoinRequest {
  id: string
  status: Status
  message: string | null
  reject_reason: string | null
  created_at: string
  reviewed_at: string | null
}

interface Props {
  groupId: string
  /** 멤버 가입 후 새로고침 콜백 (옵션) */
  onJoined?: () => void
  /** 카드 상단/하단 어느 위치에 두어도 어울리도록 자체 padding 없음 */
  className?: string
}

export default function JoinRequestButton({ groupId, onJoined, className }: Props) {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [my, setMy] = useState<JoinRequest | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchMine = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/telegram/groups/${groupId}/join-requests?mine=1`, { cache: 'no-store' })
      const j = await r.json()
      setMy(j?.data ?? null)
    } catch { /* noop */ }
    finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { fetchMine() }, [fetchMine])

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch(`/api/telegram/groups/${groupId}/join-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: message.trim() || null }),
      })
      const j = await r.json()
      if (!r.ok) {
        setError(j?.error ?? '신청에 실패했습니다')
      } else {
        setShowForm(false)
        setMessage('')
        await fetchMine()
        onJoined?.()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '신청 중 오류')
    } finally { setSubmitting(false) }
  }

  const cancel = async () => {
    if (!my) return
    setSubmitting(true)
    try {
      await fetch(`/api/telegram/groups/${groupId}/join-requests/${my.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      })
      await fetchMine()
    } finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <div className={`flex items-center justify-center py-2 ${className ?? ''}`}>
        <Loader2 className="w-4 h-4 animate-spin text-at-text-weak" />
      </div>
    )
  }

  // pending 상태
  if (my && my.status === 'pending') {
    return (
      <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
        <div className="inline-flex items-center gap-1.5 text-sm text-amber-700 bg-at-warning-bg px-3 py-1.5 rounded-lg border border-amber-200">
          <Clock className="w-4 h-4" />
          가입 신청 접수됨 — 모임장 승인 대기 중
        </div>
        <button
          onClick={cancel}
          disabled={submitting}
          className="text-xs text-at-text-weak hover:text-at-error underline underline-offset-2 disabled:opacity-50"
        >
          신청 취소
        </button>
      </div>
    )
  }

  // 거절됨 — 재신청 가능
  if (my && my.status === 'rejected') {
    return (
      <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
        <div className="inline-flex items-center gap-1.5 text-sm text-at-error bg-at-error-bg px-3 py-1.5 rounded-lg border border-red-200">
          <XCircle className="w-4 h-4" />
          이전 신청이 거절되었습니다
          {my.reject_reason && <span className="text-at-text-secondary">· {my.reject_reason}</span>}
        </div>
        <Button onClick={() => setShowForm(true)} size="sm" variant="outline">
          <UserPlus className="w-4 h-4 mr-1" />다시 신청
        </Button>
        {showForm && (
          <FormBlock
            message={message}
            setMessage={setMessage}
            submitting={submitting}
            error={error}
            onCancel={() => { setShowForm(false); setError(null) }}
            onSubmit={submit}
          />
        )}
      </div>
    )
  }

  // approved (혹시 화면이 갱신되기 전 잠깐 보이는 경우)
  if (my && my.status === 'approved') {
    return (
      <div className={`inline-flex items-center gap-1.5 text-sm text-at-success bg-at-success-bg px-3 py-1.5 rounded-lg border border-green-200 ${className ?? ''}`}>
        <CheckCircle2 className="w-4 h-4" />
        가입이 승인되었습니다 — 잠시 후 멤버 권한이 반영됩니다
      </div>
    )
  }

  // 신청 이력 없음 또는 cancelled — 신청 가능
  return (
    <div className={`flex flex-col items-center gap-2 ${className ?? ''}`}>
      {!showForm ? (
        <Button onClick={() => setShowForm(true)} variant="outline">
          <UserPlus className="w-4 h-4 mr-1.5" />가입 신청
        </Button>
      ) : (
        <FormBlock
          message={message}
          setMessage={setMessage}
          submitting={submitting}
          error={error}
          onCancel={() => { setShowForm(false); setError(null) }}
          onSubmit={submit}
        />
      )}
    </div>
  )
}

function FormBlock(props: {
  message: string
  setMessage: (s: string) => void
  submitting: boolean
  error: string | null
  onCancel: () => void
  onSubmit: () => void
}) {
  return (
    <div className="w-full max-w-md bg-white border border-at-border rounded-xl p-4 space-y-3">
      <label className="block">
        <span className="text-xs font-medium text-at-text-secondary">가입 신청 메시지 (선택)</span>
        <textarea
          rows={3}
          maxLength={500}
          value={props.message}
          onChange={(e) => props.setMessage(e.target.value)}
          placeholder="모임장에게 전달할 짧은 인사·소개를 적어주세요"
          className="mt-1 w-full px-3 py-2 text-sm border border-at-border rounded-lg focus:outline-none focus:ring-2 focus:ring-at-accent"
        />
        <span className="text-[11px] text-at-text-weak">{props.message.length}/500</span>
      </label>
      {props.error && (
        <p className="text-xs text-at-error bg-at-error-bg px-2 py-1.5 rounded">{props.error}</p>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={props.onCancel} disabled={props.submitting}>
          취소
        </Button>
        <Button size="sm" onClick={props.onSubmit} disabled={props.submitting}>
          {props.submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : '신청 보내기'}
        </Button>
      </div>
    </div>
  )
}
