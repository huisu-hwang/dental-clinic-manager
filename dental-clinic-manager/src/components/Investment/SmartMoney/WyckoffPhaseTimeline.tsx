/**
 * WyckoffPhaseTimeline — 와이코프 페이즈 A→B→C→D→E 스테퍼 + 최근 이벤트
 *
 * - cycle === 'accumulation' → emerald, 'distribution' → rose, null → slate(데이터 부족)
 * - 최근 이벤트는 최대 5개(역순) 작은 칩으로 표시
 */

'use client'

import { useState } from 'react'
import { Info, X } from 'lucide-react'
import type { WyckoffPhaseEvent, WyckoffPhaseResult } from '@/types/smartMoney'

const HELP = {
  title: '와이코프 페이즈 (Wyckoff Phase)',
  body: "리처드 와이코프의 가격 사이클 이론 — 매집(Accumulation) / 분배(Distribution) 단계를 A→B→C→D→E의 5단계로 구분. SC(매도 클라이맥스), Spring(저점 거짓 이탈), SOS(강세 신호), UTAD(고점 거짓 돌파), SOW(약세 신호) 등의 핵심 이벤트가 어느 단계에 도달했는지 보여줌. Phase C 이후는 추세 전환 임박 신호.",
}

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
  const [helpOpen, setHelpOpen] = useState(false)
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
  // cycle이 있으면 phase A~E 미확정이라도 의미 있는 정보(추세 기반 fallback) 표시
  const noData = phase.cycle === null && phase.events.length === 0

  // 최근 5개 (이벤트 배열의 마지막 5개를 역순으로)
  const recentEvents = [...phase.events].slice(-5).reverse()

  const cycleLabel = isAccumulation ? '매집 사이클' : isDistribution ? '분배 사이클' : '판단 보류'
  const cycleBadge = isAccumulation
    ? 'bg-emerald-100 text-emerald-700'
    : isDistribution
      ? 'bg-rose-100 text-rose-700'
      : 'bg-slate-100 text-slate-500'

  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">와이코프 페이즈</h3>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${cycleBadge}`}>{cycleLabel}</span>
          <button
            type="button"
            onClick={() => setHelpOpen((o) => !o)}
            className="flex-shrink-0 p-1 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            aria-label="설명 보기"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {helpOpen && (
        <div className="absolute right-2 top-9 z-20 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="text-xs font-semibold text-slate-900">{HELP.title}</p>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="text-slate-400 hover:text-slate-700 -mt-0.5 -mr-0.5"
              aria-label="닫기"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-600">{HELP.body}</p>
        </div>
      )}

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
