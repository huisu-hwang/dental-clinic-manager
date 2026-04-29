/**
 * WyckoffPhaseTimeline — 와이코프 페이즈 A→B→C→D→E 스테퍼 + 최근 이벤트
 *
 * - cycle === 'accumulation' → emerald, 'distribution' → rose, null → slate(데이터 부족)
 * - 최근 이벤트는 최대 5개(역순) 작은 칩으로 표시
 */

import type { WyckoffPhaseEvent, WyckoffPhaseResult } from '@/types/smartMoney'

interface Props {
  phase: WyckoffPhaseResult
}

const PHASES: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E']

const EVENT_LABEL: Record<WyckoffPhaseEvent['type'], string> = {
  PS: '예비 지지',
  SC: '셀링 클라이맥스',
  AR: '자동 반등',
  ST: '2차 테스트',
  Spring: '스프링',
  Test: '테스트',
  SOS: '강세 신호',
  LPS: '마지막 지지점',
  PSY: '예비 공급',
  BC: '바잉 클라이맥스',
  UTAD: '업스러스트',
  SOW: '약세 신호',
  LPSY: '마지막 공급점',
}

export function WyckoffPhaseTimeline({ phase }: Props) {
  const isAccumulation = phase.cycle === 'accumulation'
  const isDistribution = phase.cycle === 'distribution'
  const activeColor = isAccumulation
    ? 'bg-emerald-500 text-white border-emerald-500'
    : isDistribution
      ? 'bg-rose-500 text-white border-rose-500'
      : 'bg-slate-300 text-white border-slate-300'
  const inactiveColor = 'bg-white text-slate-400 border-slate-200'
  const lineActiveColor = isAccumulation
    ? 'bg-emerald-300'
    : isDistribution
      ? 'bg-rose-300'
      : 'bg-slate-200'

  const activePhaseIdx = phase.phase ? PHASES.indexOf(phase.phase) : -1
  const noData = phase.cycle === null || phase.events.length === 0

  // 최근 5개 (이벤트 배열의 마지막 5개를 역순으로)
  const recentEvents = [...phase.events].slice(-5).reverse()

  const cycleLabel = isAccumulation ? '매집 사이클' : isDistribution ? '분배 사이클' : '판단 보류'
  const cycleBadge = isAccumulation
    ? 'bg-emerald-100 text-emerald-700'
    : isDistribution
      ? 'bg-rose-100 text-rose-700'
      : 'bg-slate-100 text-slate-500'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">와이코프 페이즈</h3>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cycleBadge}`}>{cycleLabel}</span>
      </div>

      {noData ? (
        <div className="text-[11px] text-slate-500 leading-relaxed py-2">
          데이터 부족 — 와이코프 페이즈 미감지
        </div>
      ) : (
        <>
          {/* Stepper */}
          <div className="flex items-center justify-between mb-3">
            {PHASES.map((p, idx) => {
              const isActive = idx === activePhaseIdx
              const isPast = activePhaseIdx >= 0 && idx < activePhaseIdx
              const dotClass = isActive || isPast ? activeColor : inactiveColor
              return (
                <div key={p} className="flex-1 flex items-center">
                  <div
                    className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-[11px] font-bold ${dotClass}`}
                  >
                    {p}
                  </div>
                  {idx < PHASES.length - 1 && (
                    <div
                      className={`flex-1 h-0.5 mx-1 ${isPast ? lineActiveColor : 'bg-slate-200'}`}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Events */}
          {recentEvents.length > 0 && (
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">최근 이벤트</p>
              <div className="flex flex-wrap gap-1.5">
                {recentEvents.map((ev, i) => (
                  <div
                    key={`${ev.type}-${ev.barIndex}-${i}`}
                    className="flex items-center gap-1 rounded-full bg-slate-50 border border-slate-200 px-2 py-0.5"
                  >
                    <span className="text-[9px] font-bold text-slate-700">{ev.type}</span>
                    <span className="text-[10px] text-slate-600">{EVENT_LABEL[ev.type] ?? ev.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {phase.description && (
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pt-2">{phase.description}</p>
          )}
        </>
      )}
    </div>
  )
}
