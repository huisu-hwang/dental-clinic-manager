'use client'

import { useState } from 'react'
import { ChevronLeft, Eye, ShieldAlert, UserX, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { communityAdminService } from '@/lib/communityService'
import type { CommunityReport } from '@/types/community'
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from '@/types/community'

interface AdminReportDetailProps {
  report: CommunityReport
  onBack: () => void
}

export default function AdminReportDetail({ report, onBack }: AdminReportDetailProps) {
  const [processing, setProcessing] = useState(false)
  const [identity, setIdentity] = useState<{ name: string; email: string; role: string } | null>(null)
  const [loadingIdentity, setLoadingIdentity] = useState(false)
  const [showPenalty, setShowPenalty] = useState(false)

  const targetProfileId = report.post?.profile_id || report.comment?.profile_id

  const handleRevealIdentity = async () => {
    if (!targetProfileId) return
    setLoadingIdentity(true)
    const { data } = await communityAdminService.getUserIdentity(targetProfileId)
    if (data) setIdentity(data)
    setLoadingIdentity(false)
  }

  const handleDismiss = async () => {
    setProcessing(true)
    await communityAdminService.reviewReport(report.id, 'dismissed')
    // 블라인드 해제
    if (report.post_id) await communityAdminService.unblindPost(report.post_id)
    setProcessing(false)
    onBack()
  }

  const handleActionTaken = async () => {
    setProcessing(true)
    await communityAdminService.reviewReport(report.id, 'action_taken')
    // 블라인드 유지
    if (report.post_id) await communityAdminService.blindPost(report.post_id)
    if (report.comment_id) await communityAdminService.blindComment(report.comment_id)
    setProcessing(false)
    setShowPenalty(true)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="space-y-4">
      <Button variant="outline" size="sm" onClick={onBack}>
        <ChevronLeft className="w-4 h-4 mr-1" />신고 목록
      </Button>

      <div className="bg-white rounded-lg border border-gray-200 p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">신고 상세</h2>

        {/* 신고 정보 */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">상태:</span>
            <span className="ml-2 font-medium">{REPORT_STATUS_LABELS[report.status]}</span>
          </div>
          <div>
            <span className="text-gray-500">사유:</span>
            <span className="ml-2 font-medium">{REPORT_REASON_LABELS[report.reason]}</span>
          </div>
          <div>
            <span className="text-gray-500">신고일:</span>
            <span className="ml-2">{formatDate(report.created_at)}</span>
          </div>
          <div>
            <span className="text-gray-500">유형:</span>
            <span className="ml-2">{report.post_id ? '게시글' : '댓글'}</span>
          </div>
        </div>

        {report.detail && (
          <div className="bg-gray-50 rounded-lg p-3">
            <span className="text-xs text-gray-500">추가 설명:</span>
            <p className="text-sm text-gray-700 mt-1">{report.detail}</p>
          </div>
        )}

        {/* 신고 대상 콘텐츠 */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">신고 대상 콘텐츠</h3>
          {report.post && (
            <div>
              <p className="font-medium text-gray-900">{report.post.title}</p>
              <div className="text-sm text-gray-600 mt-1 max-h-40 overflow-y-auto" dangerouslySetInnerHTML={{ __html: report.post.content }} />
            </div>
          )}
          {report.comment && (
            <p className="text-sm text-gray-700">{report.comment.content}</p>
          )}
        </div>

        {/* 실명 확인 */}
        {targetProfileId && (
          <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-orange-700">대상자 실명 확인</span>
              </div>
              {!identity ? (
                <Button variant="outline" size="sm" onClick={handleRevealIdentity} disabled={loadingIdentity}>
                  {loadingIdentity ? <Loader2 className="w-4 h-4 animate-spin" /> : '실명 조회'}
                </Button>
              ) : (
                <div className="text-sm text-orange-700">
                  <span className="font-medium">{identity.name}</span>
                  <span className="ml-2 text-orange-500">({identity.email})</span>
                  <span className="ml-2 text-orange-400">{identity.role}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 액션 버튼 */}
        {report.status === 'pending' && !showPenalty && (
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={handleDismiss} disabled={processing} className="flex-1">
              <X className="w-4 h-4 mr-1.5" />기각 (블라인드 해제)
            </Button>
            <Button onClick={handleActionTaken} disabled={processing} className="flex-1 bg-red-600 hover:bg-red-700">
              <ShieldAlert className="w-4 h-4 mr-1.5" />조치 (제재 발급)
            </Button>
          </div>
        )}

        {/* 제재 발급 폼 */}
        {showPenalty && targetProfileId && (
          <AdminPenaltyFormInline profileId={targetProfileId} onComplete={onBack} />
        )}
      </div>
    </div>
  )
}

// 인라인 제재 폼
function AdminPenaltyFormInline({ profileId, onComplete }: { profileId: string; onComplete: () => void }) {
  const [type, setType] = useState<'warning' | 'temp_ban' | 'permanent_ban'>('warning')
  const [reason, setReason] = useState('')
  const [days, setDays] = useState(7)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!reason.trim()) return
    setSubmitting(true)
    await communityAdminService.issuePenalty({
      profile_id: profileId,
      type,
      reason: reason.trim(),
      duration_days: type === 'temp_ban' ? days : undefined,
    })
    setSubmitting(false)
    onComplete()
  }

  return (
    <div className="border border-red-200 rounded-lg p-4 bg-red-50 space-y-3">
      <h4 className="text-sm font-semibold text-red-700 flex items-center gap-2">
        <UserX className="w-4 h-4" />제재 발급
      </h4>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as any)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      >
        <option value="warning">경고</option>
        <option value="temp_ban">임시 차단</option>
        <option value="permanent_ban">영구 차단</option>
      </select>
      {type === 'temp_ban' && (
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value={7}>7일</option>
          <option value={14}>14일</option>
          <option value={30}>30일</option>
          <option value={60}>60일</option>
          <option value={90}>90일</option>
        </select>
      )}
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="제재 사유"
        rows={2}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
      />
      <Button onClick={handleSubmit} disabled={!reason.trim() || submitting} className="w-full bg-red-600 hover:bg-red-700">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
        제재 발급
      </Button>
    </div>
  )
}
