'use client'

import { useState } from 'react'
import { Flag, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { communityReportService } from '@/lib/communityService'
import type { ReportReason } from '@/types/community'
import { REPORT_REASON_LABELS } from '@/types/community'

interface ReportModalProps {
  postId?: string
  commentId?: string
  profileId: string
  onClose: () => void
}

const reasons: ReportReason[] = ['spam', 'harassment', 'inappropriate', 'privacy', 'misinformation', 'other']

export default function ReportModal({ postId, commentId, profileId, onClose }: ReportModalProps) {
  const [selectedReason, setSelectedReason] = useState<ReportReason | null>(null)
  const [detail, setDetail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async () => {
    if (!selectedReason) return
    setSubmitting(true)

    const { success } = await communityReportService.submitReport(profileId, {
      post_id: postId,
      comment_id: commentId,
      reason: selectedReason,
      detail: detail || undefined,
    })

    if (success) {
      setSubmitted(true)
      setTimeout(onClose, 1500)
    }
    setSubmitting(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" />
            <h3 className="text-lg font-semibold text-gray-900">신고</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Flag className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-gray-700 font-medium">신고가 접수되었습니다.</p>
            <p className="text-sm text-gray-500 mt-1">관리자가 검토 후 조치합니다.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">신고 사유를 선택해주세요.</p>

            <div className="space-y-2 mb-4">
              {reasons.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSelectedReason(reason)}
                  className={`w-full text-left px-4 py-2.5 rounded-lg border transition-colors text-sm ${
                    selectedReason === reason
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  {REPORT_REASON_LABELS[reason]}
                </button>
              ))}
            </div>

            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="추가 설명 (선택사항)"
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 mb-4"
            />

            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1">취소</Button>
              <Button onClick={handleSubmit} disabled={!selectedReason || submitting} className="flex-1 bg-red-600 hover:bg-red-700">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                신고하기
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
