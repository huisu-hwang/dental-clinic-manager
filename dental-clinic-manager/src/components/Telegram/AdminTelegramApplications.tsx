'use client'

import { useState, useEffect } from 'react'
import { Loader2, AlertCircle, CheckCircle, XCircle, Clock, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { telegramGroupService } from '@/lib/telegramService'
import type { TelegramGroup } from '@/types/telegram'

interface AdminTelegramApplicationsProps {
  onReviewComplete?: () => void
}

export default function AdminTelegramApplications({ onReviewComplete }: AdminTelegramApplicationsProps) {
  const [applications, setApplications] = useState<(TelegramGroup & { creator?: { name: string; email: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [boardSlug, setBoardSlug] = useState('')
  const [boardTitle, setBoardTitle] = useState('')

  const fetchApplications = async () => {
    setLoading(true)
    const { data, error: fetchError } = await telegramGroupService.getPendingApplications()
    if (fetchError) {
      setError(fetchError)
    } else {
      setApplications(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchApplications()
  }, [])

  const handleApprove = async (groupId: string) => {
    if (!boardSlug.trim() || !boardTitle.trim()) {
      setError('게시판 경로와 이름을 모두 입력해주세요.')
      return
    }
    if (!/^[a-zA-Z0-9-]+$/.test(boardSlug.trim())) {
      setError('게시판 경로는 영문, 숫자, 하이픈(-)만 사용할 수 있습니다.')
      return
    }

    setProcessingId(groupId)
    setError(null)
    const { error: reviewError } = await telegramGroupService.reviewApplication(
      groupId,
      'approve',
      undefined,
      boardSlug.trim(),
      boardTitle.trim()
    )
    if (reviewError) {
      setError(reviewError)
    } else {
      setApplications(prev => prev.filter(a => a.id !== groupId))
      setApprovingId(null)
      onReviewComplete?.()
    }
    setProcessingId(null)
  }

  const handleReject = async (groupId: string) => {
    if (!rejectionReason.trim()) {
      setError('반려 사유를 입력해주세요.')
      return
    }
    setProcessingId(groupId)
    setError(null)
    const { error: reviewError } = await telegramGroupService.reviewApplication(groupId, 'reject', rejectionReason.trim())
    if (reviewError) {
      setError(reviewError)
    } else {
      setApplications(prev => prev.filter(a => a.id !== groupId))
      setRejectingId(null)
      setRejectionReason('')
      onReviewComplete?.()
    }
    setProcessingId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-at-accent" />
      </div>
    )
  }

  if (applications.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-sm text-at-error bg-at-error-bg px-4 py-3 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-at-error/60 hover:text-at-error">×</button>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-at-text-secondary">
          게시판 신청 대기
          <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-amber-500 rounded-full">
            {applications.length}
          </span>
        </h3>
      </div>

      <div className="space-y-2">
        {applications.map(app => (
          <div
            key={app.id}
            className="p-4 rounded-xl border border-at-border bg-at-surface-alt"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-at-tag flex items-center justify-center">
                  <Send className="w-4 h-4 text-at-accent" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-at-text">{app.board_title}</h4>
                  <p className="text-xs text-at-text-secondary">
                    {app.chat_title} · /{app.board_slug}
                  </p>
                  <p className="text-xs text-at-text-weak mt-0.5">
                    신청자: {app.creator?.name || '알 수 없음'}
                    {app.creator?.email ? ` (${app.creator.email})` : ''}
                    {' · '}
                    {new Date(app.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              </div>
            </div>

            {app.application_reason && (
              <p className="text-xs text-at-text-secondary mt-2 bg-white px-3 py-2 rounded-lg border border-at-border">
                신청 사유: {app.application_reason}
              </p>
            )}

            {/* 반려 사유 입력 */}
            {rejectingId === app.id && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  placeholder="반려 사유를 입력해주세요"
                  className="w-full h-16 px-3 py-2 text-sm border border-at-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-at-error focus:border-transparent bg-white"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setRejectingId(null); setRejectionReason('') }}
                    className="h-7 text-xs"
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleReject(app.id)}
                    disabled={processingId === app.id || !rejectionReason.trim()}
                    className="h-7 text-xs bg-red-500 hover:bg-red-600 text-white"
                  >
                    {processingId === app.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <XCircle className="w-3 h-3 mr-1" />}
                    반려 확인
                  </Button>
                </div>
              </div>
            )}

            {/* 승인 정보 입력 */}
            {approvingId === app.id && (
              <div className="mt-3 space-y-3 p-3 bg-white rounded-xl border border-at-border">
                <div>
                  <label className="block text-xs font-medium text-at-text-secondary mb-1">게시판 이름</label>
                  <input
                    type="text"
                    value={boardTitle}
                    onChange={e => setBoardTitle(e.target.value)}
                    placeholder="예: 치과 공지방"
                    className="w-full px-3 py-2 text-sm border border-at-border rounded-xl focus:outline-none focus:ring-2 focus:ring-at-accent focus:border-transparent"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-at-text-secondary mb-1">게시판 식별자 (URL 경로)</label>
                  <div className="flex items-center">
                    <span className="bg-at-surface-alt border border-r-0 border-at-border px-3 py-2 text-sm text-at-text-weak rounded-l-xl font-mono">
                      /community/telegram/
                    </span>
                    <input
                      type="text"
                      value={boardSlug}
                      onChange={e => setBoardSlug(e.target.value)}
                      placeholder="notice"
                      className="flex-1 px-3 py-2 text-sm border border-at-border rounded-r-xl focus:outline-none focus:ring-2 focus:ring-at-accent focus:border-transparent font-mono"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setApprovingId(null); setBoardSlug(''); setBoardTitle('') }}
                    className="h-7 text-xs"
                  >
                    취소
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(app.id)}
                    disabled={processingId === app.id || !boardSlug.trim() || !boardTitle.trim()}
                    className="h-7 text-xs bg-green-500 hover:bg-green-600 text-white"
                  >
                    {processingId === app.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                    연동 완료
                  </Button>
                </div>
              </div>
            )}

            {/* 승인/반려 버튼 */}
            {rejectingId !== app.id && approvingId !== app.id && (
              <div className="flex gap-2 justify-end mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setRejectingId(app.id); setRejectionReason('') }}
                  disabled={!!processingId}
                  className="h-7 text-xs text-at-error border-at-border hover:bg-at-error-bg"
                >
                  <XCircle className="w-3 h-3 mr-1" />반려
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    setApprovingId(app.id);
                    setRejectingId(null);
                    setBoardTitle(app.board_title.startsWith('pending_') ? '' : app.board_title);
                    setBoardSlug(app.board_slug.startsWith('pending_') ? '' : app.board_slug);
                  }}
                  disabled={!!processingId}
                  className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                >
                  {processingId === app.id ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <CheckCircle className="w-3 h-3 mr-1" />}
                  설정 후 승인
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
