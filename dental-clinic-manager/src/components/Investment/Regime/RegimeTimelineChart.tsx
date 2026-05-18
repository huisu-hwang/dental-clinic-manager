'use client'

import { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceArea,
} from 'recharts'
import { REGIME_COLOR, REGIME_LABEL, REGIME_LABEL_KO, RegimeState } from './types'

interface HistoryRow {
  date: string
  state: RegimeState
  confidence: number
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
    })),
    [history]
  )

  if (history.length === 0) {
    return <div className="py-12 text-center text-sm text-gray-500">타임라인 데이터 없음</div>
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: '#64748b' }}
            interval={Math.max(1, Math.floor(chartData.length / 8))}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: '#64748b' }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.[0]) return null
              const p = payload[0].payload as { date: string; confidence: number; state: RegimeState }
              return (
                <div className="rounded border bg-white px-2 py-1 text-xs shadow">
                  <div className="font-medium">{p.date}</div>
                  <div style={{ color: REGIME_COLOR[p.state] }}>
                    {REGIME_LABEL[p.state]} ({REGIME_LABEL_KO[p.state]})
                  </div>
                  <div className="text-gray-500">신뢰도 {p.confidence}%</div>
                </div>
              )
            }}
          />
          {segments.map((seg, i) => (
            <ReferenceArea
              key={i}
              x1={seg.x1}
              x2={seg.x2}
              y1={0}
              y2={100}
              fill={REGIME_COLOR[seg.state]}
              fillOpacity={0.12}
              ifOverflow="hidden"
            />
          ))}
          <Area
            type="monotone"
            dataKey="confidence"
            stroke="#475569"
            strokeWidth={1.5}
            fill="#94a3b8"
            fillOpacity={0.15}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-600">
        {(['bull', 'sideways', 'bear', 'crisis'] as RegimeState[]).map(s => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: REGIME_COLOR[s], opacity: 0.5 }} />
            {REGIME_LABEL[s]} ({REGIME_LABEL_KO[s]})
          </span>
        ))}
      </div>
    </div>
  )
}
