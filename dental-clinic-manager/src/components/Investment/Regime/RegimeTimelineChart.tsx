'use client'

import { useMemo } from 'react'
import {
  ComposedChart, Line, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceArea,
} from 'recharts'
import { REGIME_COLOR, REGIME_LABEL, REGIME_LABEL_KO, RegimeState } from './types'

interface HistoryRow {
  date: string
  state: RegimeState
  confidence: number
  close?: number | null
}

interface Props {
  history: HistoryRow[]
}

export default function RegimeTimelineChart({ history }: Props) {
  // 같은 state 가 연속되는 구간을 합쳐서 ReferenceArea segment 로
  const segments = useMemo(() => {
    if (history.length === 0) return []
    const out: { x1: string; x2: string; state: RegimeState }[] = []
    let segStart = history[0]!.date
    let segState = history[0]!.state
    for (let i = 1; i < history.length; i++) {
      const row = history[i]!
      if (row.state !== segState) {
        out.push({ x1: segStart, x2: history[i - 1]!.date, state: segState })
        segStart = row.date
        segState = row.state
      }
    }
    out.push({ x1: segStart, x2: history[history.length - 1]!.date, state: segState })
    return out
  }, [history])

  const chartData = useMemo(
    () => history.map(h => ({
      date: h.date,
      confidence: Math.round((h.confidence ?? 0) * 100),
      state: h.state,
      close: h.close ?? null,
    })),
    [history]
  )

  const hasPrice = useMemo(() => chartData.some(d => d.close != null), [chartData])

  // 가격 도메인 — padding 5%
  const priceDomain = useMemo<[number | string, number | string]>(() => {
    if (!hasPrice) return [0, 0]
    const vals = chartData.map(d => d.close).filter((v): v is number => v != null)
    if (vals.length === 0) return [0, 0]
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const pad = (max - min) * 0.05 || max * 0.01
    return [Math.floor(min - pad), Math.ceil(max + pad)]
  }, [chartData, hasPrice])

  if (history.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-500">타임라인 데이터 없음</div>
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={chartData} margin={{ top: 8, right: hasPrice ? 50 : 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#64748b' }}
            interval={Math.max(1, Math.floor(chartData.length / 8))}
          />
          {/* 왼쪽 Y축 — 신뢰도 (%) */}
          <YAxis
            yAxisId="conf"
            orientation="left"
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={(v) => `${v}%`}
            width={42}
          />
          {/* 오른쪽 Y축 — 가격 (있을 때만) */}
          {hasPrice && (
            <YAxis
              yAxisId="price"
              orientation="right"
              domain={priceDomain}
              tick={{ fontSize: 10, fill: '#0f172a' }}
              tickFormatter={(v) => typeof v === 'number' ? v.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : v}
              width={50}
            />
          )}
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = payload[0].payload as { date: string; confidence: number; state: RegimeState; close: number | null }
              return (
                <div className="rounded border bg-white px-2 py-1 text-xs shadow">
                  <div className="font-medium">{p.date}</div>
                  <div style={{ color: REGIME_COLOR[p.state] }}>
                    {REGIME_LABEL[p.state]} ({REGIME_LABEL_KO[p.state]})
                  </div>
                  <div className="text-gray-500">신뢰도 {p.confidence}%</div>
                  {p.close != null && (
                    <div className="text-gray-700">종가 {p.close.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</div>
                  )}
                </div>
              )
            }}
          />
          {segments.map((seg, i) => (
            <ReferenceArea
              key={i}
              yAxisId="conf"
              x1={seg.x1}
              x2={seg.x2}
              y1={0}
              y2={100}
              fill={REGIME_COLOR[seg.state]}
              fillOpacity={0.12}
              ifOverflow="hidden"
            />
          ))}
          {/* 신뢰도 area (배경에 깔린 회색 라인) */}
          <Area
            yAxisId="conf"
            type="monotone"
            dataKey="confidence"
            stroke="#94a3b8"
            strokeWidth={1}
            fill="#94a3b8"
            fillOpacity={0.08}
            isAnimationActive={false}
          />
          {/* 가격 라인 (전경) — 있을 때만 */}
          {hasPrice && (
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="close"
              stroke="#0f172a"
              strokeWidth={1.8}
              dot={false}
              connectNulls
              isAnimationActive={false}
              name="종가"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-gray-600">
        {(['bull', 'sideways', 'bear', 'crisis'] as RegimeState[]).map(s => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: REGIME_COLOR[s], opacity: 0.5 }} />
            {REGIME_LABEL[s]} ({REGIME_LABEL_KO[s]})
          </span>
        ))}
        {hasPrice && (
          <>
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="inline-block h-[2px] w-4" style={{ background: '#0f172a' }} />
              종가 (우축)
            </span>
            <span className="inline-flex items-center gap-1 text-gray-400">
              <span className="inline-block h-[2px] w-4" style={{ background: '#94a3b8' }} />
              신뢰도 (좌축)
            </span>
          </>
        )}
      </div>
      {!hasPrice && (
        <p className="mt-1 text-[11px] text-gray-400">
          가격 라인은 다음 일배치(KST 20:30) 이후 표시됩니다
        </p>
      )}
    </div>
  )
}
