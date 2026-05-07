import type { PsychologyOrderbookPressure } from '@/types/psychology'

export default function OrderbookPressureBar({ data }: { data: PsychologyOrderbookPressure }) {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-2">
      <div className="text-xs font-semibold text-gray-700">호가창 압력</div>
      <div className="flex h-6 rounded-md overflow-hidden">
        <div className="bg-red-500 text-white text-xs flex items-center justify-center" style={{ width: `${data.bid_pct}%` }}>
          매수 {data.bid_pct.toFixed(0)}%
        </div>
        <div className="bg-blue-500 text-white text-xs flex items-center justify-center" style={{ width: `${data.ask_pct}%` }}>
          매도 {data.ask_pct.toFixed(0)}%
        </div>
      </div>
      <p className="text-xs text-gray-600">{data.interpretation}</p>
    </div>
  )
}
