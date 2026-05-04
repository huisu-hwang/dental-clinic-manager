/**
 * MarketStructureBadge — 시장구조(SMC) 트렌드 + 최근 BOS/CHoCH + 스윙 포인트
 */

'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, Activity, Info, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { MarketStructureResult, SwingPoint } from '@/types/smartMoney'

const HELP = {
  title: '시장 구조 (SMC)',
  body: '스마트머니 콘셉트(SMC)에서 정의하는 시장 구조 — 스윙 고점·저점이 HH(Higher High), HL(Higher Low), LH, LL 중 어떻게 배열되는지로 추세를 판단. BOS(Break of Structure)는 추세 지속, CHoCH(Change of Character)는 추세 반전 신호. CHoCH 출현 시 기관의 의도가 바뀐 것으로 해석.',
}

interface Props {
  structure: MarketStructureResult
  /** LLM 카드별 한 문장 해석 (옵션) */
  comment?: string | null
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

interface SwingDef {
  full: string
  short: string
  meaning: string
  bias: 'bull' | 'bear'
}

const SWING_DEFS: Record<SwingPoint['kind'], SwingDef> = {
  HH: {
    full: 'Higher High',
    short: '고점 상승',
    meaning: '직전 고점보다 높은 새 고점 — 매수세 우위, 상승 추세 지속',
    bias: 'bull',
  },
  HL: {
    full: 'Higher Low',
    short: '저점 상승',
    meaning: '직전 저점보다 높은 새 저점 — 조정 후 매수세 재개',
    bias: 'bull',
  },
  LH: {
    full: 'Lower High',
    short: '고점 하락',
    meaning: '직전 고점보다 낮은 새 고점 — 매도 압력 등장, 상승세 약화',
    bias: 'bear',
  },
  LL: {
    full: 'Lower Low',
    short: '저점 하락',
    meaning: '직전 저점보다 낮은 새 저점 — 매도세 우위, 하락 추세 지속',
    bias: 'bear',
  },
}

const EVENT_DEFS = {
  BOS: {
    full: 'Break of Structure',
    desc: '직전 스윙을 같은 방향으로 돌파 — 현재 추세 지속 확인',
  },
  CHoCH: {
    full: 'Change of Character',
    desc: '반대 방향으로 직전 스윙을 돌파 — 추세 전환 가능 신호',
  },
}

/** 현재 추세 + 최근 이벤트에 맞춘 1~2 문장 자동 해석 */
function buildInterpretation(structure: MarketStructureResult): string {
  const { trend, lastEvent, lastEventDirection, swings } = structure
  const trendLabel = trend === 'bullish' ? '상승 추세' : trend === 'bearish' ? '하락 추세' : '횡보'
  const lastTwo = swings.slice(-2).map((s) => s.kind)
  const seq = lastTwo.length > 0 ? ` (최근 스윙 ${lastTwo.join(' → ')})` : ''

  let trendInsight = ''
  if (trend === 'bullish') {
    trendInsight = 'HH·HL 배열로 매수세가 우위. 눌림목(HL 형성)은 매수 진입 후보.'
  } else if (trend === 'bearish') {
    trendInsight = 'LH·LL 배열로 매도세가 우위. 반등(LH 형성)은 매도 진입 후보.'
  } else {
    trendInsight = '뚜렷한 방향성 없음 — 박스권 상하단 돌파 여부를 관찰.'
  }

  let eventInsight = ''
  if (lastEvent === 'BOS') {
    eventInsight =
      lastEventDirection === 'bullish'
        ? ' 최근 BOS(상방)로 추세 지속이 확인됨.'
        : lastEventDirection === 'bearish'
          ? ' 최근 BOS(하방)로 약세 지속이 확인됨.'
          : ''
  } else if (lastEvent === 'CHoCH') {
    eventInsight =
      lastEventDirection === 'bullish'
        ? ' 최근 CHoCH(상방)는 하락에서 상승으로 전환 시그널 — 단기 매수세 진입 가능.'
        : lastEventDirection === 'bearish'
          ? ' 최근 CHoCH(하방)는 상승에서 하락으로 전환 시그널 — 추세 약화·차익실현 주의.'
          : ''
  }

  return `${trendLabel}${seq}. ${trendInsight}${eventInsight}`
}

export function MarketStructureBadge({ structure, comment }: Props) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [glossaryOpen, setGlossaryOpen] = useState(false)
  const interpretation = buildInterpretation(structure)
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
    <div className="relative bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">시장 구조 (SMC)</h3>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${trendBadge}`}>{trendLabel}</span>
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

        {/* 자동 해석 — 현재 추세 + 최근 이벤트 의미 */}
        <div className="pt-2 border-t border-slate-100">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">현재 해석</p>
          <p className="text-[11px] leading-relaxed text-slate-700">{interpretation}</p>
        </div>

        {lastSwings.length > 0 ? (
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">최근 스윙</p>
            <div className="space-y-1">
              {lastSwings.map((s, i) => {
                const def = SWING_DEFS[s.kind]
                return (
                  <div
                    key={`${s.kind}-${s.barIndex}-${i}`}
                    className="flex items-center justify-between text-[11px]"
                    title={`${def.full} — ${def.meaning}`}
                  >
                    <span className={`font-bold ${SWING_COLOR[s.kind]}`}>
                      {s.kind}
                      <span className="ml-1 text-[9px] text-slate-500 font-normal">{SWING_LABEL[s.kind]}</span>
                    </span>
                    <span className="font-mono text-slate-700">{s.price.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 leading-relaxed pt-1">스윙 포인트 데이터 없음</p>
        )}

        {/* 용어 가이드 토글 — HH/HL/LH/LL/BOS/CHoCH 의미 */}
        <div className="pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setGlossaryOpen((o) => !o)}
            className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
          >
            <span>용어 가이드</span>
            {glossaryOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          {glossaryOpen && (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-1 gap-1.5">
                {(Object.keys(SWING_DEFS) as SwingPoint['kind'][]).map((k) => {
                  const def = SWING_DEFS[k]
                  return (
                    <div key={k} className="flex items-start gap-2 text-[10.5px] leading-relaxed">
                      <span className={`font-bold whitespace-nowrap ${SWING_COLOR[k]}`}>{k}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-700 font-medium">{def.full}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="text-slate-500">{def.meaning}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="pt-1.5 border-t border-slate-100 grid grid-cols-1 gap-1.5">
                {(Object.keys(EVENT_DEFS) as Array<keyof typeof EVENT_DEFS>).map((k) => {
                  const def = EVENT_DEFS[k]
                  return (
                    <div key={k} className="flex items-start gap-2 text-[10.5px] leading-relaxed">
                      <span className="font-bold whitespace-nowrap text-slate-700">{k}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-slate-700 font-medium">{def.full}</span>
                        <span className="text-slate-400 mx-1">·</span>
                        <span className="text-slate-500">{def.desc}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {comment && (
          <p className="text-[11px] leading-relaxed text-blue-700 bg-blue-50 rounded-md px-2 py-1.5 mt-1">
            🤖 {comment}
          </p>
        )}

        {structure.description && (
          <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 pt-1">{structure.description}</p>
        )}
      </div>
    </div>
  )
}
