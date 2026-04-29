/**
 * LiquidityZonePanel — 유동성 풀 + 최근 sweep 이벤트
 */

import { ArrowUp, ArrowDown } from 'lucide-react'
import type { LiquidityPool, LiquidityResult } from '@/types/smartMoney'

interface Props {
  liquidity: LiquidityResult
}

const POOL_TYPE_LABEL: Record<LiquidityPool['type'], string> = {
  'equal-highs': '동일 고점',
  'equal-lows': '동일 저점',
  pdh: '전일 고가',
  pdl: '전일 저가',
  'swing-high': '스윙 고점',
  'swing-low': '스윙 저점',
}

const POOL_TYPE_COLOR: Record<LiquidityPool['type'], string> = {
  'equal-highs': 'bg-rose-50 text-rose-700 border-rose-200',
  'equal-lows': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pdh: 'bg-rose-50 text-rose-700 border-rose-200',
  pdl: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'swing-high': 'bg-rose-50 text-rose-700 border-rose-200',
  'swing-low': 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export function LiquidityZonePanel({ liquidity }: Props) {
  const noPools = liquidity.pools.length === 0
  const noSweeps = liquidity.recentSweeps.length === 0

  // unswept 우선, 그 다음 hits 내림차순, 최대 6개
  const sortedPools = [...liquidity.pools]
    .sort((a, b) => {
      if (a.swept !== b.swept) return a.swept ? 1 : -1
      return b.hits - a.hits
    })
    .slice(0, 6)

  const recentSweeps = [...liquidity.recentSweeps].slice(-3).reverse()

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">유동성 존</h3>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-700">
          풀 {liquidity.pools.length} · 사냥 {liquidity.recentSweeps.length}
        </span>
      </div>

      {noPools && noSweeps ? (
        <div className="text-[11px] text-slate-500 leading-relaxed py-2">
          유동성 풀/사냥 이벤트 없음
        </div>
      ) : (
        <div className="space-y-3">
          {sortedPools.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">활성 풀</p>
              <div className="space-y-1">
                {sortedPools.map((p, i) => (
                  <div
                    key={`${p.type}-${p.level}-${i}`}
                    className="flex items-center justify-between text-[11px] gap-2"
                  >
                    <span
                      className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-bold ${POOL_TYPE_COLOR[p.type]} ${
                        p.swept ? 'opacity-50 line-through' : ''
                      }`}
                    >
                      {POOL_TYPE_LABEL[p.type]}
                    </span>
                    <span className="font-mono text-slate-700 flex-1 text-right">{p.level.toLocaleString()}</span>
                    <span className="text-[9px] text-slate-500 font-mono w-10 text-right">×{p.hits}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentSweeps.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">최근 사냥</p>
              <div className="space-y-1.5">
                {recentSweeps.map((s, i) => {
                  const bullish = s.direction === 'bullish-sweep'
                  return (
                    <div
                      key={`${s.barIndex}-${i}`}
                      className="flex items-start gap-2 text-[11px]"
                    >
                      <span
                        className={`flex-shrink-0 mt-0.5 ${bullish ? 'text-emerald-600' : 'text-rose-600'}`}
                      >
                        {bullish ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-bold ${bullish ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {bullish ? '강세 사냥' : '약세 사냥'}
                          </span>
                          <span className="font-mono text-slate-700">{s.level.toLocaleString()}</span>
                        </div>
                        {s.description && (
                          <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">{s.description}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
