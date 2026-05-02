'use client'

/**
 * SignalPanel — 스마트머니 분석 결과 4개 카드 (VWAP / Wyckoff / 알고리즘 풋프린트 / 외인·기관)
 *
 * 디자인:
 * - 가로 그리드 반응형: 모바일 1열, sm 2열, lg 4열
 * - 매집(긍정) emerald, 분배(부정) rose, 중립 slate
 * - 각 카드 우측 상단 ⓘ 버튼 → popover 설명
 */

import { useState } from 'react'
import { Info, ArrowUp, ArrowDown, Minus, X, Sparkles } from 'lucide-react'
import type { SmartMoneyAnalysis, PerCardComments } from '@/types/smartMoney'
import { WyckoffPhaseTimeline } from './WyckoffPhaseTimeline'
import { MarketStructureBadge } from './MarketStructureBadge'
import { LiquidityZonePanel } from './LiquidityZonePanel'
import { TrapWarningCard } from './TrapWarningCard'
import { VSASignalList } from './VSASignalList'

interface Props {
  analysis: SmartMoneyAnalysis
  /** LLM이 만든 카드별 한 문장 해석 — 없으면 카드 하단에 표시 안 함 */
  cardComments?: PerCardComments
}

type CardKey = 'vwap' | 'wyckoff' | 'algo' | 'flow'

const HELP_TEXT: Record<CardKey, { title: string; body: string }> = {
  vwap: {
    title: 'VWAP (거래량 가중 평균가)',
    body: '하루 동안 거래량으로 가중평균한 가격. 기관 트레이더의 매매 기준선으로 자주 쓰임. 가격이 VWAP 위에 있으면 매수세, 아래면 매도세 우위로 해석.',
  },
  wyckoff: {
    title: 'Wyckoff 패턴',
    body: '리처드 와이코프의 시장 단계 이론. Spring(스프링)은 저점에서 흡수 후 반전, Upthrust(업스러스트)는 고점에서 분배, Absorption은 큰 매물을 조용히 흡수하는 신호.',
  },
  algo: {
    title: '알고리즘 풋프린트',
    body: '대형 기관이 사용하는 실행 알고리즘의 흔적. TWAP(시간분할), VWAP(거래량가중), Iceberg(소량반복), Sniper(타이밍 저격), MOO(시가 동시호가), MOC(종가 동시호가) 패턴 — 특히 MOC는 인덱스/패시브 펀드의 NAV 추종 매매 신호.',
  },
  flow: {
    title: '외국인·기관 수급',
    body: 'KIS API에서 제공하는 투자자별 매매 동향. 외국인·기관의 누적 순매수/순매도 추세는 스마트머니 흐름의 직접 지표. (국내 종목만 제공)',
  },
}

function HelpPopover({ cardKey, onClose }: { cardKey: CardKey; onClose: () => void }) {
  const { title, body } = HELP_TEXT[cardKey]
  return (
    <div className="absolute right-2 top-9 z-20 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-slate-900">{title}</p>
        <button
          type="button"
          onClick={onClose}
          className="text-slate-400 hover:text-slate-700 -mt-0.5 -mr-0.5"
          aria-label="닫기"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-600">{body}</p>
    </div>
  )
}

function SignalCard({
  title,
  cardKey,
  openHelp,
  onToggleHelp,
  comment,
  children,
}: {
  title: string
  cardKey: CardKey
  openHelp: CardKey | null
  onToggleHelp: (k: CardKey | null) => void
  comment?: string
  children: React.ReactNode
}) {
  const isOpen = openHelp === cardKey
  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <button
          type="button"
          onClick={() => onToggleHelp(isOpen ? null : cardKey)}
          className="flex-shrink-0 p-1 rounded-full text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          aria-label={`${title} 설명`}
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1">{children}</div>
      {comment && (
        <div className="mt-3 pt-3 border-t border-dashed border-slate-200">
          <div className="flex items-start gap-1.5">
            <Sparkles className="w-3 h-3 text-purple-500 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] leading-snug text-slate-600">{comment}</p>
          </div>
        </div>
      )}
      {isOpen && <HelpPopover cardKey={cardKey} onClose={() => onToggleHelp(null)} />}
    </div>
  )
}

export function SignalPanel({ analysis, cardComments }: Props) {
  const [openHelp, setOpenHelp] = useState<CardKey | null>(null)
  const { vwap, wyckoff, algoFootprint, investorFlow, market } = analysis

  // 1) VWAP
  const vwapZoneColor =
    vwap.zone === 'above'
      ? 'bg-emerald-100 text-emerald-700'
      : vwap.zone === 'below'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-700'
  const vwapZoneLabel = vwap.zone === 'above' ? 'VWAP 위' : vwap.zone === 'below' ? 'VWAP 아래' : 'VWAP 근처'
  const vwapDistanceSign = vwap.distance >= 0 ? '+' : ''

  // 2) Wyckoff
  const wyckoffSignals = [
    { label: 'Spring (반전매수)', active: wyckoff.springDetected, color: 'emerald' },
    { label: 'Upthrust (반전매도)', active: wyckoff.upthrustDetected, color: 'rose' },
  ]

  // 3) Algo footprint
  const algoBars: { label: string; score: number }[] = [
    { label: 'TWAP', score: algoFootprint.twapScore },
    { label: 'VWAP', score: algoFootprint.vwapScore },
    { label: 'Iceberg', score: algoFootprint.icebergScore },
    { label: 'Sniper', score: algoFootprint.sniperScore },
    { label: 'MOO', score: algoFootprint.mooScore },
    { label: 'MOC', score: algoFootprint.mocScore },
  ]
  const algoDirColor =
    algoFootprint.direction === 'accumulation'
      ? 'text-emerald-600'
      : algoFootprint.direction === 'distribution'
        ? 'text-rose-600'
        : 'text-slate-500'
  const algoDirIcon =
    algoFootprint.direction === 'accumulation' ? (
      <ArrowUp className="w-3.5 h-3.5" />
    ) : algoFootprint.direction === 'distribution' ? (
      <ArrowDown className="w-3.5 h-3.5" />
    ) : (
      <Minus className="w-3.5 h-3.5" />
    )

  // 4) Investor flow
  const isKR = market === 'KR'
  const flowSignalColor =
    investorFlow?.signal === 'accumulation'
      ? 'bg-emerald-100 text-emerald-700'
      : investorFlow?.signal === 'distribution'
        ? 'bg-rose-100 text-rose-700'
        : 'bg-slate-100 text-slate-700'
  const flowSignalLabel =
    investorFlow?.signal === 'accumulation' ? '매집' : investorFlow?.signal === 'distribution' ? '분배' : '중립'

  // 정교화 엔진 결과 — 하나라도 있으면 고급 분석 섹션 노출
  const hasAdvanced =
    Boolean(analysis.wyckoffPhase) ||
    Boolean(analysis.marketStructure) ||
    Boolean(analysis.liquidity) ||
    Boolean(analysis.traps) ||
    Boolean(analysis.vsa)

  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {/* 1. VWAP */}
      <SignalCard title="VWAP 분석" cardKey="vwap" openHelp={openHelp} onToggleHelp={setOpenHelp} comment={cardComments?.vwap}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">현재가 - VWAP</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${vwapZoneColor}`}>{vwapZoneLabel}</span>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {vwapDistanceSign}
            {vwap.distance.toFixed(2)}%
          </div>
          <div className="text-[11px] text-slate-500">
            VWAP <span className="font-mono text-slate-700">{vwap.vwap.toLocaleString()}</span>
          </div>
          <div className="text-[11px] text-slate-500">
            표준편차 <span className="font-mono">{vwap.standardDeviation.toFixed(2)}</span>
          </div>
        </div>
      </SignalCard>

      {/* 2. Wyckoff */}
      <SignalCard title="Wyckoff 패턴" cardKey="wyckoff" openHelp={openHelp} onToggleHelp={setOpenHelp} comment={cardComments?.wyckoff}>
        <div className="space-y-2">
          {wyckoffSignals.map(s => (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <span className="text-slate-700">{s.label}</span>
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                  s.active
                    ? s.color === 'emerald'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {s.active ? '감지됨' : '없음'}
              </span>
            </div>
          ))}
          <div className="pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-700">흡수 점수 (Absorption)</span>
              <span className="font-mono font-bold text-slate-900">{wyckoff.absorptionScore.toFixed(0)}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, wyckoff.absorptionScore))}%` }}
              />
            </div>
          </div>
          {wyckoff.description && (
            <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">{wyckoff.description}</p>
          )}
        </div>
      </SignalCard>

      {/* 3. 알고리즘 풋프린트 */}
      <SignalCard title="알고리즘 풋프린트" cardKey="algo" openHelp={openHelp} onToggleHelp={setOpenHelp} comment={cardComments?.algo}>
        <div className="space-y-2">
          {algoBars.map(b => {
            const isDominant = algoFootprint.dominantAlgo === b.label
            const pct = Math.max(0, Math.min(100, b.score))
            const isZero = b.score === 0
            return (
              <div key={b.label}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className={`${isDominant ? 'font-bold text-blue-700' : 'text-slate-700'}`}>
                    {b.label}
                    {isDominant && <span className="ml-1 text-[9px]">★</span>}
                  </span>
                  <span className={`font-mono ${isZero ? 'text-slate-400' : 'text-slate-600'}`}>
                    {isZero ? '신호 없음' : b.score.toFixed(0)}
                  </span>
                </div>
                <div
                  className={`w-full h-1.5 rounded-full overflow-hidden ${
                    isZero ? 'bg-slate-200/40 border border-dashed border-slate-300' : 'bg-slate-100'
                  }`}
                >
                  {!isZero && (
                    <div
                      className={`h-full transition-all ${isDominant ? 'bg-blue-600' : 'bg-slate-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  )}
                </div>
              </div>
            )
          })}
          <div className={`flex items-center gap-1 pt-1 text-xs font-semibold ${algoDirColor}`}>
            {algoDirIcon}
            <span>
              {algoFootprint.direction === 'accumulation'
                ? '매집 방향'
                : algoFootprint.direction === 'distribution'
                  ? '분배 방향'
                  : '중립'}
            </span>
          </div>
        </div>
      </SignalCard>

      {/* 4. 외국인·기관 */}
      <SignalCard title="외국인 · 기관" cardKey="flow" openHelp={openHelp} onToggleHelp={setOpenHelp} comment={cardComments?.flow}>
        {!isKR ? (
          <div className="text-[11px] text-slate-500 leading-relaxed">
            미국 주식은 투자자별 수급 데이터를 제공하지 않습니다.
          </div>
        ) : !investorFlow ? (
          <div className="text-[11px] text-slate-500 leading-relaxed">
            KIS 미연결 — 투자자별 수급 정보를 불러오려면 계좌를 연결하세요.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">시그널</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${flowSignalColor}`}>
                {flowSignalLabel}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[10px]">
              <FlowCell label="외인 1d" value={investorFlow.foreigner_net_today} />
              <FlowCell label="외인 5d" value={investorFlow.foreigner_net_5d} />
              <FlowCell label="외인 20d" value={investorFlow.foreigner_net_20d} />
              <FlowCell label="기관 1d" value={investorFlow.institution_net_today} />
              <FlowCell label="기관 5d" value={investorFlow.institution_net_5d} />
              <FlowCell label="기관 20d" value={investorFlow.institution_net_20d} />
            </div>
            <div className="text-[10px] text-slate-500 pt-1">
              신뢰도 <span className="font-mono font-bold text-slate-700">{investorFlow.confidence.toFixed(0)}</span>
            </div>
          </div>
        )}
      </SignalCard>
    </div>

    {/* 정교화 엔진 — 고급 분석 섹션 (옵션 필드가 하나라도 있을 때만 노출) */}
    {hasAdvanced && (
      <div className="mt-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">고급 분석 (정교화)</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {analysis.wyckoffPhase && (
            <div className="lg:col-span-2">
              <WyckoffPhaseTimeline phase={analysis.wyckoffPhase} />
            </div>
          )}
          {analysis.marketStructure && (
            <MarketStructureBadge structure={analysis.marketStructure} />
          )}
          {analysis.liquidity && (
            <LiquidityZonePanel liquidity={analysis.liquidity} />
          )}
          {analysis.traps && (
            <TrapWarningCard
              traps={analysis.traps}
              manipulationRiskScore={analysis.manipulationRiskScore}
            />
          )}
          {analysis.vsa && <VSASignalList vsa={analysis.vsa} />}
        </div>
      </div>
    )}
    </>
  )
}

function FlowCell({ label, value }: { label: string; value: number }) {
  const positive = value > 0
  const negative = value < 0
  const color = positive ? 'text-emerald-600' : negative ? 'text-rose-600' : 'text-slate-500'
  const display = formatNet(value)
  return (
    <div className="rounded-lg bg-slate-50 p-1.5 text-center">
      <div className="text-[9px] text-slate-500">{label}</div>
      <div className={`font-mono font-semibold text-[11px] ${color}`}>{display}</div>
    </div>
  )
}

function formatNet(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  if (abs >= 1_0000_0000) return `${sign}${(abs / 1_0000_0000).toFixed(1)}억`
  if (abs >= 1_0000) return `${sign}${(abs / 1_0000).toFixed(0)}만`
  return `${sign}${abs.toLocaleString()}`
}
