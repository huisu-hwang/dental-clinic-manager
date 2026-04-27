'use client'

/**
 * 전략 부합 종목 스크리너 — 다중 전략 동시 스캔.
 *
 * 사용자가 전략(저장 또는 프리셋) 여러 개를 선택하고 기준일/종목 풀을 정하면,
 * 그 시점에 매수 조건을 충족한 종목들을 전략별로 표시.
 *
 * 백그라운드 스캔: ScannerContext를 통해 batch API를 청크 단위로 호출.
 * 사용자가 다른 메뉴로 이동해도 진행률이 floating 위젯으로 표시됨.
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { Search, Loader2, AlertCircle, Sparkles, User, X, CheckCircle2, ChevronDown, ChevronRight, Info, Zap } from 'lucide-react'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import PresetDetailView from '@/components/Investment/PresetDetailView'
import { getUniverse, type UniverseId } from '@/lib/screenerUniverses'
import { useScanner, type StrategyPayload } from '@/contexts/ScannerContext'
import type { InvestmentStrategy, ConditionGroup, IndicatorConfig } from '@/types/investment'

const DAYTRADING_PRESET_IDS = new Set(['day-vwap-bounce', 'day-orb-breakout', 'day-closing-pressure'])
const MAX_STRATEGIES = 10

interface SelectableItem {
  key: string  // 'user:<id>' or 'preset:<id>'
  source: 'user' | 'preset'
  name: string
  description?: string
  indicatorCount: number
  strategyId?: string
  preset?: { name: string; indicators: IndicatorConfig[]; buyConditions: ConditionGroup }
}

const UNIVERSE_OPTIONS: { id: UniverseId; label: string; eta: string; desc: string }[] = [
  { id: 'KR_TOP', label: '국내 시총 상위', eta: '~30초', desc: '국내 70개 종목 (기본)' },
  { id: 'US_TOP', label: '미국 시총 상위', eta: '~30초', desc: '미국 70개 종목' },
  { id: 'KR_ALL', label: '국내 전체', eta: '~1.5분', desc: '국내 약 230개' },
  { id: 'US_ALL', label: '미국 전체', eta: '~1분', desc: '미국 약 100개' },
  { id: 'ALL', label: '전체 (KR + US)', eta: '~2.5분', desc: '국내 + 미국 약 328개' },
]

export default function ScreenerContent() {
  const { job, startScan, cancelScan } = useScanner()

  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [loadingStrategies, setLoadingStrategies] = useState(true)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [universe, setUniverse] = useState<UniverseId>('KR_TOP')
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [realtime, setRealtime] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detailPresetId, setDetailPresetId] = useState<string | null>(null)
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set())
  const [collapsedStrategies, setCollapsedStrategies] = useState<Set<string>>(new Set())

  const loadStrategies = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      if (json.data) {
        const swing = (json.data as InvestmentStrategy[]).filter(s => !s.mode || s.mode === 'swing')
        setStrategies(swing)
      }
    } catch {
      console.error('전략 목록 조회 실패')
    } finally {
      setLoadingStrategies(false)
    }
  }, [])

  useEffect(() => { loadStrategies() }, [loadStrategies])

  const userItems: SelectableItem[] = strategies.map(s => ({
    key: `user:${s.id}`,
    source: 'user',
    name: s.name,
    description: s.description || undefined,
    indicatorCount: Array.isArray(s.indicators) ? s.indicators.length : 0,
    strategyId: s.id,
  }))

  const presetItems: SelectableItem[] = PRESET_STRATEGIES
    .filter(p => !DAYTRADING_PRESET_IDS.has(p.id))
    .map(p => ({
      key: `preset:${p.id}`,
      source: 'preset',
      name: p.name,
      description: p.description,
      indicatorCount: p.indicators.length,
      preset: { name: p.name, indicators: p.indicators, buyConditions: p.buyConditions },
    }))

  const allItems = [...userItems, ...presetItems]

  const toggleStrategy = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else if (next.size < MAX_STRATEGIES) {
        next.add(key)
      } else {
        alert(`한 번에 최대 ${MAX_STRATEGIES}개 전략까지 동시 스캔 가능합니다.`)
      }
      return next
    })
  }

  const isScanning = job?.status === 'scanning'

  const runScreener = async () => {
    if (selectedKeys.size === 0) {
      setError('전략을 1개 이상 선택해주세요')
      return
    }
    setError(null)

    const selected = Array.from(selectedKeys)
      .map(k => allItems.find(it => it.key === k))
      .filter((it): it is SelectableItem => Boolean(it))

    const strategiesPayload: StrategyPayload[] = selected.map(it => {
      if (it.source === 'user') return { strategyId: it.strategyId }
      return { preset: it.preset }
    })
    const strategyDisplayNames = selected.map(it => it.name)

    const universeDef = getUniverse(universe)
    const tickers = universeDef.entries.map(e => ({
      ticker: e.ticker,
      market: e.market,
      name: e.name,
    }))

    setCollapsedStrategies(new Set())
    setExpandedTickers(new Set())

    try {
      await startScan({
        strategies: strategiesPayload,
        strategyDisplayNames,
        asOfDate,
        realtime,
        universe,
        universeLabel: universeDef.label,
        tickers,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '스캔 실행 실패')
    }
  }

  const toggleExpand = (key: string) => {
    setExpandedTickers(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleStrategyCollapse = (key: string) => {
    setCollapsedStrategies(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // 결과 표시용 데이터: ScannerContext의 job에서 가져오기
  const totalMatches = useMemo(() => {
    if (!job) return 0
    return Object.values(job.matchesByStrategy).reduce((sum, arr) => sum + arr.length, 0)
  }, [job])

  const progressPercent = useMemo(() => {
    if (!job || job.total === 0) return 0
    return Math.min(100, Math.round((job.processed / job.total) * 100))
  }, [job])

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <Search className="w-6 h-6 text-purple-500" />
          <h1 className="text-xl font-bold text-at-text">전략 부합 종목 스크리너</h1>
        </div>
        <p className="text-sm text-at-text-secondary mt-1">
          선택한 전략의 매수 조건을 기준일 시점에서 충족하는 종목을 찾아냅니다.
          여러 전략을 동시에 선택하면 전략별로 분리된 결과를 한 번에 확인할 수 있습니다.
        </p>
      </div>

      {/* 1. 전략 선택 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2 className="font-semibold text-at-text">📋 1. 전략 선택 (다중 가능)</h2>
          <span className="text-xs text-at-text-secondary">{selectedKeys.size} / {MAX_STRATEGIES}개 선택됨</span>
        </div>

        {!loadingStrategies && userItems.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <User className="w-4 h-4 text-at-accent" />
              <h3 className="text-sm font-semibold text-at-text">내 전략</h3>
              <span className="text-xs text-at-text-weak">{userItems.length}개</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {userItems.map(item => (
                <StrategyCard
                  key={item.key}
                  item={item}
                  selected={selectedKeys.has(item.key)}
                  onToggle={() => toggleStrategy(item.key)}
                  onOpenDetail={setDetailPresetId}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-at-text">프리셋 전략</h3>
            <span className="text-xs text-at-text-weak">{presetItems.length}개</span>
          </div>
          {loadingStrategies ? (
            <p className="text-sm text-at-text-secondary py-4 text-center">로딩 중...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {presetItems.map(item => (
                <StrategyCard
                  key={item.key}
                  item={item}
                  selected={selectedKeys.has(item.key)}
                  onToggle={() => toggleStrategy(item.key)}
                  onOpenDetail={setDetailPresetId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. 기준일 / 종목 풀 / 실시간 모드 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <h2 className="font-semibold text-at-text mb-3">⚙️ 2. 기준일 및 종목 풀</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-3">
            <div>
              <label className="block text-xs font-medium text-at-text-secondary mb-1.5">기준일</label>
              <input
                type="date"
                value={asOfDate}
                max={new Date().toISOString().slice(0, 10)}
                onChange={e => setAsOfDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent"
              />
              <p className="text-[10px] text-at-text-weak mt-1">
                주말/휴장일이면 직전 거래일 종가 기준
              </p>
            </div>

            {/* 실시간 모드 토글 */}
            <label
              className={`flex items-start gap-2 p-2.5 rounded-xl border-2 cursor-pointer transition-colors ${
                realtime ? 'border-amber-400 bg-amber-50' : 'border-at-border bg-white hover:border-amber-300'
              } ${isScanning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                checked={realtime}
                disabled={isScanning}
                onChange={e => setRealtime(e.target.checked)}
                className="mt-0.5 accent-amber-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-sm font-semibold text-at-text">
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  장중 실시간 가격 사용
                </div>
                <p className="text-[10px] text-at-text-weak mt-0.5">
                  장이 열려 있을 때만 실시간 시세를 사용. 마감 후엔 자동으로 종가 사용.
                </p>
              </div>
            </label>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">종목 풀</label>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {UNIVERSE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUniverse(opt.id)}
                  disabled={isScanning}
                  className={`text-left p-2.5 rounded-xl border-2 transition-colors ${
                    universe === opt.id ? 'border-purple-500 bg-purple-50' : 'border-at-border bg-white hover:border-purple-300'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-semibold text-sm text-at-text truncate">{opt.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-at-bg text-at-text-weak flex-shrink-0">{opt.eta}</span>
                  </div>
                  <p className="text-[11px] text-at-text-secondary mt-0.5 truncate">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {isScanning ? (
          <button
            onClick={cancelScan}
            className="mt-4 w-full px-4 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors inline-flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            스캔 취소 ({job?.processed ?? 0}/{job?.total ?? 0})
          </button>
        ) : (
          <button
            onClick={runScreener}
            disabled={selectedKeys.size === 0}
            className="mt-4 w-full px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            <Search className="w-4 h-4" />
            {selectedKeys.size === 0
              ? '전략을 먼저 선택하세요'
              : `${selectedKeys.size}개 전략으로 동시 스캔`}
          </button>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
            <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {job?.status === 'error' && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{job.error || '스캔 중 오류가 발생했습니다'}</span>
          </div>
        )}
      </section>

      {/* 3. 인라인 진행률 (페이지 내에 있을 때 더 자세히) */}
      {isScanning && job && (
        <section className="bg-white rounded-2xl shadow-sm border border-purple-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
              <span className="font-semibold text-sm text-at-text">스캔 진행 중</span>
              {job.realtime && (
                <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                  <Zap className="w-3 h-3" /> 실시간
                </span>
              )}
            </div>
            <span className="text-xs font-mono text-at-text-secondary">
              {job.processed}/{job.total} ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-2 bg-at-surface-alt rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {job.currentTickers.length > 0 && (
            <p className="text-[11px] text-at-text-weak mt-2 truncate">
              처리 중: <span className="font-mono">{job.currentTickers.join(', ')}</span>
            </p>
          )}
          <p className="text-[11px] text-at-text-secondary mt-1">
            누적 매칭 <span className="font-semibold text-purple-600">{totalMatches}건</span>
            <span className="mx-1">·</span>
            {job.universeLabel}
          </p>
        </section>
      )}

      {/* 4. 결과 — 전략별 섹션 */}
      {job && job.strategyKeys.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-at-text">
              🎯 매수 조건 충족 종목 (전체 {totalMatches}건 / {job.processed}/{job.total} 평가)
            </h2>
            <div className="flex items-center gap-2 text-xs text-at-text-secondary">
              <span>기준일: <span className="font-mono">{job.asOfDate}</span></span>
              <span>·</span>
              <span>{job.universeLabel}</span>
              {job.realtime && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5 text-amber-700 font-semibold">
                    <Zap className="w-3 h-3" /> 실시간
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {job.strategyKeys.map(strategyKey => {
              const matches = job.matchesByStrategy[strategyKey] || []
              const failed = job.failedByStrategy[strategyKey] || []
              const strategyName = job.strategyNames[strategyKey] || strategyKey
              const isCollapsed = collapsedStrategies.has(strategyKey)
              return (
                <div key={strategyKey} className="rounded-xl border border-at-border bg-white">
                  <button
                    onClick={() => toggleStrategyCollapse(strategyKey)}
                    className="w-full flex items-center justify-between gap-2 px-4 py-2.5 bg-at-surface-alt hover:bg-at-bg rounded-t-xl"
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-at-text-weak" /> : <ChevronDown className="w-4 h-4 text-at-text-weak" />}
                      <span className="font-semibold text-sm text-at-text">{strategyName}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        matches.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-at-surface text-at-text-weak'
                      }`}>
                        {matches.length}건 충족
                      </span>
                    </div>
                    {failed.length > 0 && (
                      <span className="text-[10px] text-at-text-weak">실패 {failed.length}건</span>
                    )}
                  </button>

                  {!isCollapsed && (
                    <>
                      {matches.length === 0 ? (
                        <div className="p-6 text-center">
                          <AlertCircle className="w-6 h-6 mx-auto text-at-text-weak mb-1.5 opacity-60" />
                          <p className="text-xs text-at-text-secondary">충족 종목 없음</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead className="bg-at-surface-alt/40 border-t border-at-border/60">
                              <tr>
                                <th className="px-2 py-2 w-8"></th>
                                <th className="px-3 py-2 text-left font-medium text-at-text-secondary">시장</th>
                                <th className="px-3 py-2 text-left font-medium text-at-text-secondary">종목</th>
                                <th className="px-3 py-2 text-left font-medium text-at-text-secondary">이름</th>
                                <th className="px-3 py-2 text-right font-medium text-at-text-secondary">기준일 종가</th>
                                <th className="px-3 py-2 text-left font-medium text-at-text-secondary">충족 조건</th>
                              </tr>
                            </thead>
                            <tbody>
                              {matches.map(m => {
                                const rowKey = `${strategyKey}|${m.market}:${m.ticker}`
                                const expanded = expandedTickers.has(rowKey)
                                return (
                                  <Fragment key={rowKey}>
                                    <tr
                                      className="border-t border-at-border hover:bg-at-surface-alt cursor-pointer"
                                      onClick={() => toggleExpand(rowKey)}
                                    >
                                      <td className="px-2 py-2 text-at-text-weak">
                                        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                          m.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                        }`}>
                                          {m.market === 'KR' ? '국내' : '미국'}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 font-mono font-semibold text-at-accent">{m.ticker}</td>
                                      <td className="px-3 py-2 text-at-text">{m.name}</td>
                                      <td className="px-3 py-2 text-right font-mono">
                                        {m.market === 'KR' ? `${Math.round(m.price).toLocaleString()}원` : `$${m.price.toFixed(2)}`}
                                      </td>
                                      <td className="px-3 py-2 text-at-text-secondary text-[11px]">
                                        {m.matchedConditions.length === 0 ? '—' :
                                          m.matchedConditions.length === 1 ? m.matchedConditions[0] :
                                          `${m.matchedConditions[0]} 외 ${m.matchedConditions.length - 1}건`}
                                      </td>
                                    </tr>
                                    {expanded && (
                                      <tr className="border-t border-at-border bg-blue-50/30">
                                        <td colSpan={6} className="p-3">
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="bg-white rounded-lg border border-at-border p-3">
                                              <p className="text-xs font-semibold text-at-text mb-1.5">충족 조건</p>
                                              <ul className="space-y-1">
                                                {m.matchedConditions.map((c, i) => (
                                                  <li key={i} className="text-[11px] font-mono bg-at-surface-alt rounded px-2 py-1">{c}</li>
                                                ))}
                                              </ul>
                                            </div>
                                            <div className="bg-white rounded-lg border border-at-border p-3">
                                              <p className="text-xs font-semibold text-at-text mb-1.5">지표값</p>
                                              <div className="flex flex-wrap gap-1">
                                                {Object.entries(m.indicators).map(([id, val]) => (
                                                  <span key={id} className="text-[10px] font-mono bg-at-surface-alt rounded px-2 py-1">
                                                    <span className="text-at-text-secondary">{id}:</span>{' '}
                                                    {typeof val === 'number'
                                                      ? val.toFixed(Math.abs(val) >= 100 ? 1 : 2)
                                                      : Object.entries(val).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ')}
                                                  </span>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </Fragment>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {failed.length > 0 && (
                        <div className="px-3 py-2 text-xs text-at-text-weak border-t border-at-border/60">
                          <details>
                            <summary className="cursor-pointer hover:text-at-text">
                              평가 실패 {failed.length}건
                            </summary>
                            <ul className="mt-2 space-y-0.5 ml-4">
                              {failed.slice(0, 10).map((f, i) => (
                                <li key={i}>[{f.market}] {f.ticker} — {f.reason}</li>
                              ))}
                            </ul>
                          </details>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          <div className="mt-3 flex items-center gap-2 text-[11px] text-at-text-weak">
            <Info className="w-3 h-3" />
            <span>각 종목 행 클릭 시 충족 조건과 지표값 상세 펼침. 전략 헤더 클릭으로 섹션 접기/펼치기.</span>
          </div>
        </section>
      )}

      {/* 상세 모달 */}
      {detailPresetId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto bg-black/50 backdrop-blur-sm"
          onClick={() => setDetailPresetId(null)}
        >
          <div
            className="relative w-full max-w-4xl bg-at-surface rounded-2xl shadow-2xl border border-at-border my-4"
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setDetailPresetId(null)}
              className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white border border-at-border text-at-text-secondary hover:text-at-text hover:bg-at-bg shadow-sm"
              title="닫기"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="p-5 sm:p-6">
              <PresetDetailView presetId={detailPresetId} variant="modal" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StrategyCard({ item, selected, onToggle, onOpenDetail }: {
  item: SelectableItem
  selected: boolean
  onToggle: () => void
  onOpenDetail: (id: string) => void
}) {
  const presetId = item.source === 'preset' ? item.key.replace(/^preset:/, '') : null
  return (
    <div
      className={`relative p-3 rounded-xl border-2 transition-colors ${
        selected ? 'border-purple-500 bg-purple-50' : 'border-at-border bg-at-surface hover:border-purple-300'
      }`}
    >
      <button onClick={onToggle} className="w-full text-left pr-7">
        <p className="font-medium text-at-text text-sm break-all">{item.name}</p>
        {item.description && (
          <p className="text-xs text-at-text-secondary mt-0.5 line-clamp-1">{item.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-at-bg text-at-text-weak">
            지표 {item.indicatorCount}개
          </span>
          {item.source === 'preset' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">프리셋</span>
          )}
        </div>
      </button>
      {selected && (
        <span className="absolute top-2 left-2 text-purple-600">
          <CheckCircle2 className="w-4 h-4" />
        </span>
      )}
      {presetId && (
        <button
          onClick={e => { e.stopPropagation(); onOpenDetail(presetId) }}
          className="absolute top-2 right-2 p-1 rounded-full text-at-text-weak hover:text-at-accent hover:bg-at-bg"
          title="전략 상세"
          type="button"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
