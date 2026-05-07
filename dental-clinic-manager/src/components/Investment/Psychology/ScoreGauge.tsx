interface Props { score: number; label: string }

export default function ScoreGauge({ score, label }: Props) {
  const clamped = Math.max(0, Math.min(100, score))
  return (
    <div className="rounded-xl border bg-white p-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">공포·탐욕 지수</span>
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-red-500 via-gray-300 to-blue-500">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-gray-700 shadow"
          style={{ left: `calc(${clamped}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>0 공포</span><span>50 중립</span><span>100 탐욕</span>
      </div>
      <div className="text-2xl font-bold text-center">{clamped}</div>
    </div>
  )
}
