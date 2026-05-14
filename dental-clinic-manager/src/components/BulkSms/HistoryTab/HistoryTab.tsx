'use client'

import { useEffect, useState } from 'react'
import CampaignStatusBadge from '../shared/CampaignStatusBadge'
import CampaignDetailModal from './CampaignDetailModal'
import type { BulkSmsCampaign } from '@/types/bulkSms'

export default function HistoryTab() {
  const [campaigns, setCampaigns] = useState<BulkSmsCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/bulk-sms/campaigns')
      .then(r => r.json())
      .then(d => { if (d.success) setCampaigns(d.campaigns) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
  if (campaigns.length === 0) return <div className="p-8 text-center text-sm text-gray-400">아직 발송 이력이 없습니다.</div>

  return (
    <>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">상태</th>
              <th className="px-3 py-2 text-left">제목</th>
              <th className="px-3 py-2 text-left">유형</th>
              <th className="px-3 py-2 text-left">대상</th>
              <th className="px-3 py-2 text-left">성공/실패</th>
              <th className="px-3 py-2 text-left">생성/발송</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2"><CampaignStatusBadge status={c.status} /></td>
                <td className="px-3 py-2 font-medium text-gray-900">{c.title || '-'}</td>
                <td className="px-3 py-2 text-gray-500">{c.msg_type}</td>
                <td className="px-3 py-2 tabular-nums">{c.total_count}</td>
                <td className="px-3 py-2 tabular-nums">
                  <span className="text-green-700">{c.success_count}</span>
                  <span className="text-gray-400"> / </span>
                  <span className="text-red-700">{c.fail_count}</span>
                </td>
                <td className="px-3 py-2 text-gray-500 text-xs">
                  {c.sent_at ? new Date(c.sent_at).toLocaleString('ko-KR') : new Date(c.created_at).toLocaleString('ko-KR')}
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => setOpenId(c.id)} className="text-xs text-blue-600 hover:underline">상세</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CampaignDetailModal campaignId={openId} onClose={() => setOpenId(null)} />
    </>
  )
}
