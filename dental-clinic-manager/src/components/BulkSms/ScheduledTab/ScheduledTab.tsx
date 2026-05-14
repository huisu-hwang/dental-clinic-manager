'use client'

import { useEffect, useState } from 'react'
import { XCircle } from 'lucide-react'
import CampaignStatusBadge from '../shared/CampaignStatusBadge'
import type { BulkSmsCampaign } from '@/types/bulkSms'

export default function ScheduledTab() {
  const [campaigns, setCampaigns] = useState<BulkSmsCampaign[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const res = await fetch('/api/bulk-sms/campaigns?status=scheduled')
    const d = await res.json()
    if (d.success) setCampaigns(d.campaigns)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const cancel = async (id: string) => {
    if (!confirm('이 예약 캠페인을 취소하시겠습니까?')) return
    const res = await fetch(`/api/bulk-sms/campaigns/${id}/cancel`, { method: 'POST' })
    const d = await res.json()
    if (d.success) load()
    else alert(d.error || '취소 실패')
  }

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
  if (campaigns.length === 0) return <div className="p-8 text-center text-sm text-gray-400">예약된 캠페인이 없습니다.</div>

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500">
          <tr>
            <th className="px-3 py-2 text-left">상태</th>
            <th className="px-3 py-2 text-left">제목</th>
            <th className="px-3 py-2 text-left">대상</th>
            <th className="px-3 py-2 text-left">예약 시각</th>
            <th className="w-24"></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} className="border-t border-gray-100">
              <td className="px-3 py-2"><CampaignStatusBadge status={c.status} /></td>
              <td className="px-3 py-2 font-medium text-gray-900">{c.title || '-'}</td>
              <td className="px-3 py-2 tabular-nums">{c.total_count}명</td>
              <td className="px-3 py-2 text-gray-700">
                {c.scheduled_at ? new Date(c.scheduled_at).toLocaleString('ko-KR') : '-'}
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => cancel(c.id)}
                  className="text-xs text-red-600 hover:underline flex items-center gap-1"
                >
                  <XCircle className="w-3.5 h-3.5" /> 취소
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
