/**
 * WyckoffPhaseTimeline — 와이코프 페이즈 A→B→C→D→E 스테퍼 + 최근 이벤트
 *
 * - cycle === 'accumulation' → emerald, 'distribution' → rose, null → slate(데이터 부족)
 * - 최근 이벤트는 최대 5개(역순) 작은 칩으로 표시
 */

'use client'

import { useState } from 'react'
import { Info, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { WyckoffPhaseEvent, WyckoffPhaseResult } from '@/types/smartMoney'

const HELP = {
  title: '와이코프 페이즈 (Wyckoff Phase)',
  body: "리처드 와이코프의 가격 사이클 이론 — 매집(Accumulation) / 분배(Distribution) 단계를 A→B→C→D→E의 5단계로 구분. SC(매도 클라이맥스), Spring(저점 거짓 이탈), SOS(강세 신호), UTAD(고점 거짓 돌파), SOW(약세 신호) 등의 핵심 이벤트가 어느 단계에 도달했는지 보여줌. Phase C 이후는 추세 전환 임박 신호.",
}

interface Props {
  phase: WyckoffPhaseResult
}

const PHASES: Array<'A' | 'B' | 'C' | 'D' | 'E'> = ['A', 'B', 'C', 'D', 'E']

/** 매집(Accumulation) 사이클의 단계별 의미 */
const ACCUMULATION_PHASE_INFO: Record<'A' | 'B' | 'C' | 'D' | 'E', { short: string; meaning: string }> = {
  A: { short: '하락 정지', meaning: '매도 클라이맥스 + 자동 반등 — 하락 추세가 멈추는 구간' },
  B: { short: '매집 진행', meaning: '박스권 형성, 큰손이 매물을 흡수 — 시간을 두고 사 모음' },
  C: { short: '마지막 흔들기', meaning: '저점 거짓 이탈(Spring)로 약손 털어냄 — 추세 전환 임박' },
  D: { short: '상승 시작', meaning: '박스권 상단 돌파(SOS) — 매집 완료 후 첫 상승' },
  E: { short: '본격 상승', meaning: '강한 상승 추세 — 마크업 단계, 큰손이 분배 시작 전까지' },
}

/** 분배(Distribution) 사이클의 단계별 의미 */
const DISTRIBUTION_PHASE_INFO: Record<'A' | 'B' | 'C' | 'D' | 'E', { short: string; meaning: string }> = {
  A: { short: '상승 정지', meaning: '매수 클라이맥스 + 자동 반락 — 상승 추세가 멈추는 구간' },
  B: { short: '분배 진행', meaning: '박스권에서 큰손이 매물 분배 — 시간을 두고 팔아 치움' },
  C: { short: '거짓 돌파', meaning: 'UTAD(고점 거짓 돌파)로 추격 매수 유인 — 추세 전환 임박' },
  D: { short: '하락 시작', meaning: '박스권 하단 이탈(SOW) — 분배 완료 후 첫 하락' },
  E: { short: '본격 하락', meaning: '강한 하락 추세 — 마크다운 단계' },
}

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
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const isAccumulation = phase.cycle === 'accumulation'
  const isDistribution = phase.cycle === 'distribution'

  // 사이클별 페이즈 의미 매핑 (사이클 미정 시는 매집 기준 폴백)
  const phaseInfo = isDistribution ? DISTRIBUTION_PHASE_INFO : ACCUMULATION_PHASE_INFO
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
  const majorCycleLabel =
    phase.majorCycle === 'accumulation' ? '4단계: 축적'
      : phase.majorCycle === 'markup' ? '4단계: 상승'
        : phase.majorCycle === 'distribution' ? '4단계: 분배'
          : phase.majorCycle === 'markdown' ? '4단계: 하락'
            : '4단계: 판단 보류'
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
          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600">{majorCycleLabel}</span>
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
        <div className="text-[11px] text-slate-500 leading-relaxed py-2 space-y-1.5">
          {phase.description === '데이터 부족' ? (
            <div>데이터 부족 — 와이코프 페이즈 미감지 (일봉 30개 미만)</div>
          ) : phase.trendHeuristic ? (
            <>
              <div className="font-medium text-slate-700">
                {phase.trendHeuristic.cycle === 'distribution' ? '강한 상승 추세' : '강한 하락 추세'}
                {' — Wyckoff 매집/분배 이벤트 미검출'}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`px-1.5 py-0.5 rounded font-semibold ${
                  phase.trendHeuristic.cycle === 'distribution'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-emerald-50 text-emerald-700'
                }`}>
                  {phase.trendHeuristic.cycle === 'distribution' ? '분배 가능성 (고점)' : '매집 가능성 (저점)'}
                </span>
                <span className="text-slate-500 font-mono">
                  {phase.trendHeuristic.lookbackDays}일 {phase.trendHeuristic.returnPct >= 0 ? '+' : ''}{(phase.trendHeuristic.returnPct * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                Wyckoff 패턴은 횡보(Trading Range) 구간의 매집·분배 이벤트 검출을 본질로 합니다.
                강한 단방향 추세장에서는 PS/SC/Spring/SOS 등 이벤트가 자연스럽게 미감지됩니다.
              </p>
            </>
          ) : phase.description === '이벤트 없음 — 횡보' ? (
            <div>횡보 구간 — Wyckoff 매집/분배 이벤트 미검출</div>
          ) : (
            <div>{phase.description || '와이코프 페이즈 미감지'}</div>
          )}
        </div>
      ) : (
        <>
          {/* Stepper — 활성 페이즈 강조(펄스 + 큰 사이즈) + 단계별 짧은 라벨 */}
          <div className="flex items-start justify-between mb-3">
            {PHASES.map((p, idx) => {
              const isActive = idx === activePhaseIdx
              const isPast = activePhaseIdx >= 0 && idx < activePhaseIdx
              const dotClass = isActive || isPast ? activeColor : inactiveColor
              const ringClass = isActive
                ? isAccumulation
                  ? 'ring-2 ring-emerald-300 ring-offset-2'
                  : isDistribution
                    ? 'ring-2 ring-rose-300 ring-offset-2'
                    : 'ring-2 ring-slate-200 ring-offset-2'
                : ''
              const info = phaseInfo[p]
              return (
                <div key={p} className="flex-1 flex flex-col items-center">
                  <div className="w-full flex items-center">
                    <div
                      className={`flex-shrink-0 ${isActive ? 'w-9 h-9' : 'w-7 h-7'} rounded-full border-2 flex items-center justify-center font-bold transition-all ${dotClass} ${ringClass}`}
                      title={`Phase ${p} · ${info.short} — ${info.meaning}`}
                    >
                      <span className={isActive ? 'text-sm' : 'text-[11px]'}>{p}</span>
                    </div>
                    {idx < PHASES.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-1 ${isPast ? lineActiveColor : 'bg-slate-200'}`}
                      />
                    )}
                  </div>
                  <span
                    className={`mt-1 text-[9px] leading-tight text-center px-0.5 truncate max-w-full ${
                      isActive
                        ? isAccumulation
                          ? 'text-emerald-700 font-semibold'
                          : isDistribution
                            ? 'text-rose-700 font-semibold'
                            : 'text-slate-700 font-semibold'
                        : 'text-slate-400'
                    }`}
                  >
                    {info.short}
                  </span>
                </div>
              )
            })}
          </div>

          {/* 현재 페이즈 의미 — 활성 단계가 있을 때만 큰 박스로 강조 */}
          {phase.phase && (
            <div
              className={`rounded-lg p-2.5 mb-2 border ${
                isAccumulation
                  ? 'bg-emerald-50 border-emerald-200'
                  : isDistribution
                    ? 'bg-rose-50 border-rose-200'
                    : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                    isAccumulation
                      ? 'bg-emerald-500 text-white'
                      : isDistribution
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-400 text-white'
                  }`}
                >
                  Phase {phase.phase}
                </span>
                <span
                  className={`text-xs font-semibold ${
                    isAccumulation
                      ? 'text-emerald-800'
                      : isDistribution
                        ? 'text-rose-800'
                        : 'text-slate-700'
                  }`}
                >
                  {phaseInfo[phase.phase].short}
                </span>
              </div>
              <p
                className={`text-[11px] leading-relaxed ${
                  isAccumulation
                    ? 'text-emerald-900'
                    : isDistribution
                      ? 'text-rose-900'
                      : 'text-slate-700'
                }`}
              >
                {phaseInfo[phase.phase].meaning}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mb-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">신뢰도</div>
              <div className="text-sm font-bold text-slate-900">{Math.round(phase.confidence)}/100</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
              <div className="text-[10px] text-slate-500">TR 범위</div>
              <div className="text-[11px] font-mono font-bold text-slate-900">
                {phase.rangeLow && phase.rangeHigh
                  ? `${phase.rangeLow.toFixed(2)} - ${phase.rangeHigh.toFixed(2)}`
                  : '미확정'}
              </div>
            </div>
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

          {/* 페이즈 가이드 토글 — 매집/분배 사이클 모든 페이즈 의미 */}
          <div className="pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setGlossaryOpen((o) => !o)}
              className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
            >
              <span>페이즈별 의미 가이드</span>
              {glossaryOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {glossaryOpen && (
              <div className="mt-2 space-y-2">
                <div>
                  <p className="text-[10px] font-semibold text-emerald-700 mb-1">📈 매집(Accumulation)</p>
                  <div className="space-y-0.5">
                    {PHASES.map((p) => (
                      <div key={`acc-${p}`} className="flex items-start gap-2 text-[10.5px] leading-relaxed">
                        <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">{p}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-700 font-medium">{ACCUMULATION_PHASE_INFO[p].short}</span>
                          <span className="text-slate-400 mx-1">·</span>
                          <span className="text-slate-500">{ACCUMULATION_PHASE_INFO[p].meaning}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-1.5 border-t border-slate-100">
                  <p className="text-[10px] font-semibold text-rose-700 mb-1">📉 분배(Distribution)</p>
                  <div className="space-y-0.5">
                    {PHASES.map((p) => (
                      <div key={`dist-${p}`} className="flex items-start gap-2 text-[10.5px] leading-relaxed">
                        <span className="text-[9px] px-1 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">{p}</span>
                        <div className="flex-1 min-w-0">
                          <span className="text-slate-700 font-medium">{DISTRIBUTION_PHASE_INFO[p].short}</span>
                          <span className="text-slate-400 mx-1">·</span>
                          <span className="text-slate-500">{DISTRIBUTION_PHASE_INFO[p].meaning}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {phase.description && (
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pt-2">{phase.description}</p>
          )}
        </>
      )}
    </div>
  )
}
