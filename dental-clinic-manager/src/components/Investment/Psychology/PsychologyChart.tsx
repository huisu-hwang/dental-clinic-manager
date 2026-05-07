'use client'

import { LineChart, Line, XAxis, YAxis, ReferenceDot, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
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
}

export default function PsychologyChart({ candles, markers }: Props) {
  const data = candles.map((c, i) => ({ idx: i, close: c.close, ts: c.ts.slice(11, 16) }))

  return (
    <div className="rounded-xl border bg-white p-3">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="ts" tick={{ fontSize: 10 }} interval={9} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={48} />
          <Tooltip />
          <Line type="monotone" dataKey="close" stroke="#0ea5e9" dot={false} strokeWidth={1.5} />
          {markers.map((m, i) => {
            const c = candles[m.candle_index]
            if (!c) return null
            return (
              <ReferenceDot
                key={i}
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
