'use client'

import { Fragment, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import HistoryRowDetail from './HistoryRowDetail'
import type { BacktestRunRow } from './HistoryTab'

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

interface Props {
  rows: BacktestRunRow[]
  strategies: StrategyOption[]
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
}

type SortKey = 'executed_at' | 'total_return' | 'sharpe_ratio'
type SortDir = 'asc' | 'desc'

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso)
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return iso.slice(0, 10)
  }
}

const formatPct = (v: number | null | undefined): string => {
  if (v == null) return '-'
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}%`
}

const formatNum = (v: number | null | undefined, digits = 2): string => {
  if (v == null) return '-'
  return v.toFixed(digits)
}

export default function HistoryTable({ rows, strategies, selectedIds, onToggleSelected }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('executed_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const strategyById = useMemo(() => {
    const map = new Map<string, StrategyOption>()
    for (const s of strategies) map.set(s.id, s)
    return map
  }, [strategies])

  const sorted = useMemo(() => {
    const cp = [...rows]
    cp.sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number | string
      const bv = (b[sortKey] ?? 0) as number | string
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return cp
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 inline-block opacity-50" aria-hidden="true" />
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 inline-block" aria-hidden="true" />
      : <ArrowDown className="w-3 h-3 inline-block" aria-hidden="true" />
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-at-border bg-white">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-at-surface-alt">
          <tr>
            <th className="px-3 py-2 w-8" />
            <th
              className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider cursor-pointer"
              onClick={() => toggleSort('executed_at')}
            >
              날짜 {sortIcon('executed_at')}
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">전략</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">종목</th>
            <th
              className="px-3 py-2 text-right text-xs font-medium text-at-text-weak uppercase tracking-wider cursor-pointer"
              onClick={() => toggleSort('total_return')}
            >
              수익률 {sortIcon('total_return')}
            </th>
            <th
              className="px-3 py-2 text-right text-xs font-medium text-at-text-weak uppercase tracking-wider cursor-pointer"
              onClick={() => toggleSort('sharpe_ratio')}
            >
              Sharpe {sortIcon('sharpe_ratio')}
            </th>
            <th className="px-3 py-2 w-8" aria-label="펼침" />
          </tr>
        </thead>
        <tbody className="divide-y divide-at-border">
          {sorted.map((row) => {
            const strat = row.strategy_id ? strategyById.get(row.strategy_id) : null
            const isExp = expanded.has(row.id)
            const isSel = selectedIds.has(row.id)
            const ret = row.total_return ?? null
            return (
              <Fragment key={row.id}>
                <tr className={`hover:bg-at-surface-alt transition-colors ${isExp ? 'bg-at-surface-alt' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggleSelected(row.id)}
                      aria-label={`${row.id} 선택`}
                      className="rounded border-at-border text-at-accent focus:ring-at-accent"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-at-text">{formatDate(row.executed_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span>{strat?.name ?? '-'}</span>
                      {strat?.strategy_type === 'rl_portfolio' && (
                        <span className="px-1.5 py-0.5 text-xs rounded-full bg-at-accent-light text-at-accent">RL</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {row.ticker === 'PORTFOLIO' ? (
                      <span className="text-at-text-secondary">Portfolio</span>
                    ) : row.ticker}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-medium ${
                    ret == null ? '' : ret >= 0 ? 'text-at-success' : 'text-at-error'
                  }`}>
                    {formatPct(ret)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-at-text">{formatNum(row.sharpe_ratio)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => toggleExpanded(row.id)}
                      aria-label={isExp ? '접기' : '펼치기'}
                      title={isExp ? '접기' : '펼치기'}
                      className="p-1 rounded-xl hover:bg-at-surface-alt"
                    >
                      {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
                {isExp && (
                  <tr className="bg-at-surface-alt">
                    <td colSpan={7} className="px-3 py-3">
                      <HistoryRowDetail row={row} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
