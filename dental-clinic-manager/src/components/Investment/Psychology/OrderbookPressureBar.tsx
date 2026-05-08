import type { PsychologyOrderbookPressure } from '@/types/psychology'

export default function OrderbookPressureBar({ data }: { data: PsychologyOrderbookPressure }) {
  return (
    <div className="bg-white rounded-3xl shadow-sm border border-at-border p-5 space-y-3">
      <h3 className="text-sm font-semibold text-at-text">호가창 압력</h3>
      <div className="flex h-7 rounded-xl overflow-hidden">
        <div
          className="bg-rose-500 text-white text-xs font-medium flex items-center justify-center"
          style={{ width: `${data.bid_pct}%` }}
        >
          매수 {data.bid_pct.toFixed(0)}%
        </div>
        <div
          className="bg-blue-500 text-white text-xs font-medium flex items-center justify-center"
          style={{ width: `${data.ask_pct}%` }}
        >
          매도 {data.ask_pct.toFixed(0)}%
        </div>
      </div>
      <p className="text-xs text-at-text-secondary leading-relaxed">{data.interpretation}</p>
    </div>
  )
}
