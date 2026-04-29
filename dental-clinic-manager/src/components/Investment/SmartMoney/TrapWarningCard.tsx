/**
 * TrapWarningCard — 조작 위험도 게이지 + 트랩 디테일
 */

import { AlertTriangle } from 'lucide-react'
import type { TrapResult } from '@/types/smartMoney'

interface Props {
  traps: TrapResult
  manipulationRiskScore?: number
}

export function TrapWarningCard({ traps, manipulationRiskScore }: Props) {
  const riskScore = Math.max(0, Math.min(100, manipulationRiskScore ?? 0))
  const riskColor =
    riskScore >= 70 ? 'bg-rose-500' : riskScore >= 30 ? 'bg-amber-500' : 'bg-emerald-500'
  const riskTextColor =
    riskScore >= 70 ? 'text-rose-700' : riskScore >= 30 ? 'text-amber-700' : 'text-emerald-700'
  const riskLabel = riskScore >= 70 ? '높음' : riskScore >= 30 ? '주의' : '낮음'

  const noSignal =
    !traps.bullTrapDetected && !traps.bearTrapDetected && (manipulationRiskScore ?? 0) < 20

  const trapDetails = traps.details.slice(0, 3)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          {(traps.bullTrapDetected || traps.bearTrapDetected) && (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          )}
          트랩 / 조작 경계
        </h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 ${riskTextColor}`}>
          {riskLabel}
        </span>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700">조작 위험도</span>
            <span className={`font-mono font-bold ${riskTextColor}`}>{riskScore.toFixed(0)}</span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${riskColor}`}
              style={{ width: `${riskScore}%` }}
            />
          </div>
        </div>

        {noSignal ? (
          <p className="text-[11px] text-slate-400 leading-relaxed pt-2">현재 조작 시그널 없음</p>
        ) : trapDetails.length > 0 ? (
          <div className="pt-2 border-t border-slate-100 space-y-1.5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">감지된 트랩</p>
            {trapDetails.map((t, i) => {
              const isBull = t.type === 'bull-trap'
              return (
                <div key={`${t.type}-${t.breakoutBarIndex}-${i}`} className="flex items-start gap-2 text-[11px]">
                  <AlertTriangle
                    className={`w-3 h-3 flex-shrink-0 mt-0.5 ${isBull ? 'text-rose-500' : 'text-emerald-500'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-bold ${isBull ? 'text-rose-700' : 'text-emerald-700'}`}>
                        {isBull ? '불 트랩' : '베어 트랩'}
                      </span>
                      <span className="font-mono text-slate-600">{t.level.toLocaleString()}</span>
                    </div>
                    {t.description && (
                      <p className="text-[10px] text-slate-500 leading-snug line-clamp-2">{t.description}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          traps.description && (
            <p className="text-[11px] text-slate-500 leading-relaxed pt-2 line-clamp-2">{traps.description}</p>
          )
        )}
      </div>
    </div>
  )
}
