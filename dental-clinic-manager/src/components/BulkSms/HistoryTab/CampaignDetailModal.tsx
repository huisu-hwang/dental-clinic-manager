'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import CampaignStatusBadge from '../shared/CampaignStatusBadge'
import type { BulkSmsCampaign, BulkSmsRecipient } from '@/types/bulkSms'

interface Props {
  campaignId: string | null
  onClose: () => void
}

export default function CampaignDetailModal({ campaignId, onClose }: Props) {
  const [campaign, setCampaign] = useState<BulkSmsCampaign | null>(null)
  const [recipients, setRecipients] = useState<BulkSmsRecipient[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!campaignId) return
    setLoading(true)
    fetch(`/api/bulk-sms/campaigns/${campaignId}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setCampaign(d.campaign)
          setRecipients(d.recipients)
        }
      })
      .finally(() => setLoading(false))
  }, [campaignId])

  if (!campaignId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--at-border)]">
          <h2 className="text-lg font-semibold text-[var(--at-text-primary)]">캠페인 상세</h2>
          <button onClick={onClose} className="text-[var(--at-text-weak)] hover:text-[var(--at-text-secondary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--at-text-weak)]">불러오는 중...</div>
        ) : campaign && (
          <div className="overflow-y-auto">
            <div className="px-4 py-3 border-b border-[var(--at-border)] space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <CampaignStatusBadge status={campaign.status} />
                <span className="text-[var(--at-text-secondary)]">{new Date(campaign.created_at).toLocaleString('ko-KR')}</span>
              </div>
              {campaign.title && <div><span className="text-[var(--at-text-secondary)]">제목:</span> <span className="font-medium">{campaign.title}</span></div>}
              <div>
                <span className="text-[var(--at-text-secondary)]">결과:</span>
                <span className="ml-2">전체 {campaign.total_count} · 성공 {campaign.success_count} · 실패 {campaign.fail_count}</span>
              </div>
              <div>
                <p className="text-[var(--at-text-secondary)] mb-1">본문</p>
                <div className="bg-[var(--at-surface-alt)] border border-[var(--at-border)] rounded p-2 whitespace-pre-wrap text-xs">{campaign.message}</div>
              </div>
            </div>

            <table className="w-full text-sm">
              <thead className="bg-[var(--at-surface-alt)] text-xs text-[var(--at-text-secondary)] sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left">이름</th>
                  <th className="px-3 py-2 text-left">전화번호</th>
                  <th className="px-3 py-2 text-left">상태</th>
                  <th className="px-3 py-2 text-left">사유</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map(r => (
                  <tr key={r.id} className="border-t border-[var(--at-border)]">
                    <td className="px-3 py-2">{r.patient_name ?? '-'}</td>
                    <td className="px-3 py-2 tabular-nums">{r.phone_number}</td>
                    <td className="px-3 py-2">
                      <span className={r.status === 'success' ? 'text-green-700' : r.status === 'failed' ? 'text-red-700' : 'text-[var(--at-text-secondary)]'}>
                        {r.status === 'success' ? '성공' : r.status === 'failed' ? '실패' : '대기'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--at-text-secondary)] text-xs">{r.error_message ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
