'use client'

/**
 * 모임장/마스터가 가입 신청 목록을 확인하고 승인·거부하는 패널.
 * 멤버 관리 모달 내부에 mount 한다.
 */

import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, XCircle, Inbox, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface JoinRequestRow {
  id: string
  telegram_group_id: string
  user_id: string
  message: string | null
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reject_reason: string | null
  reviewed_at: string | null
  created_at: string
  applicant?: { id: string; name: string | null; email: string | null } | null
}

function formatKstDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  } catch { return iso }
}

export default function JoinRequestManager({ groupId }: { groupId: string }) {
  const [rows, setRows] = useState<JoinRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rejectModalId, setRejectModalId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const fetchRows = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/telegram/groups/${groupId}/join-requests?status=pending`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) setError(j?.error ?? '조회 실패')
      else setRows(j?.data ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패')
    } finally { setLoading(false) }
  }, [groupId])

  useEffect(() => { fetchRows() }, [fetchRows])

  const approve = async (row: JoinRequestRow) => {
    setProcessingId(row.id)
    try {
      const r = await fetch(`/api/telegram/groups/${groupId}/join-requests/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      const j = await r.json()
      if (!r.ok) setError(j?.error ?? '승인 실패')
      await fetchRows()
    } finally { setProcessingId(null) }
  }

  const reject = async () => {
    if (!rejectModalId) return
    setProcessingId(rejectModalId)
    try {
      const r = await fetch(`/api/telegram/groups/${groupId}/join-requests/${rejectModalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reject_reason: rejectReason.trim() || null }),
      })
      const j = await r.json()
      if (!r.ok) setError(j?.error ?? '거부 실패')
      setRejectModalId(null)
      setRejectReason('')
      await fetchRows()
    } finally { setProcessingId(null) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-at-text flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-amber-500" />
          가입 신청 대기 ({rows.length})
        </h4>
        <button onClick={fetchRows} className="text-xs text-at-text-weak hover:text-at-text">
          새로고침
        </button>
      </div>

      {error && (
        <p className="text-xs text-at-error bg-at-error-bg px-2 py-1.5 rounded">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 animate-spin text-at-text-weak" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-at-text-weak">
          <Inbox className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-xs">대기 중인 가입 신청이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(row => (
            <div key={row.id} className="p-3 bg-white border border-at-border rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-at-text">
                  {row.applicant?.name || row.applicant?.email || '사용자'}
                </div>
                <div className="text-[11px] text-at-text-weak">
                  {formatKstDate(row.created_at)}
                </div>
              </div>
              {row.applicant?.email && (
                <p className="text-[11px] text-at-text-weak">{row.applicant.email}</p>
              )}
              {row.message && (
                <p className="text-xs text-at-text-secondary bg-at-surface-alt px-2 py-1.5 rounded">
                  {row.message}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setRejectModalId(row.id); setRejectReason('') }}
                  disabled={processingId === row.id}
                  className="text-at-error"
                >
                  <XCircle className="w-4 h-4 mr-1" />거절
                </Button>
                <Button
                  size="sm"
                  onClick={() => approve(row)}
                  disabled={processingId === row.id}
                >
                  {processingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><CheckCircle2 className="w-4 h-4 mr-1" />승인</>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 거절 사유 입력 */}
      {rejectModalId && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-4 max-w-sm w-full space-y-3 border border-at-border">
            <h5 className="text-sm font-semibold text-at-text">거절 사유 (선택)</h5>
            <textarea
              rows={3}
              maxLength={500}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="신청자에게 전달할 거절 사유"
              className="w-full px-3 py-2 text-sm border border-at-border rounded-lg focus:outline-none focus:ring-2 focus:ring-at-accent"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setRejectModalId(null); setRejectReason('') }}>
                취소
              </Button>
              <Button size="sm" onClick={reject} disabled={processingId === rejectModalId}>
                {processingId === rejectModalId ? <Loader2 className="w-4 h-4 animate-spin" /> : '거절 처리'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
