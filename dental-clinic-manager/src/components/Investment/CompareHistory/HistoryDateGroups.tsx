'use client'

/**
 * 백테스트 히스토리를 일자별로 그룹화하고 각 일자 안에 전략 × 종목 매트릭스로 표시.
 * 사용자가 "결과표를 날짜별로" 보길 원할 때 (특히 비교 페이지에서 한 번에 N개 실행한 경우 유용).
 */

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, CheckSquare, Square } from 'lucide-react'
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

const periodDays = (start: string, end: string): number | null => {
  if (!start || !end) return null
  const s = Date.parse(start)
  const e = Date.parse(end)
  if (Number.isNaN(s) || Number.isNaN(e)) return null
  return Math.max(0, Math.round((e - s) / 86_400_000))
}

const formatPeriod = (days: number | null): string => {
  if (days == null) return '-'
  if (days >= 365) {
    const years = days / 365
    return years % 1 < 0.05 ? `${Math.round(years)}년` : `${years.toFixed(1)}년`
  }
  if (days >= 30) return `${Math.round(days / 30)}개월`
  return `${days}일`
}

const formatDayHeader = (yyyymmdd: string): string => {
  // YYYY-MM-DD → "2026.05.05 (월)"
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  if (!y || !m || !d) return yyyymmdd
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()]
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${day})`
}

export default function HistoryDateGroups({ rows, strategies, selectedIds, onToggleSelected }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const strategyById = useMemo(() => {
    const m = new Map<string, StrategyOption>()
    for (const s of strategies) m.set(s.id, s)
    return m
  }, [strategies])

  // 일자별 그룹 + 그룹 내 전략·종목 unique 추출
  const groups = useMemo(() => {
    const map = new Map<string, BacktestRunRow[]>()
    for (const r of rows) {
      const day = (r.executed_at ?? '').slice(0, 10)
      if (!day) continue
      const arr = map.get(day) ?? []
      arr.push(r)
      map.set(day, arr)
    }
    return Array.from(map.entries())
      .map(([day, dayRows]) => {
        // 행 키: 전략 ID 또는 preset:<id>
        const rowKeyOf = (r: BacktestRunRow) =>
          r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`
        const rowLabelOf = (r: BacktestRunRow) => {
          if (r.strategy_id) {
            return strategyById.get(r.strategy_id)?.name
              ?? r.investment_strategies?.name
              ?? `전략 #${r.strategy_id.slice(0, 8)}`
          }
          return r.preset_name ?? `프리셋 #${r.preset_id ?? 'custom'}`
        }
        const colKeyOf = (r: BacktestRunRow) => `${r.market}:${r.ticker}`

        // unique 행/열 + 셀별 백테스트 목록
        const rowMap = new Map<string, { key: string; label: string; isPreset: boolean }>()
        const colMap = new Map<string, { key: string; market: 'KR' | 'US'; ticker: string }>()
        const cellMap = new Map<string, BacktestRunRow[]>()

        for (const r of dayRows) {
          const rk = rowKeyOf(r)
          const rl = rowLabelOf(r)
          const ck = colKeyOf(r)
          const cellKey = `${rk}::${ck}`
          if (!rowMap.has(rk)) {
            rowMap.set(rk, { key: rk, label: rl, isPreset: !r.strategy_id })
          }
          if (!colMap.has(ck)) colMap.set(ck, { key: ck, market: r.market, ticker: r.ticker })
          const list = cellMap.get(cellKey) ?? []
          list.push(r)
          cellMap.set(cellKey, list)
        }

        // 셀별로 가장 최근 백테스트가 맨 앞에 오도록 정렬
        for (const [k, list] of cellMap) {
          list.sort((a, b) => (a.executed_at > b.executed_at ? -1 : 1))
          cellMap.set(k, list)
        }

        // 행: 프리셋 먼저(가나다순) → 사용자 전략(가나다순)
        const rowList = Array.from(rowMap.values()).sort((a, b) => {
          if (a.isPreset !== b.isPreset) return a.isPreset ? -1 : 1
          return a.label.localeCompare(b.label, 'ko')
        })
        const colList = Array.from(colMap.values()).sort((a, b) => a.ticker.localeCompare(b.ticker))

        return { day, dayRows, rowList, colList, cellMap, rowKeyOf, colKeyOf }
      })
      .sort((a, b) => b.day.localeCompare(a.day)) // 최신 날짜 먼저
  }, [rows, strategyById])

  const toggleCollapse = (day: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(day)) next.delete(day)
      else next.add(day)
      return next
    })
  }

  if (groups.length === 0) return null

  return (
    <div className="space-y-3">
      {groups.map(({ day, dayRows, rowList, colList, cellMap }) => {
        const isCollapsed = collapsed.has(day)
        const selectedCount = dayRows.filter((r) => selectedIds.has(r.id)).length
        return (
          <div key={day} className="bg-white rounded-2xl border border-at-border shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => toggleCollapse(day)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-at-surface-alt transition-colors"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-at-text">{formatDayHeader(day)}</span>
                <span className="text-xs text-at-text-secondary">
                  {colList.length}종목 · {rowList.length}전략 · {dayRows.length}건
                  {selectedCount > 0 && <span className="ml-1 text-at-accent">· {selectedCount} 선택</span>}
                </span>
              </div>
              {isCollapsed ? <ChevronDown className="w-4 h-4 text-at-text-weak" /> : <ChevronUp className="w-4 h-4 text-at-text-weak" />}
            </button>

            {!isCollapsed && (
              <div className="overflow-x-auto border-t border-at-border">
                <table className="w-full text-xs">
                  <thead className="bg-at-surface-alt text-at-text-secondary">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium sticky left-0 bg-at-surface-alt z-10">전략</th>
                      {colList.map((c) => (
                        <th key={c.key} className="text-center px-3 py-2 font-medium whitespace-nowrap">
                          <span className={`text-[9px] px-1 py-0.5 rounded mr-1 font-bold ${c.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                            {c.market}
                          </span>
                          <span className="font-mono">{c.ticker}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-at-border">
                    {rowList.map((row) => (
                      <tr key={row.key} className="hover:bg-at-surface-alt/40">
                        <td className="px-3 py-2 sticky left-0 bg-white">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-at-text truncate max-w-[200px]" title={row.label}>{row.label}</p>
                            {row.isPreset && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-700 flex-shrink-0">프리셋</span>
                            )}
                          </div>
                        </td>
                        {colList.map((col) => {
                          const cells = cellMap.get(`${row.key}::${col.key}`)
                          if (!cells || cells.length === 0) {
                            return (
                              <td key={col.key} className="text-center px-3 py-2 text-at-text-weak">—</td>
                            )
                          }
                          // 가장 최근 백테스트를 선택 대상으로 사용 (정렬 후 첫 번째)
                          const latest = cells[0]
                          const days = periodDays(latest.start_date, latest.end_date)
                          const isSelected = selectedIds.has(latest.id)
                          return (
                            <td
                              key={col.key}
                              onClick={() => onToggleSelected(latest.id)}
                              className={`text-center px-3 py-2 cursor-pointer transition-colors ${
                                isSelected ? 'bg-at-accent-light' : 'hover:bg-at-surface-alt'
                              }`}
                              title={`${latest.start_date} ~ ${latest.end_date}${cells.length > 1 ? ` · ${cells.length}회 실행` : ''}`}
                            >
                              <div className="inline-flex items-center gap-1">
                                {isSelected ? (
                                  <CheckSquare className="w-3 h-3 text-at-accent flex-shrink-0" />
                                ) : (
                                  <Square className="w-3 h-3 text-at-text-weak flex-shrink-0" />
                                )}
                                <div>
                                  <div className="font-mono font-semibold text-at-text">
                                    {formatPeriod(days)}
                                  </div>
                                  {cells.length > 1 && (
                                    <div className="text-[10px] text-at-text-weak font-mono">
                                      ×{cells.length}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
