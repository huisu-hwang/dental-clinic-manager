'use client'
import type { PsychologyAnalysisRecord } from '@/types/psychology'

const TRIGGER_LABEL: Record<string, string> = {
  manual: '수동',
  cron: '자동',
  event: '이벤트',
}

export default function AnalysisHistory({ records, onSelect }: {
  records: PsychologyAnalysisRecord[]
  onSelect: (r: PsychologyAnalysisRecord) => void
}) {
  if (!records.length) return null
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-at-border overflow-hidden">
      <div className="px-5 py-3 border-b border-at-border">
        <h3 className="text-sm font-semibold text-at-text">최근 분석 이력</h3>
      </div>
      <ul className="divide-y divide-at-border max-h-56 overflow-y-auto">
        {records.map(r => (
          <li key={r.id}>
            <button
              onClick={() => onSelect(r)}
              className="w-full text-left flex items-center justify-between gap-3 px-5 py-2.5 text-xs hover:bg-at-surface-alt transition-colors"
            >
              <span className="text-at-text-secondary tabular-nums">
                {new Date(r.created_at).toLocaleString('ko-KR', {
                  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <span className="text-at-text-weak">
                {TRIGGER_LABEL[r.trigger_kind] ?? r.trigger_kind}
              </span>
              <span className="font-mono font-semibold text-at-text">{r.psychology_score}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
