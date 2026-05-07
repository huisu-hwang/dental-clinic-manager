'use client'
import type { PsychologyAnalysisRecord } from '@/types/psychology'

export default function AnalysisHistory({ records, onSelect }: {
  records: PsychologyAnalysisRecord[]
  onSelect: (r: PsychologyAnalysisRecord) => void
}) {
  if (!records.length) return null
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="text-sm font-semibold mb-2 text-gray-700">최근 분석 이력</h3>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {records.map(r => (
          <li key={r.id}>
            <button onClick={() => onSelect(r)}
              className="w-full text-left text-xs flex justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
              <span>{new Date(r.created_at).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
              <span className="text-gray-500">{r.trigger_kind}</span>
              <span className="font-mono">{r.psychology_score}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
