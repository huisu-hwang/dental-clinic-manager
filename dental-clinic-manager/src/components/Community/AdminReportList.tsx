'use client'

import { useState, useEffect, useCallback } from 'react'
import { Flag, ChevronLeft, ChevronRight, Filter, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { communityAdminService } from '@/lib/communityService'
import type { CommunityReport, ReportStatus } from '@/types/community'
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS } from '@/types/community'
import AdminReportDetail from './AdminReportDetail'

export default function AdminReportList() {
  const [reports, setReports] = useState<CommunityReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReportStatus | ''>('pending')
  const [selectedReport, setSelectedReport] = useState<CommunityReport | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const ITEMS_PER_PAGE = 20

  const fetchReports = useCallback(async () => {
    setError(null)
    const { data, total: totalCount, error: fetchError } = await communityAdminService.getReports({
      status: statusFilter || undefined,
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    })
    if (fetchError) {
      setError(fetchError)
    } else {
      setReports(data || [])
      setTotal(totalCount)
    }
    setLoading(false)
  }, [statusFilter, page])

  useEffect(() => { fetchReports() }, [fetchReports])

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case 'pending': return 'bg-at-warning-bg text-at-warning'
      case 'reviewed': return 'bg-at-tag text-at-accent'
      case 'action_taken': return 'bg-at-error-bg text-at-error'
      case 'dismissed': return 'bg-at-surface-alt text-at-text-secondary'
    }
  }

  if (selectedReport) {
    return (
      <AdminReportDetail
        report={selectedReport}
        onBack={() => { setSelectedReport(null); fetchReports() }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-at-error" />
          <h2 className="text-lg font-semibold text-at-text">신고 관리</h2>
          <span className="text-sm text-at-text-secondary">({total}건)</span>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-at-text-weak" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as ReportStatus | ''); setPage(1) }}
            className="border border-at-border rounded-xl px-3 py-1.5 text-sm"
          >
            <option value="">전체</option>
            <option value="pending">대기중</option>
            <option value="action_taken">조치완료</option>
            <option value="dismissed">기각</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 bg-at-error-bg text-at-error rounded-xl">
          <AlertCircle className="w-5 h-5" /><span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent"></div>
        </div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 text-at-text-secondary">
          <Flag className="w-12 h-12 mx-auto mb-4 text-at-text-weak" />
          <p>신고 내역이 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-at-border divide-y divide-at-border shadow-at-card">
            {reports.map((report) => (
              <div
                key={report.id}
                onClick={() => setSelectedReport(report)}
                className="p-4 hover:bg-at-surface-hover cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(report.status)}`}>
                      {REPORT_STATUS_LABELS[report.status]}
                    </span>
                    <span className="text-sm font-medium text-at-text-secondary">
                      {REPORT_REASON_LABELS[report.reason]}
                    </span>
                  </div>
                  <span className="text-xs text-at-text-weak">{formatDate(report.created_at)}</span>
                </div>
                <p className="text-sm text-at-text-secondary mt-1 truncate">
                  {report.post ? `게시글: ${report.post.title}` : `댓글: ${report.comment?.content?.substring(0, 50)}...`}
                </p>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-at-text-secondary">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
