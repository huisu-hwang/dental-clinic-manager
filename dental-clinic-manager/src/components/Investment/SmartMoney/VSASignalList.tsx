/**
 * VSASignalList — VSA(Volume Spread Analysis) effort vs result + 시그널 리스트
 */

import type { VSAResult, VSASignalEntry } from '@/types/smartMoney'

interface Props {
  vsa: VSAResult
}

const VSA_TYPE_LABEL: Record<VSASignalEntry['type'], string> = {
  'no-demand': '수요 부재',
  'no-supply': '공급 부재',
  'buying-climax': '매수 클라이맥스',
  'selling-climax': '매도 클라이맥스',
  'stopping-volume': '멈춤 거래량',
}

// emerald = 강세 의미 / rose = 약세 의미
const VSA_TYPE_COLOR: Record<VSASignalEntry['type'], string> = {
  'no-demand': 'bg-rose-100 text-rose-700',
  'buying-climax': 'bg-rose-100 text-rose-700',
  'no-supply': 'bg-emerald-100 text-emerald-700',
  'selling-climax': 'bg-emerald-100 text-emerald-700',
  'stopping-volume': 'bg-emerald-100 text-emerald-700',
}

export function VSASignalList({ vsa }: Props) {
  const effortBadge =
    vsa.effortVsResult === 'bullish'
      ? 'bg-emerald-100 text-emerald-700'
      : vsa.effortVsResult === 'bearish'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-700'
  const effortLabel =
    vsa.effortVsResult === 'bullish' ? '강세' : vsa.effortVsResult === 'bearish' ? '약세' : '중립'

  const signals = vsa.signals.slice(0, 5)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">VSA 시그널</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${effortBadge}`}>
          노력 vs 결과: {effortLabel}
        </span>
      </div>

      {signals.length === 0 ? (
        <p className="text-[11px] text-slate-500 leading-relaxed py-2">VSA 시그널 미감지</p>
      ) : (
        <div className="space-y-1.5">
          {signals.map((s, i) => (
            <div
              key={`${s.type}-${s.barIndex}-${i}`}
              className="flex items-start justify-between gap-2 text-[11px]"
            >
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span
                  className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${VSA_TYPE_COLOR[s.type]}`}
                >
                  {VSA_TYPE_LABEL[s.type]}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">#{s.barIndex}</span>
              </div>
              <span className="flex-shrink-0 font-mono text-[10px] text-slate-700 font-bold">
                {s.confidence.toFixed(0)}%
              </span>
            </div>
          ))}
          {vsa.description && (
            <p className="text-[11px] text-slate-500 leading-relaxed pt-1 line-clamp-2 border-t border-slate-100">
              {vsa.description}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
