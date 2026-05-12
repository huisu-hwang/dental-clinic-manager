'use client'

import { LineChart, Line, XAxis, YAxis, ReferenceDot, ReferenceLine, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import type { MinuteCandle, PsychologyMarker } from '@/types/psychology'

const MARKER_COLOR: Record<string, string> = {
  panic_sell: '#ef4444',
  fomo_entry: '#f59e0b',
  accumulation: '#10b981',
  distribution: '#6366f1',
  capitulation: '#7c3aed',
  indecision: '#9ca3af',
}

interface Props {
  candles: MinuteCandle[]
  markers: PsychologyMarker[]
  /** 분봉별 공포·탐욕 지수 (0~100). candles 와 같은 길이. */
  fearGreed?: number[]
}

export default function PsychologyChart({ candles, markers, fearGreed }: Props) {
  const data = candles.map((c, i) => ({
    idx: i,
    close: c.close,
    ts: c.ts.slice(11, 16),
    fg: typeof fearGreed?.[i] === 'number' && !Number.isNaN(fearGreed[i])
      ? Math.round(fearGreed[i])
      : null,
  }))

  const hasFg = !!fearGreed && fearGreed.some(v => typeof v === 'number' && !Number.isNaN(v))

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-at-border p-5">
      <h3 className="text-sm font-semibold text-at-text mb-3">분봉 차트 · 심리 마커{hasFg && ' · 공포·탐욕 지수'}</h3>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="ts" tick={{ fontSize: 10, fill: '#64748b' }} interval={9} />
          {/* 좌측 Y축: 종가 */}
          <YAxis
            yAxisId="price"
            domain={['auto', 'auto']}
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={56}
            label={{ value: '가격', angle: -90, position: 'insideLeft', offset: 8, fontSize: 10, fill: '#94a3b8' }}
          />
          {/* 우측 Y축: 공포·탐욕 지수 (0~100, 고정 도메인) */}
          {hasFg && (
            <YAxis
              yAxisId="fg"
              orientation="right"
              domain={[0, 100]}
              ticks={[0, 20, 50, 80, 100]}
              tick={{ fontSize: 10, fill: '#a855f7' }}
              width={36}
              label={{ value: '지수', angle: 90, position: 'insideRight', offset: 4, fontSize: 10, fill: '#a855f7' }}
            />
          )}
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e2e8f0',
              fontSize: 12,
            }}
            formatter={(value, name) => {
              if (name === '공포·탐욕 지수') return [value, name]
              return [value, name]
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} verticalAlign="top" height={20} />
          {/* 극공포(20)/극탐욕(80) 가이드선 — 우측 축 기준 */}
          {hasFg && (
            <>
              <ReferenceLine yAxisId="fg" y={20} stroke="#3b82f6" strokeDasharray="3 3" strokeOpacity={0.4} />
              <ReferenceLine yAxisId="fg" y={80} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.4} />
            </>
          )}
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="close"
            name="종가"
            stroke="#0ea5e9"
            dot={false}
            strokeWidth={1.5}
          />
          {hasFg && (
            <Line
              yAxisId="fg"
              type="monotone"
              dataKey="fg"
              name="공포·탐욕 지수"
              stroke="#a855f7"
              dot={false}
              strokeWidth={1.5}
              strokeDasharray="2 0"
              connectNulls
            />
          )}
          {markers.map((m, i) => {
            const c = candles[m.candle_index]
            if (!c) return null
            return (
              <ReferenceDot
                key={i}
                yAxisId="price"
                x={c.ts.slice(11, 16)}
                y={c.close}
                r={6}
                fill={MARKER_COLOR[m.kind] ?? '#374151'}
                stroke="#fff"
                strokeWidth={1.5}
                label={{ value: m.label, position: 'top', fontSize: 10, fill: '#374151' }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
