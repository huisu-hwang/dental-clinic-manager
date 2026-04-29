/**
 * MarketStructureBadge — 시장구조(SMC) 트렌드 + 최근 BOS/CHoCH + 스윙 포인트
 */

import { TrendingUp, TrendingDown, Activity } from 'lucide-react'
import type { MarketStructureResult, SwingPoint } from '@/types/smartMoney'

interface Props {
  structure: MarketStructureResult
}

const SWING_LABEL: Record<SwingPoint['kind'], string> = {
  HH: '고점 상승',
  HL: '저점 상승',
  LH: '고점 하락',
  LL: '저점 하락',
}

const SWING_COLOR: Record<SwingPoint['kind'], string> = {
  HH: 'text-emerald-600',
  HL: 'text-emerald-500',
  LH: 'text-rose-500',
  LL: 'text-rose-600',
}

export function MarketStructureBadge({ structure }: Props) {
  const trendBadge =
    structure.trend === 'bullish'
      ? 'bg-emerald-100 text-emerald-700'
      : structure.trend === 'bearish'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-700'
  const trendLabel =
    structure.trend === 'bullish' ? '상승 추세' : structure.trend === 'bearish' ? '하락 추세' : '횡보'

  const trendIcon =
    structure.trend === 'bullish' ? (
      <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
    ) : structure.trend === 'bearish' ? (
      <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
    ) : (
      <Activity className="w-3.5 h-3.5 text-slate-500" />
    )

  const eventLabel = structure.lastEvent ?? '—'
  const directionLabel =
    structure.lastEventDirection === 'bullish'
      ? '강세'
      : structure.lastEventDirection === 'bearish'
        ? '약세'
        : '—'
  const eventColor =
    structure.lastEventDirection === 'bullish'
      ? 'text-emerald-600'
      : structure.lastEventDirection === 'bearish'
        ? 'text-rose-600'
        : 'text-slate-500'

  const lastSwings = [...structure.swings].slice(-5).reverse()

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">시장 구조 (SMC)</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${trendBadge}`}>{trendLabel}</span>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">최근 이벤트</span>
          <span className={`font-bold flex items-center gap-1 ${eventColor}`}>
            {trendIcon}
            <span>
              {eventLabel} · {directionLabel}
            </span>
          </span>
        </div>

        {lastSwings.length > 0 ? (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">최근 스윙</p>
            <div className="space-y-1">
              {lastSwings.map((s, i) => (
                <div
                  key={`${s.kind}-${s.barIndex}-${i}`}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className={`font-bold ${SWING_COLOR[s.kind]}`}>
                    {s.kind}
                    <span className="ml-1 text-[9px] text-slate-500 font-normal">{SWING_LABEL[s.kind]}</span>
                  </span>
                  <span className="font-mono text-slate-700">{s.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 leading-relaxed pt-1">스윙 포인트 데이터 없음</p>
        )}

        {structure.description && (
          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pt-1">{structure.description}</p>
        )}
      </div>
    </div>
  )
}
