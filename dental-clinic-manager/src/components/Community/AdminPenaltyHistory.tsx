'use client'

import { useState, useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { communityAdminService } from '@/lib/communityService'
import type { CommunityPenalty } from '@/types/community'
import { PENALTY_TYPE_LABELS } from '@/types/community'

export default function AdminPenaltyHistory() {
  const [penalties, setPenalties] = useState<CommunityPenalty[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await communityAdminService.getPenalties()
      setPenalties(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric', month: 'short', day: 'numeric',
    })
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'warning': return 'bg-at-warning-bg text-at-warning'
      case 'temp_ban': return 'bg-orange-100 text-orange-700'
      case 'permanent_ban': return 'bg-at-error-bg text-at-error'
      default: return 'bg-at-surface-alt text-at-text-secondary'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-at-error" />
        <h2 className="text-lg font-semibold text-at-text">제재 이력</h2>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent"></div>
        </div>
      ) : penalties.length === 0 ? (
        <div className="text-center py-12 text-at-text-secondary">
          <ShieldAlert className="w-12 h-12 mx-auto mb-4 text-at-text-weak" />
          <p>제재 이력이 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-at-border divide-y divide-at-border shadow-at-card">
          {penalties.map((penalty) => (
            <div key={penalty.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${getTypeColor(penalty.type)}`}>
                    {PENALTY_TYPE_LABELS[penalty.type]}
                  </span>
                  <span className="text-sm font-medium text-at-text-secondary">{penalty.profile?.nickname || '알 수 없음'}</span>
                </div>
                <span className="text-xs text-at-text-weak">{formatDate(penalty.created_at)}</span>
              </div>
              <p className="text-sm text-at-text-secondary mt-1">{penalty.reason}</p>
              {penalty.duration_days && (
                <p className="text-xs text-at-text-weak mt-1">기간: {penalty.duration_days}일</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
