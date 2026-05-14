import type { BulkSmsCampaignStatus } from '@/types/bulkSms'

const STATUS_MAP: Record<BulkSmsCampaignStatus, { label: string; cls: string }> = {
  draft:     { label: '임시저장', cls: 'bg-gray-100 text-[var(--at-text-primary)]' },
  scheduled: { label: '예약',     cls: 'bg-amber-100 text-amber-800' },
  sending:   { label: '발송중',   cls: 'bg-blue-100 text-blue-800' },
  sent:      { label: '발송완료', cls: 'bg-green-100 text-green-800' },
  failed:    { label: '실패',     cls: 'bg-red-100 text-red-800' },
  cancelled: { label: '취소',     cls: 'bg-gray-100 text-[var(--at-text-secondary)] line-through' },
}

export default function CampaignStatusBadge({ status }: { status: BulkSmsCampaignStatus }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.draft
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  )
}
