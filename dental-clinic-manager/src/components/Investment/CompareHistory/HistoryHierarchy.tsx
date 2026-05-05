'use client'

/**
 * 백테스트 히스토리 3단계 drill-down 네비게이션:
 *  1) 날짜 리스트 — 최근→과거, 그 날의 세션 수·평균 수익률 표시
 *  2) 시간 리스트 — 같은 날짜 안에서 인접 분 cluster를 한 세션으로 묶어 시간순 표시
 *  3) 세션 결과 — 전략(행) × 종목(열) 매트릭스 + 셀 클릭 시 비교 selection
 */

import { useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, BarChart3, CheckSquare, Square } from 'lucide-react'
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

interface SessionGroup {
  /** 세션 id (가장 이른 timestamp 기반) */
  id: string
  startedAt: string // ISO
  rows: BacktestRunRow[]
}

interface DayGroup {
  day: string // YYYY-MM-DD
  sessions: SessionGroup[]
  totalRows: number
  avgReturn: number
}

const SESSION_GAP_MS = 60 * 1000 // 60초 이내 인접 row는 같은 세션

const formatDayHeader = (yyyymmdd: string): string => {
  const [y, m, d] = yyyymmdd.split('-').map(Number)
  if (!y || !m || !d) return yyyymmdd
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = ['일', '월', '화', '수', '목', '금', '토'][dt.getUTCDay()]
  return `${y}.${String(m).padStart(2, '0')}.${String(d).padStart(2, '0')} (${day})`
}

const formatTime = (iso: string): string => {
  try {
    const d = new Date(iso)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
  } catch {
    return iso.slice(11, 19)
  }
}

const formatPct = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '-'
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}%`
}

const formatNum = (v: number | null | undefined, digits = 2): string => {
  if (v == null) return '-'
  return v.toFixed(digits)
}

const colorPnl = (v: number | null | undefined) => {
  if (v == null) return 'text-slate-500'
  return v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-slate-500'
}

const bgPnl = (v: number | null | undefined) => {
  if (v == null) return 'bg-slate-50'
  return v > 0 ? 'bg-red-50' : v < 0 ? 'bg-blue-50' : 'bg-slate-50'
}

export default function HistoryHierarchy({ rows, strategies, selectedIds, onToggleSelected }: Props) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  const strategyById = useMemo(() => {
    const m = new Map<string, StrategyOption>()
    for (const s of strategies) m.set(s.id, s)
    return m
  }, [strategies])

  // 일자 + 세션 cluster 그룹핑
  const dayGroups: DayGroup[] = useMemo(() => {
    const byDay = new Map<string, BacktestRunRow[]>()
    for (const r of rows) {
      const day = (r.executed_at ?? '').slice(0, 10)
      if (!day) continue
      const arr = byDay.get(day) ?? []
      arr.push(r)
      byDay.set(day, arr)
    }

    const result: DayGroup[] = []
    for (const [day, dayRows] of byDay) {
      // executed_at 오름차순 정렬 후 인접 row 간 60초 이내면 같은 세션
      const sorted = [...dayRows].sort((a, b) => a.executed_at.localeCompare(b.executed_at))
      const sessions: SessionGroup[] = []
      let bucket: BacktestRunRow[] = []
      let lastTs = 0
      for (const r of sorted) {
        const ts = new Date(r.executed_at).getTime()
        if (bucket.length === 0 || ts - lastTs <= SESSION_GAP_MS) {
          bucket.push(r)
        } else {
          sessions.push({ id: bucket[0].id + ':' + bucket[0].executed_at, startedAt: bucket[0].executed_at, rows: bucket })
          bucket = [r]
        }
        lastTs = ts
      }
      if (bucket.length > 0) {
        sessions.push({ id: bucket[0].id + ':' + bucket[0].executed_at, startedAt: bucket[0].executed_at, rows: bucket })
      }

      // 최신 세션이 위로
      sessions.reverse()

      const returns = dayRows.map((r) => Number(r.total_return ?? 0))
      const avgReturn = returns.length > 0 ? returns.reduce((s, v) => s + v, 0) / returns.length : 0

      result.push({ day, sessions, totalRows: dayRows.length, avgReturn })
    }
    return result.sort((a, b) => b.day.localeCompare(a.day))
  }, [rows])

  // ========= Level 3: 세션 결과 매트릭스 =========
  if (selectedDay && selectedSessionId) {
    const day = dayGroups.find((d) => d.day === selectedDay)
    const session = day?.sessions.find((s) => s.id === selectedSessionId)
    if (!session) {
      return <Backable onBack={() => setSelectedSessionId(null)} label="세션을 찾을 수 없음" />
    }
    return (
      <SessionResultView
        day={selectedDay}
        session={session}
        strategyById={strategyById}
        selectedIds={selectedIds}
        onToggleSelected={onToggleSelected}
        onBack={() => setSelectedSessionId(null)}
      />
    )
  }

  // ========= Level 2: 시간 리스트 =========
  if (selectedDay) {
    const day = dayGroups.find((d) => d.day === selectedDay)
    if (!day) {
      return <Backable onBack={() => setSelectedDay(null)} label="날짜를 찾을 수 없음" />
    }
    return (
      <div className="space-y-3">
        <button
          onClick={() => setSelectedDay(null)}
          className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text"
        >
          <ArrowLeft className="w-4 h-4" />
          날짜 목록
        </button>
        <div>
          <h3 className="text-base font-semibold text-at-text">{formatDayHeader(day.day)}</h3>
          <p className="text-xs text-at-text-secondary mt-0.5">총 {day.totalRows}건 · {day.sessions.length}회 실행</p>
        </div>
        <div className="space-y-2">
          {day.sessions.map((s, idx) => {
            const tickers = new Set(s.rows.map((r) => r.ticker))
            const strats = new Set(s.rows.map((r) => r.strategy_id ?? `preset:${r.preset_id ?? 'custom'}`))
            const returns = s.rows.map((r) => Number(r.total_return ?? 0))
            const avg = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0
            const best = returns.length > 0 ? Math.max(...returns) : 0
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSessionId(s.id)}
                className="w-full text-left rounded-xl border border-at-border bg-white px-4 py-3 hover:border-at-accent transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-at-text">
                        세션 #{day.sessions.length - idx} · {formatTime(s.startedAt)}
                      </span>
                      <span className="text-[11px] text-at-text-secondary">
                        {strats.size}전략 × {tickers.size}종목 = {s.rows.length}건
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-[11px]">
                      <span className={`font-mono ${colorPnl(avg)}`}>평균 {formatPct(avg)}</span>
                      <span className={`font-mono ${colorPnl(best)}`}>최고 {formatPct(best)}</span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-at-text-weak flex-shrink-0" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ========= Level 1: 날짜 리스트 =========
  if (dayGroups.length === 0) return null
  return (
    <div className="space-y-2">
      <p className="text-xs text-at-text-secondary">
        총 {rows.length}건 · {dayGroups.length}일자
      </p>
      {dayGroups.map((d) => (
        <button
          key={d.day}
          onClick={() => setSelectedDay(d.day)}
          className="w-full text-left rounded-xl border border-at-border bg-white px-4 py-3 hover:border-at-accent transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-at-text">{formatDayHeader(d.day)}</p>
              <p className="text-[11px] text-at-text-secondary mt-0.5">
                {d.sessions.length}회 실행 · 총 {d.totalRows}건 · 평균 {' '}
                <span className={`font-mono ${colorPnl(d.avgReturn)}`}>{formatPct(d.avgReturn)}</span>
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-at-text-weak flex-shrink-0" />
          </div>
        </button>
      ))}
    </div>
  )
}

function Backable({ onBack, label }: { onBack: () => void; label: string }) {
  return (
    <div className="space-y-3">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text">
        <ArrowLeft className="w-4 h-4" />
        뒤로
      </button>
      <p className="text-sm text-at-text-secondary">{label}</p>
    </div>
  )
}

function SessionResultView({
  day,
  session,
  strategyById,
  selectedIds,
  onToggleSelected,
  onBack,
}: {
  day: string
  session: SessionGroup
  strategyById: Map<string, StrategyOption>
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
  onBack: () => void
}) {
  const [sortKey, setSortKey] = useState<'total_return' | 'sharpe_ratio' | 'win_rate' | 'max_drawdown' | 'total_trades'>('total_return')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // 매트릭스 + 정렬된 평면 표 둘 다 렌더링
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

  const matrix = useMemo(() => {
    const rowMap = new Map<string, { key: string; label: string; bestReturn: number; isPreset: boolean }>()
    const colMap = new Map<string, { key: string; market: 'KR' | 'US'; ticker: string }>()
    const cellMap = new Map<string, BacktestRunRow>()
    for (const r of session.rows) {
      const rk = rowKeyOf(r)
      const rl = rowLabelOf(r)
      const ck = colKeyOf(r)
      const tr = Number(r.total_return ?? -Infinity)
      const exists = rowMap.get(rk)
      if (!exists || tr > exists.bestReturn) {
        rowMap.set(rk, { key: rk, label: rl, bestReturn: tr, isPreset: !r.strategy_id })
      }
      if (!colMap.has(ck)) colMap.set(ck, { key: ck, market: r.market, ticker: r.ticker })
      const cell = cellMap.get(`${rk}::${ck}`)
      if (!cell || r.executed_at > cell.executed_at) cellMap.set(`${rk}::${ck}`, r)
    }
    return {
      rowList: Array.from(rowMap.values()).sort((a, b) => b.bestReturn - a.bestReturn),
      colList: Array.from(colMap.values()).sort((a, b) => a.ticker.localeCompare(b.ticker)),
      cellMap,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session])

  const sortedFlat = useMemo(() => {
    const cp = [...session.rows]
    cp.sort((a, b) => {
      const av = (a[sortKey] ?? -Infinity) as number
      const bv = (b[sortKey] ?? -Infinity) as number
      if (av === bv) return 0
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return cp
  }, [session.rows, sortKey, sortDir])

  const toggleSort = (k: typeof sortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(k); setSortDir('desc') }
  }

  const tickers = new Set(session.rows.map((r) => r.ticker))
  const strats = new Set(session.rows.map((r) => rowKeyOf(r)))

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm text-at-text-secondary hover:text-at-text">
        <ArrowLeft className="w-4 h-4" />
        세션 목록
      </button>

      <div>
        <h3 className="text-base font-semibold text-at-text">
          {formatDayHeader(day)} {formatTime(session.startedAt)} 세션
        </h3>
        <p className="text-xs text-at-text-secondary mt-0.5">
          {strats.size}전략 × {tickers.size}종목 = {session.rows.length}건 백테스트
        </p>
      </div>

      {/* 매트릭스 */}
      <div className="bg-white rounded-2xl border border-at-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-at-border flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-at-accent" />
          <h4 className="text-sm font-semibold text-at-text">결과 매트릭스</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-at-surface-alt text-at-text-secondary">
              <tr>
                <th className="text-left px-3 py-2 font-medium sticky left-0 bg-at-surface-alt z-10">전략</th>
                {matrix.colList.map((c) => (
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
              {matrix.rowList.map((row) => (
                <tr key={row.key} className="hover:bg-at-surface-alt/40">
                  <td className="px-3 py-2 sticky left-0 bg-white">
                    <div className="flex items-center gap-1.5">
                      <p className="font-medium text-at-text truncate max-w-[200px]" title={row.label}>{row.label}</p>
                      {row.isPreset && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-700 flex-shrink-0">프리셋</span>
                      )}
                    </div>
                  </td>
                  {matrix.colList.map((col) => {
                    const cell = matrix.cellMap.get(`${row.key}::${col.key}`)
                    if (!cell) return <td key={col.key} className="text-center px-3 py-2 text-at-text-weak">—</td>
                    const isSelected = selectedIds.has(cell.id)
                    return (
                      <td
                        key={col.key}
                        onClick={() => onToggleSelected(cell.id)}
                        className={`text-center px-3 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-at-accent-light' : 'hover:bg-at-surface-alt'}`}
                      >
                        <div className="inline-flex items-center gap-1">
                          {isSelected ? (
                            <CheckSquare className="w-3 h-3 text-at-accent flex-shrink-0" />
                          ) : (
                            <Square className="w-3 h-3 text-at-text-weak flex-shrink-0" />
                          )}
                          <div>
                            <div className={`font-mono font-semibold ${colorPnl(cell.total_return)}`}>{formatPct(cell.total_return)}</div>
                            <div className="text-[10px] text-at-text-weak font-mono">Sh {formatNum(cell.sharpe_ratio)}</div>
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
      </div>

      {/* 정렬된 평면 결과 표 */}
      <div className="bg-white rounded-2xl border border-at-border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-at-border flex items-center justify-between gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-at-text">상세 결과 ({sortedFlat.length}건)</h4>
          <span className="text-[11px] text-at-text-secondary">
            {sortKey === 'total_return' ? '수익률' : sortKey === 'sharpe_ratio' ? 'Sharpe' : sortKey === 'win_rate' ? '승률' : sortKey === 'max_drawdown' ? 'MDD' : '거래수'} 기준 {sortDir === 'desc' ? '내림차순' : '오름차순'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-at-surface-alt text-at-text-secondary">
              <tr>
                <th className="text-left px-3 py-2 font-medium">선택</th>
                <th className="text-left px-3 py-2 font-medium">전략</th>
                <th className="text-left px-3 py-2 font-medium">종목</th>
                <SortHeader label="수익률" k="total_return" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortHeader label="Sharpe" k="sharpe_ratio" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortHeader label="MDD" k="max_drawdown" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortHeader label="승률" k="win_rate" current={sortKey} dir={sortDir} onClick={toggleSort} />
                <SortHeader label="거래수" k="total_trades" current={sortKey} dir={sortDir} onClick={toggleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-at-border">
              {sortedFlat.map((r) => {
                const isSelected = selectedIds.has(r.id)
                const stratLabel = rowLabelOf(r)
                return (
                  <tr
                    key={r.id}
                    className={`cursor-pointer ${isSelected ? 'bg-at-accent-light' : 'hover:bg-at-surface-alt/50'}`}
                    onClick={() => onToggleSelected(r.id)}
                  >
                    <td className="px-3 py-2">
                      {isSelected ? <CheckSquare className="w-3.5 h-3.5 text-at-accent" /> : <Square className="w-3.5 h-3.5 text-at-text-weak" />}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium text-at-text">{stratLabel}</span>
                      {!r.strategy_id && <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-purple-50 text-purple-700">프리셋</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[9px] px-1 py-0.5 rounded mr-1 font-bold ${r.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{r.market}</span>
                      <span className="font-mono">{r.ticker}</span>
                    </td>
                    <td className={`text-right px-3 py-2 font-mono font-semibold ${bgPnl(r.total_return)} ${colorPnl(r.total_return)}`}>{formatPct(r.total_return)}</td>
                    <td className="text-right px-3 py-2 font-mono">{formatNum(r.sharpe_ratio)}</td>
                    <td className="text-right px-3 py-2 font-mono text-blue-600">{formatPct(r.max_drawdown != null ? -Math.abs(r.max_drawdown) : null)}</td>
                    <td className="text-right px-3 py-2 font-mono">{r.win_rate != null ? `${(r.win_rate * 100).toFixed(0)}%` : '-'}</td>
                    <td className="text-right px-3 py-2 font-mono">{r.total_trades ?? '-'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SortHeader({
  label, k, current, dir, onClick,
}: {
  label: string
  k: 'total_return' | 'sharpe_ratio' | 'win_rate' | 'max_drawdown' | 'total_trades'
  current: string
  dir: 'asc' | 'desc'
  onClick: (k: 'total_return' | 'sharpe_ratio' | 'win_rate' | 'max_drawdown' | 'total_trades') => void
}) {
  const active = current === k
  return (
    <th
      className={`text-right px-3 py-2 font-medium cursor-pointer select-none ${active ? 'text-at-accent' : ''}`}
      onClick={() => onClick(k)}
    >
      {label}{active && (dir === 'desc' ? ' ▼' : ' ▲')}
    </th>
  )
}
