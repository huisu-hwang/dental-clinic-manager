'use client'

import { useState, useEffect } from 'react'
import { Crown, Loader2, Trophy } from 'lucide-react'
import { referralService } from '@/lib/referralService'

interface Props {
  clinicId: string
  refreshKey: number
}

interface RankRow {
  id: string
  patient_name: string
  chart_number: string | null
  count: number
}

export default function ReferrerRankingTab({ clinicId, refreshKey }: Props) {
  const [range, setRange] = useState<'month' | 'all'>('month')
  const [rows, setRows] = useState<RankRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    referralService.ranking(clinicId, range, 10)
      .then(d => { if (!cancelled) setRows(d) })
      .catch(e => { console.error(e); if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [clinicId, range, refreshKey])

  return (
    <div className="rounded-xl border border-[var(--at-border)] bg-white p-5 shadow-[var(--shadow-at-soft)]">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--at-accent-tag)] text-[var(--at-accent)]">
            <Trophy className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">소개왕 TOP 10</h2>
            <p className="text-xs text-[var(--at-text-secondary)]">병원에 환자분을 가장 많이 소개해주신 분들입니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--at-border)] bg-[var(--at-surface-alt)] p-1 text-xs">
          {(['month', 'all'] as const).map(v => (
            <button
              key={v}
              onClick={() => setRange(v)}
              className={`rounded-md px-3 py-1 font-medium transition ${
                range === v ? 'bg-white text-[var(--at-text-primary)] shadow-sm' : 'text-[var(--at-text-secondary)] hover:text-[var(--at-text-primary)]'
              }`}
            >
              {v === 'month' ? '이번 달' : '누적'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-[var(--at-text-weak)]">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="flex h-40 items-center justify-center text-sm text-[var(--at-text-weak)]">
          아직 소개 기록이 없습니다.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--at-border)]">
          {rows.map((r, i) => {
            const medal = i === 0 ? 'text-yellow-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-orange-400' : 'text-[var(--at-text-weak)]'
            return (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full bg-[var(--at-surface-alt)] text-sm font-semibold ${medal}`}>
                    {i < 3 ? <Crown className="h-4 w-4" /> : i + 1}
                  </span>
                  <div>
                    <div className="font-medium text-[var(--at-text-primary)]">{r.patient_name}</div>
                    <div className="text-xs text-[var(--at-text-weak)]">{r.chart_number ?? '차트 없음'}</div>
                  </div>
                </div>
                <span className="rounded-full bg-[var(--at-accent-tag)] px-3 py-1 text-sm font-semibold text-[var(--at-accent)]">
                  {r.count}건
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
