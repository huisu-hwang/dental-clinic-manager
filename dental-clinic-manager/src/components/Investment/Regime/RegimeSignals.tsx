'use client'

import { REGIME_COLOR, REGIME_EMOJI, REGIME_LABEL, REGIME_LABEL_KO, RegimeState } from './types'

interface Rule {
  name: string
  ok: boolean
  actual: string
  threshold: string
}

interface Thresholds {
  crisis_vix: number
  crisis_ret_20d: number
  bull_ret_20d: number
  bear_ret_20d: number
  bull_vol_ratio: number
  bear_vol_ratio: number
}

interface Signals {
  ret_20d: number | null
  vol_60d: number | null
  vol_median: number | null
  vix: number | null
  thresholds?: Thresholds
  matched_rule?: RegimeState
  rules?: Rule[]
}

interface Props {
  signals: Signals | null | undefined
  currentState: RegimeState
}

function fmtPct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(2)}%`
}

function fmtNum(v: number | null | undefined, digits = 4) {
  if (v == null || !isFinite(v)) return '—'
  return v.toFixed(digits)
}

export default function RegimeSignals({ signals, currentState }: Props) {
  if (!signals || signals.ret_20d == null) {
    return (
      <div className="rounded border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
        판단 근거 시그널은 다음 학습 이후 표시됩니다
      </div>
    )
  }

  const matched = (signals.matched_rule ?? currentState) as RegimeState

  return (
    <div className="space-y-3">
      {/* 입력 지표 카드 3개 */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border bg-gray-50 p-2">
          <div className="text-[10px] text-gray-500">20일 수익률</div>
          <div className={`text-base font-semibold ${(signals.ret_20d ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {fmtPct(signals.ret_20d)}
          </div>
        </div>
        <div className="rounded-md border bg-gray-50 p-2">
          <div className="text-[10px] text-gray-500">60일 변동성</div>
          <div className="text-base font-semibold text-gray-800">
            {fmtNum(signals.vol_60d)}
          </div>
          <div className="text-[10px] text-gray-400">중앙값 {fmtNum(signals.vol_median)}</div>
        </div>
        <div className="rounded-md border bg-gray-50 p-2">
          <div className="text-[10px] text-gray-500">VIX (공포 지수)</div>
          <div className={`text-base font-semibold ${(signals.vix ?? 0) > 30 ? 'text-red-600' : 'text-gray-800'}`}>
            {signals.vix?.toFixed(1) ?? '—'}
          </div>
        </div>
      </div>

      {/* 매칭된 규칙 표시 */}
      <div className="rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs">
          <span className="text-gray-600">최종 판단 규칙:</span>
          <span>{REGIME_EMOJI[matched]}</span>
          <span className="font-semibold" style={{ color: REGIME_COLOR[matched] }}>
            {REGIME_LABEL[matched]} ({REGIME_LABEL_KO[matched]})
          </span>
        </div>
        {signals.rules && signals.rules.length > 0 && (
          <ul className="space-y-1">
            {signals.rules.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className={r.ok ? 'text-emerald-600' : 'text-gray-400'}>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span className="flex-1">
                  <span className={r.ok ? 'font-medium text-gray-800' : 'text-gray-500'}>{r.name}</span>
                  <span className="text-gray-400"> — 실제 {r.actual} / 기준 {r.threshold}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 임계값 reference */}
      {signals.thresholds && (
        <details className="text-[11px] text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700">국면 분류 규칙 전체 보기</summary>
          <div className="mt-1.5 space-y-0.5 pl-3">
            <div>🔴 <b>Crisis</b>: VIX &gt; {signals.thresholds.crisis_vix} <b>OR</b> 20일 수익률 &lt; {(signals.thresholds.crisis_ret_20d * 100).toFixed(0)}%</div>
            <div>🟢 <b>Bull</b>: 20일 수익률 &gt; +{(signals.thresholds.bull_ret_20d * 100).toFixed(0)}% <b>AND</b> 60일 변동성 &lt; 중앙값×{signals.thresholds.bull_vol_ratio}</div>
            <div>🔵 <b>Bear</b>: 20일 수익률 &lt; {(signals.thresholds.bear_ret_20d * 100).toFixed(0)}% <b>AND</b> 60일 변동성 &lt; 중앙값×{signals.thresholds.bear_vol_ratio}</div>
            <div>🟡 <b>Sideways</b>: 위 3개 모두 미해당</div>
            <div className="mt-1 text-[10px] text-gray-400">우선순위: Crisis &gt; Bull/Bear &gt; Sideways</div>
          </div>
        </details>
      )}
    </div>
  )
}
