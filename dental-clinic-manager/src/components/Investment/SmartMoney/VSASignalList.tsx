/**
 * VSASignalList — VSA(Volume Spread Analysis) effort vs result + 시그널 리스트
 */

'use client'

import { useState } from 'react'
import { Info, X, ChevronDown, ChevronUp } from 'lucide-react'
import type { VSAResult, VSASignalEntry } from '@/types/smartMoney'

const HELP = {
  title: 'VSA (거래량 분석)',
  body: "톰 윌리엄스의 Volume Spread Analysis — '노력(거래량) 대비 결과(가격)'의 부조화로 스마트머니의 의도 포착. No Demand(상승 양봉인데 거래량 부진 → 매수 동력 소진), No Supply(하락인데 거래량 고갈 → 공급 소진), Climax(거래량 폭증 + 긴 꼬리 → 반전 임박), Stopping Volume(매도 흡수).",
}

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

interface VSADef {
  full: string
  meaning: string
  bias: 'bull' | 'bear' | 'neutral'
}

const VSA_DEFS: Record<VSASignalEntry['type'], VSADef> = {
  'no-demand': {
    full: 'No Demand (수요 부재)',
    meaning: '상승 양봉이지만 거래량이 평소보다 부진 — 추격 매수가 약함. 상승 동력 소진, 단기 약세 전환 가능',
    bias: 'bear',
  },
  'no-supply': {
    full: 'No Supply (공급 부재)',
    meaning: '하락 음봉이지만 거래량이 평소보다 부진 — 매도 압력이 약함. 하락 동력 소진, 단기 강세 전환 가능',
    bias: 'bull',
  },
  'buying-climax': {
    full: 'Buying Climax (매수 클라이맥스)',
    meaning: '거래량 폭증 + 윗꼬리 긴 양봉 — 마지막 매수자의 추격 진입 직후 기관 분배. 고점 반전 임박',
    bias: 'bear',
  },
  'selling-climax': {
    full: 'Selling Climax (매도 클라이맥스)',
    meaning: '거래량 폭증 + 아랫꼬리 긴 음봉 — 공포 매도 절정 + 기관 흡수. 저점 반전 임박',
    bias: 'bull',
  },
  'stopping-volume': {
    full: 'Stopping Volume (멈춤 거래량)',
    meaning: '하락 중 갑자기 큰 거래량으로 하락이 멈춤 — 기관이 매도 물량을 흡수. 하락 추세 정지 신호',
    bias: 'bull',
  },
}

function confidenceBucket(c: number): { label: string; color: string } {
  if (c >= 80) return { label: '매우 강함', color: 'text-emerald-600' }
  if (c >= 60) return { label: '강함', color: 'text-emerald-500' }
  if (c >= 40) return { label: '보통', color: 'text-amber-500' }
  return { label: '약함', color: 'text-slate-500' }
}

export function VSASignalList({ vsa }: Props) {
  const [helpOpen, setHelpOpen] = useState(false)
  const [glossaryOpen, setGlossaryOpen] = useState(false)
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
    <div className="relative bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-slate-900">VSA 시그널</h3>
        <div className="flex items-center gap-1">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${effortBadge}`}>
            노력 vs 결과: {effortLabel}
          </span>
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

      {signals.length === 0 ? (
        <p className="text-[11px] text-slate-500 leading-relaxed py-2">VSA 시그널 미감지</p>
      ) : (
        <div className="space-y-1.5">
          {signals.map((s, i) => {
            const def = VSA_DEFS[s.type]
            const conf = confidenceBucket(s.confidence)
            return (
              <div
                key={`${s.type}-${s.barIndex}-${i}`}
                className="flex items-start justify-between gap-2 text-[11px]"
                title={`${def.full} — ${def.meaning} · 신뢰도 ${s.confidence.toFixed(0)}% (${conf.label})`}
              >
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <span
                    className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${VSA_TYPE_COLOR[s.type]}`}
                  >
                    {VSA_TYPE_LABEL[s.type]}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono" title="감지된 분봉의 인덱스 (0=가장 최근)">#{s.barIndex}</span>
                </div>
                <span className={`flex-shrink-0 font-mono text-[10px] font-bold ${conf.color}`}>
                  {s.confidence.toFixed(0)}%
                </span>
              </div>
            )
          })}
          {vsa.description && (
            <p className="text-[11px] text-slate-500 leading-relaxed pt-1 line-clamp-2 border-t border-slate-100">
              {vsa.description}
            </p>
          )}
        </div>
      )}

      {/* 용어 가이드 토글 */}
      <div className="mt-3 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setGlossaryOpen((o) => !o)}
          className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500 uppercase tracking-wide hover:text-slate-700"
        >
          <span>용어 가이드</span>
          {glossaryOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
        {glossaryOpen && (
          <div className="mt-2 space-y-1.5">
            {(Object.keys(VSA_DEFS) as VSASignalEntry['type'][]).map((k) => {
              const def = VSA_DEFS[k]
              return (
                <div key={k} className="flex items-start gap-2 text-[10.5px] leading-relaxed">
                  <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold ${VSA_TYPE_COLOR[k]}`}>
                    {VSA_TYPE_LABEL[k]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-700 font-medium">{def.full}</span>
                    <span className="text-slate-400 mx-1">·</span>
                    <span className="text-slate-500">{def.meaning}</span>
                  </div>
                </div>
              )
            })}
            <div className="pt-1.5 mt-1.5 border-t border-slate-100 space-y-1 text-[10.5px] leading-relaxed text-slate-500">
              <p>
                <span className="font-semibold text-slate-700">신뢰도 (%)</span> · 시그널 강도.
                <span className="ml-1">80↑ 매우 강함, 60↑ 강함, 40↑ 보통, 미만 약함.</span>
                평소 거래량 대비 편차·꼬리 비율·종가 위치를 합산해 산출.
              </p>
              <p>
                <span className="font-semibold text-slate-700">#N (Bar Index)</span> · 시그널이 감지된 분봉 번호. 0이 가장 최근 봉이며 숫자가 클수록 더 과거.
              </p>
              <p>
                <span className="font-semibold text-slate-700">노력 vs 결과</span> · 거래량(노력) 대비 가격 변동(결과)이 일치하는지의 종합 평가.
                강세=매수 동력 우세, 약세=매도 동력 우세, 중립=균형.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
