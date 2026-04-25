'use client'

/**
 * 다전략 백테스트 비교 콘텐츠
 *
 * 한 종목에 대해 여러 전략을 동시에 백테스트하여 성과를 비교.
 * 기존 /api/investment/backtest를 N번 병렬 호출.
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { GitCompare, Play, Loader2, AlertCircle, Trophy, X, CheckCircle2, Sparkles, User, ChevronDown, ChevronRight } from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import type {
  InvestmentStrategy, Market, BacktestMetrics, EquityCurvePoint, BacktestTrade,
  PresetStrategy, IndicatorConfig, ConditionGroup, RiskSettings,
} from '@/types/investment'

/** 비교 가능한 단일 항목 (사용자 저장 전략 또는 프리셋) */
interface SelectableItem {
  key: string  // 'user:<uuid>' 또는 'preset:<id>'
  source: 'user' | 'preset'
  name: string
  description?: string
  indicatorCount: number
  isActive?: boolean
  // 백테스트 호출용 데이터
  strategyId?: string
  preset?: {
    indicators: IndicatorConfig[]
    buyConditions: ConditionGroup
    sellConditions: ConditionGroup
    riskSettings?: Partial<RiskSettings>
  }
}

// 단타 전용 프리셋 ID (일봉 비교에서 제외)
const DAYTRADING_PRESET_IDS = new Set(['day-vwap-bounce', 'day-orb-breakout', 'day-closing-pressure'])

// 비교 전략 수 상한 (안전 마진. 사용자/프리셋 합계가 이를 넘으면 한 번에 N개씩 분할 호출 권장)
const MAX_COMPARE = 50

// 일정한 색상 팔레트 (최대 6개 전략 비교) — Tailwind JIT가 인식하도록 클래스 전체 명시
const COLORS = [
  { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', dot: 'bg-blue-500', light: 'bg-blue-50', stroke: 'stroke-blue-500' },
  { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-600', dot: 'bg-emerald-500', light: 'bg-emerald-50', stroke: 'stroke-emerald-500' },
  { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-600', dot: 'bg-amber-500', light: 'bg-amber-50', stroke: 'stroke-amber-500' },
  { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-600', dot: 'bg-purple-500', light: 'bg-purple-50', stroke: 'stroke-purple-500' },
  { bg: 'bg-pink-500', border: 'border-pink-500', text: 'text-pink-600', dot: 'bg-pink-500', light: 'bg-pink-50', stroke: 'stroke-pink-500' },
  { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-600', dot: 'bg-cyan-500', light: 'bg-cyan-50', stroke: 'stroke-cyan-500' },
]

interface BacktestResultItem {
  strategyId: string
  strategyName: string
  metrics: BacktestMetrics
  trades: BacktestTrade[]
  equityCurve: EquityCurvePoint[]
  buyHold?: { totalReturn: number; equityCurve?: EquityCurvePoint[] }
  error?: string
}

export default function CompareContent() {
  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [loadingStrategies, setLoadingStrategies] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [ticker, setTicker] = useState('AAPL')
  const [tickerName, setTickerName] = useState('Apple Inc.')
  const [market, setMarket] = useState<Market>('US')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setFullYear(d.getFullYear() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [initialCapital, setInitialCapital] = useState(10_000_000)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<BacktestResultItem[]>([])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const loadStrategies = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      if (json.data) {
        // 일봉 swing 전략만 (단타는 별도 비교 도구 필요)
        const swingStrategies = (json.data as InvestmentStrategy[]).filter(
          s => !s.mode || s.mode === 'swing'
        )
        setStrategies(swingStrategies)
      }
    } catch {
      console.error('전략 목록 조회 실패')
    } finally {
      setLoadingStrategies(false)
    }
  }, [])

  useEffect(() => { loadStrategies() }, [loadStrategies])

  // 사용자 저장 전략 (시장 일치)
  const userItems = useMemo<SelectableItem[]>(
    () => strategies
      .filter(s => s.target_market === market)
      .map(s => ({
        key: `user:${s.id}`,
        source: 'user' as const,
        name: s.name,
        description: s.description || undefined,
        indicatorCount: Array.isArray(s.indicators) ? s.indicators.length : 0,
        isActive: s.is_active,
        strategyId: s.id,
      })),
    [strategies, market]
  )

  // 프리셋 전략 (단타 제외 = 일봉 swing)
  const presetItems = useMemo<SelectableItem[]>(
    () => PRESET_STRATEGIES
      .filter(p => !DAYTRADING_PRESET_IDS.has(p.id))
      .map((p: PresetStrategy) => ({
        key: `preset:${p.id}`,
        source: 'preset' as const,
        name: p.name,
        description: p.description,
        indicatorCount: p.indicators.length,
        preset: {
          indicators: p.indicators,
          buyConditions: p.buyConditions,
          sellConditions: p.sellConditions,
          riskSettings: p.riskSettings,
        },
      })),
    []
  )

  const allItems = useMemo(() => [...userItems, ...presetItems], [userItems, presetItems])

  const toggleStrategy = (key: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else if (next.size < MAX_COMPARE) next.add(key)
      else alert(`최대 ${MAX_COMPARE}개까지 비교할 수 있습니다`)
      return next
    })
  }

  const handleTickerSelect = (t: string, name?: string) => {
    setTicker(t)
    setTickerName(name || t)
  }

  const runCompare = async () => {
    if (selectedIds.size === 0) return setError('비교할 전략을 1개 이상 선택해주세요')
    if (!ticker.trim()) return setError('종목 코드를 입력해주세요')

    setRunning(true)
    setError(null)
    setResults([])

    const keys = Array.from(selectedIds)
    const promises = keys.map(async (key): Promise<BacktestResultItem> => {
      const item = allItems.find(it => it.key === key)
      const name = item?.name || key
      const body: Record<string, unknown> = {
        ticker: ticker.trim(),
        market,
        startDate,
        endDate,
        initialCapital,
        // 비교 정확도를 위해 모든 전략을 동일 조건으로 실행:
        // 자본 100% 매수 + 매도 후 회수액 전액 재투자 (복리)
        useFullCapital: true,
      }
      if (item?.source === 'user') body.strategyId = item.strategyId
      else if (item?.source === 'preset') body.preset = item.preset

      try {
        const res = await fetch('/api/investment/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok || !json.data) {
          return {
            strategyId: key,
            strategyName: name,
            metrics: emptyMetrics(),
            trades: [],
            equityCurve: [],
            error: json.error || '실패',
          }
        }
        return {
          strategyId: key,
          strategyName: name,
          metrics: json.data.metrics,
          trades: json.data.trades || [],
          equityCurve: json.data.equityCurve || [],
          buyHold: json.data.buyHold,
        }
      } catch (err) {
        return {
          strategyId: key,
          strategyName: name,
          metrics: emptyMetrics(),
          trades: [],
          equityCurve: [],
          error: err instanceof Error ? err.message : '네트워크 오류',
        }
      }
    })

    const allResults = await Promise.all(promises)
    allResults.sort((a, b) => (b.metrics?.totalReturn ?? -Infinity) - (a.metrics?.totalReturn ?? -Infinity))
    setResults(allResults)
    setRunning(false)
  }

  // 모든 결과의 통합 equity curve 정규화 데이터
  const chartData = useMemo(() => {
    if (results.length === 0) return null
    const validResults = results.filter(r => !r.error && r.equityCurve.length > 0)
    if (validResults.length === 0) return null

    // 각 전략 80포인트로 샘플링
    const sampled = validResults.map(r => ({
      strategyId: r.strategyId,
      name: r.strategyName,
      points: sampleCurve(r.equityCurve, 80),
    }))

    // Buy & Hold 추가 (첫 번째 결과의 BH가 있다면)
    const bhCurve = validResults[0]?.buyHold?.equityCurve
    if (bhCurve && bhCurve.length > 0) {
      sampled.push({ strategyId: '__bh__', name: '단순 보유 (B&H)', points: sampleCurve(bhCurve, 80) })
    }

    const allValues = sampled.flatMap(s => s.points.map(p => p.value))
    const min = Math.min(...allValues)
    const max = Math.max(...allValues)

    return { sampled, min, max, range: max - min || 1 }
  }, [results])

  return (
    <div className="space-y-6 max-w-6xl">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-purple-500" />
          <h1 className="text-xl font-bold text-at-text">전략 비교 백테스트</h1>
        </div>
        <p className="text-sm text-at-text-secondary mt-1">
          하나의 종목에 대해 여러 전략을 동시에 백테스트하여 성과를 비교합니다. 최대 {MAX_COMPARE}개까지 동시 비교.
        </p>
      </div>

      {/* 비교 모드 안내 */}
      <div className="rounded-xl bg-purple-50 border border-purple-200 p-3 text-xs text-purple-900 flex items-start gap-2">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-purple-600" />
        <div>
          <p className="font-medium mb-0.5">정확한 비교를 위한 동일 조건</p>
          <p className="text-purple-800">
            매수 시 가용 현금 100%를 모두 투입하고, 매도 후 회수된 금액을 다음 매수에 전액 재투자합니다(복리 반영).
            전략의 <code className="px-1 py-0.5 bg-purple-100 rounded">maxPositionSizePercent</code> 리스크 설정은
            <strong> 비교에서만 무시</strong>되어, 순수 매매 시그널의 성과 차이를 비교할 수 있도록 합니다.
          </p>
        </div>
      </div>

      {/* 설정 폼 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <h2 className="font-semibold text-at-text mb-3">⚙️ 백테스트 설정</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 시장 */}
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">시장</label>
            <div className="flex gap-2">
              {(['US', 'KR'] as Market[]).map(m => (
                <button
                  key={m}
                  onClick={() => { if (m !== market) { setMarket(m); setSelectedIds(new Set()) } }}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    market === m
                      ? 'bg-at-accent text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-bg'
                  }`}
                >
                  {m === 'KR' ? '국내' : '미국'}
                </button>
              ))}
            </div>
          </div>

          {/* 종목 */}
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">종목</label>
            <TickerSearch
              market={market}
              onSelect={handleTickerSelect}
              placeholder={market === 'US' ? '예: 애플 / AAPL' : '예: 삼성전자 / 005930'}
              clearOnSelect={false}
            />
            {ticker && (
              <p className="text-xs text-at-text-secondary mt-1.5">
                선택됨: <span className="font-mono font-semibold text-at-text">{ticker}</span>
                {tickerName && tickerName !== ticker && <span className="ml-2">({tickerName})</span>}
              </p>
            )}
          </div>

          {/* 기간 */}
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent"
            />
          </div>

          {/* 초기 자본 */}
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">초기 자본</label>
            <input
              type="number"
              value={initialCapital}
              onChange={e => setInitialCapital(Math.max(100_000, Number(e.target.value) || 0))}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent"
              min={100_000}
              step={1_000_000}
            />
          </div>
        </div>
      </section>

      {/* 전략 선택 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="font-semibold text-at-text">📋 비교할 전략 선택</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-at-text-secondary">{selectedIds.size}개 선택됨 ({market})</span>
            <button
              onClick={() => {
                const total = userItems.length + presetItems.length
                if (selectedIds.size === total) {
                  setSelectedIds(new Set())
                } else {
                  const all = new Set<string>()
                  for (const it of userItems) all.add(it.key)
                  for (const it of presetItems) all.add(it.key)
                  if (all.size > MAX_COMPARE) {
                    alert(`전략이 ${all.size}개로 너무 많습니다. 최대 ${MAX_COMPARE}개까지만 동시 비교 가능합니다.`)
                    return
                  }
                  setSelectedIds(all)
                }
              }}
              className="text-xs text-at-accent hover:underline"
            >
              {selectedIds.size === userItems.length + presetItems.length ? '전체 해제' : '전체 선택'}
            </button>
          </div>
        </div>

        {/* 내 전략 그룹 */}
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-4 h-4 text-at-accent" />
            <h3 className="text-sm font-semibold text-at-text">내 전략 ({market === 'KR' ? '국내' : '미국'})</h3>
            <span className="text-xs text-at-text-weak">{userItems.length}개</span>
          </div>
          {loadingStrategies ? (
            <p className="text-sm text-at-text-secondary py-4 text-center">전략 목록 불러오는 중...</p>
          ) : userItems.length === 0 ? (
            <div className="rounded-xl border border-dashed border-at-border bg-at-surface-alt p-4 text-center text-xs text-at-text-secondary">
              <AlertCircle className="w-5 h-5 mx-auto mb-1 opacity-40" />
              {market === 'KR' ? '국내' : '미국'} 시장 저장 전략이 없습니다. 아래 프리셋으로 바로 비교하실 수 있어요.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {userItems.map(item => (
                <SelectableCard
                  key={item.key}
                  item={item}
                  selectedIds={selectedIds}
                  onToggle={toggleStrategy}
                />
              ))}
            </div>
          )}
        </div>

        {/* 프리셋 그룹 */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-at-text">프리셋 전략</h3>
            <span className="text-xs text-at-text-weak">저장 없이 즉시 비교 · {presetItems.length}개</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {presetItems.map(item => (
              <SelectableCard
                key={item.key}
                item={item}
                selectedIds={selectedIds}
                onToggle={toggleStrategy}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={runCompare}
            disabled={running || selectedIds.size === 0 || !ticker.trim()}
            className="flex-1 px-4 py-2.5 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? `백테스트 실행 중... (${selectedIds.size}개)` : `${selectedIds.size}개 전략 비교 실행`}
          </button>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
            <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* 결과: 메트릭 비교 표 */}
      {results.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-at-text">📊 비교 결과 ({ticker})</h2>
            <span className="text-xs text-at-text-secondary">수익률 내림차순</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-at-border mb-4">
            <table className="w-full text-xs">
              <thead className="bg-at-surface-alt">
                <tr>
                  <th className="px-2 py-2 w-8"></th>
                  <th className="px-3 py-2 text-left font-medium text-at-text-secondary">순위</th>
                  <th className="px-3 py-2 text-left font-medium text-at-text-secondary">전략</th>
                  <th className="px-3 py-2 text-right font-medium text-at-text-secondary">수익률</th>
                  <th className="px-3 py-2 text-right font-medium text-at-text-secondary">B&H</th>
                  <th className="px-3 py-2 text-right font-medium text-at-text-secondary">승률</th>
                  <th className="px-3 py-2 text-right font-medium text-at-text-secondary">거래</th>
                  <th className="px-3 py-2 text-right font-medium text-at-text-secondary">Sharpe</th>
                  <th className="px-3 py-2 text-right font-medium text-at-text-secondary">MDD</th>
                  <th className="px-3 py-2 text-right font-medium text-at-text-secondary">PF</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const color = COLORS[i % COLORS.length]
                  if (r.error) {
                    return (
                      <tr key={r.strategyId} className="border-t border-at-border bg-red-50/30">
                        <td></td>
                        <td className="px-3 py-2"><span className={`inline-block w-5 h-5 rounded-full ${color.dot}`} /></td>
                        <td className="px-3 py-2 font-medium text-at-text">{r.strategyName}</td>
                        <td colSpan={7} className="px-3 py-2 text-red-700 text-xs">⚠️ {r.error}</td>
                      </tr>
                    )
                  }
                  const totalRet = r.metrics.totalReturn
                  const bhRet = r.buyHold?.totalReturn ?? 0
                  const isExpanded = expandedIds.has(r.strategyId)
                  const hasTrades = r.trades.length > 0
                  return (
                    <Fragment key={r.strategyId}>
                      <tr
                        className={`border-t border-at-border hover:bg-at-surface-alt ${hasTrades ? 'cursor-pointer' : ''}`}
                        onClick={() => {
                          if (!hasTrades) return
                          setExpandedIds(prev => {
                            const next = new Set(prev)
                            if (next.has(r.strategyId)) next.delete(r.strategyId)
                            else next.add(r.strategyId)
                            return next
                          })
                        }}
                      >
                        <td className="px-2 py-2 text-at-text-weak">
                          {hasTrades && (isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${color.bg} text-white text-[10px] font-bold`}>
                            {i + 1}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-medium text-at-text">
                          {i === 0 && <Trophy className="w-3 h-3 text-amber-500 inline mr-1" />}
                          {r.strategyName}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-semibold ${totalRet > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {totalRet > 0 ? '+' : ''}{totalRet.toFixed(2)}%
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${bhRet > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {bhRet > 0 ? '+' : ''}{bhRet.toFixed(2)}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono">{r.metrics.winRate.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right font-mono">{r.metrics.totalTrades}</td>
                        <td className="px-3 py-2 text-right font-mono">{r.metrics.sharpeRatio.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-blue-500">{r.metrics.maxDrawdown.toFixed(2)}%</td>
                        <td className="px-3 py-2 text-right font-mono">{r.metrics.profitFactor.toFixed(2)}</td>
                      </tr>
                      {isExpanded && hasTrades && (
                        <tr className={`border-t border-at-border ${color.light}`}>
                          <td colSpan={10} className="p-3">
                            <TradesMiniTable trades={r.trades} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 통합 자산 곡선 */}
          {chartData && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold text-at-text text-sm">자산 곡선 비교</h3>
                <div className="flex flex-wrap gap-3 text-xs">
                  {chartData.sampled.map((s, i) => {
                    const isBH = s.strategyId === '__bh__'
                    const color = isBH ? null : COLORS[results.findIndex(r => r.strategyId === s.strategyId) % COLORS.length]
                    return (
                      <span key={s.strategyId} className="flex items-center gap-1">
                        <span className={`w-3 h-1.5 rounded inline-block ${isBH ? 'bg-amber-300' : color?.dot}`} />
                        <span className="truncate max-w-[120px]">{s.name}</span>
                      </span>
                    )
                  })}
                </div>
              </div>
              <div className="relative h-48 rounded-xl border border-at-border bg-at-surface p-2">
                <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                  {chartData.sampled.map(s => {
                    const isBH = s.strategyId === '__bh__'
                    const colorIdx = isBH ? -1 : results.findIndex(r => r.strategyId === s.strategyId)
                    const colorClass = isBH
                      ? 'stroke-amber-300'
                      : COLORS[colorIdx % COLORS.length].stroke
                    const points = s.points.map((p, idx) => {
                      const x = (idx / Math.max(1, s.points.length - 1)) * 100
                      const y = 100 - ((p.value - chartData.min) / chartData.range) * 100
                      return `${x},${y}`
                    }).join(' ')
                    return (
                      <polyline
                        key={s.strategyId}
                        points={points}
                        fill="none"
                        strokeWidth="0.8"
                        className={`${colorClass} ${isBH ? 'opacity-60' : ''}`}
                        vectorEffect="non-scaling-stroke"
                      />
                    )
                  })}
                </svg>
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-at-text-weak">
                <span>{startDate}</span>
                <span>{endDate}</span>
              </div>
            </div>
          )}

          {/* 요약 인사이트 */}
          {results.length >= 2 && results[0] && !results[0].error && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-amber-900 text-xs">
                  <p className="font-medium">최고 성과: {results[0].strategyName}</p>
                  <p className="mt-0.5">
                    총 수익률 <span className="font-mono font-semibold">{results[0].metrics.totalReturn > 0 ? '+' : ''}{results[0].metrics.totalReturn.toFixed(2)}%</span>,
                    {' '}승률 {results[0].metrics.winRate.toFixed(1)}%, Sharpe {results[0].metrics.sharpeRatio.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

/** 전략별 매매 내역 미니 표 — expandable row 안에 표시 */
function TradesMiniTable({ trades }: { trades: BacktestTrade[] }) {
  const limit = 50
  const shown = trades.slice(0, limit)
  return (
    <div className="overflow-x-auto rounded-lg border border-at-border bg-white">
      <table className="w-full text-[11px]">
        <thead className="bg-at-surface-alt">
          <tr className="text-at-text-secondary">
            <th className="px-2 py-1.5 text-left font-medium">종목</th>
            <th className="px-2 py-1.5 text-left font-medium">진입일</th>
            <th className="px-2 py-1.5 text-left font-medium">청산일</th>
            <th className="px-2 py-1.5 text-right font-medium">진입가</th>
            <th className="px-2 py-1.5 text-right font-medium">청산가</th>
            <th className="px-2 py-1.5 text-right font-medium">수량</th>
            <th className="px-2 py-1.5 text-right font-medium">손익</th>
            <th className="px-2 py-1.5 text-right font-medium">수익률</th>
            <th className="px-2 py-1.5 text-right font-medium">보유일</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => (
            <tr key={i} className="border-t border-at-border/60">
              <td className="px-2 py-1.5 font-mono font-semibold text-at-text">{t.ticker}</td>
              <td className="px-2 py-1.5 font-mono text-at-text-secondary">{t.entryDate}</td>
              <td className="px-2 py-1.5 font-mono text-at-text-secondary">{t.exitDate}</td>
              <td className="px-2 py-1.5 text-right font-mono">{t.entryPrice.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right font-mono">{t.exitPrice.toLocaleString()}</td>
              <td className="px-2 py-1.5 text-right font-mono">{t.quantity}</td>
              <td className={`px-2 py-1.5 text-right font-mono font-semibold ${t.pnl >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {t.pnl >= 0 ? '+' : ''}{Math.round(t.pnl).toLocaleString()}
              </td>
              <td className={`px-2 py-1.5 text-right font-mono ${t.pnlPercent >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%
              </td>
              <td className="px-2 py-1.5 text-right font-mono">{t.holdingDays}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {trades.length > limit && (
        <div className="px-2 py-1.5 text-[10px] text-at-text-weak bg-at-surface-alt border-t border-at-border">
          최근 {limit}건만 표시 (총 {trades.length}건)
        </div>
      )}
    </div>
  )
}

function SelectableCard({ item, selectedIds, onToggle }: {
  item: SelectableItem
  selectedIds: Set<string>
  onToggle: (key: string) => void
}) {
  const isSelected = selectedIds.has(item.key)
  const orderIndex = isSelected ? Array.from(selectedIds).indexOf(item.key) : -1
  const color = orderIndex >= 0 ? COLORS[orderIndex % COLORS.length] : null
  return (
    <button
      onClick={() => onToggle(item.key)}
      className={`text-left p-3 rounded-xl border-2 transition-colors ${
        isSelected
          ? `${color?.border ?? 'border-at-accent'} ${color?.light ?? 'bg-at-accent-light'}`
          : 'border-at-border bg-at-surface hover:border-at-accent/50'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
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
            {item.isActive && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">활성</span>
            )}
          </div>
        </div>
        {isSelected && color && (
          <span className={`flex-shrink-0 w-6 h-6 rounded-full ${color.bg} text-white text-xs font-bold flex items-center justify-center`}>
            {orderIndex + 1}
          </span>
        )}
      </div>
    </button>
  )
}

function sampleCurve(curve: EquityCurvePoint[], maxPoints: number): EquityCurvePoint[] {
  if (curve.length <= maxPoints) return curve
  // 균등 매핑: 시작/끝 포인트를 항상 포함하여 표의 totalReturn과 시각적 일치 유지
  const result: EquityCurvePoint[] = []
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * (curve.length - 1)) / (maxPoints - 1))
    result.push(curve[idx])
  }
  return result
}

function emptyMetrics(): BacktestMetrics {
  return {
    totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0, sharpeRatio: 0,
    winRate: 0, totalTrades: 0, profitFactor: 0,
    avgWin: 0, avgLoss: 0, maxConsecutiveWins: 0, maxConsecutiveLosses: 0, avgHoldingDays: 0,
  }
}
