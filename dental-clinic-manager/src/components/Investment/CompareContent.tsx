'use client'

/**
 * 다전략 백테스트 비교 콘텐츠
 *
 * 한 종목에 대해 여러 전략을 동시에 백테스트하여 성과를 비교.
 * 기존 /api/investment/backtest를 N번 병렬 호출.
 */

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { GitCompare, Play, Loader2, AlertCircle, Trophy, X, CheckCircle2, Sparkles, User, ChevronDown, ChevronRight, Info, Wand2, TrendingUp, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import PresetDetailView from '@/components/Investment/PresetDetailView'
import DateRangePicker from '@/components/Investment/DateRangePicker'
import type {
  InvestmentStrategy, Market, BacktestMetrics, EquityCurvePoint, BacktestTrade,
  PresetStrategy, IndicatorConfig, ConditionGroup, RiskSettings,
  RecommendationMode, RecommendationResult, MarketRegime,
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

// 비교 결과표 컬럼 용어 설명 사전
const METRIC_GLOSSARY: Record<string, { title: string; body: string; formula?: string }> = {
  'totalReturn': {
    title: '총 수익률',
    body: '백테스트 기간 동안 전략으로 운용한 자본의 누적 수익률. 매매 수수료와 세금이 차감된 순 수익률.',
    formula: '(최종 평가액 − 초기 자본) / 초기 자본 × 100%',
  },
  'buyHold': {
    title: 'B&H (Buy & Hold)',
    body: '같은 기간 동안 단순히 매수하고 보유했을 때의 수익률. 전략의 alpha(추가 수익) 여부를 비교하는 기준선. 전략 수익률이 B&H보다 낮으면 단순 보유가 더 나았다는 뜻.',
    formula: '(종료일 종가 / 시작일 시가 − 1) × 100%',
  },
  'winRate': {
    title: '승률 (Win Rate)',
    body: '전체 매매 중 수익을 낸 매매의 비율. 50% 이상이면 절반 넘게 이긴 셈. 다만 승률이 높아도 평균 손실이 평균 수익보다 크면 손해(profit factor 참고).',
    formula: '수익 매매 수 / 전체 매매 수 × 100%',
  },
  'totalTrades': {
    title: '거래 횟수',
    body: '백테스트 기간 동안 매수 → 매도 사이클이 몇 번 발생했는지. 거래가 너무 적으면(예: 1~2회) 통계적 유의성이 떨어지고, 너무 많으면 수수료/슬리피지 비용이 누적된다.',
  },
  'sharpe': {
    title: 'Sharpe Ratio',
    body: '위험(변동성) 대비 초과 수익률. 같은 수익률이라도 변동이 적을수록 Sharpe가 높음. 1 이상이면 양호, 2 이상이면 우수.',
    formula: '(연환산 수익률 − 무위험 수익률) / 연환산 변동성 (3.5% / 252거래일 가정)',
  },
  'mdd': {
    title: 'MDD (Maximum Drawdown)',
    body: '백테스트 중 자산곡선의 고점 대비 가장 크게 하락한 비율. "최악의 손실 구간"을 의미하며, MDD가 클수록 심리적·재정적 인내가 필요. 일반적으로 30% 이상이면 운용 어렵다고 봄.',
    formula: 'max(고점 − 저점) / 고점 × 100%',
  },
  'profitFactor': {
    title: 'PF (Profit Factor)',
    body: '총 수익 / 총 손실의 비율. 1.0 = 손익분기, 1.5 이상 양호, 2 이상 우수, 1 미만이면 전략이 손실 우위.',
    formula: '∑(수익 매매 손익) / ∑(|손실 매매 손익|)',
  },
  'rank': {
    title: '순위',
    body: '비교한 전략들을 총 수익률 내림차순으로 정렬한 순위. 1위가 최고 성과.',
  },
}

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

type SortKey = 'totalReturn' | 'buyHold' | 'winRate' | 'totalTrades' | 'sharpe' | 'mdd' | 'profitFactor'

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

  // 종목 분석 추천 상태
  const [recommendMode, setRecommendMode] = useState<RecommendationMode>('hybrid')
  const [recommending, setRecommending] = useState(false)
  const [recommendError, setRecommendError] = useState<string | null>(null)
  const [recommendResult, setRecommendResult] = useState<RecommendationResult | null>(null)

  // 상세 모달 — 클릭한 프리셋 ID
  const [detailPresetId, setDetailPresetId] = useState<string | null>(null)
  // 용어 설명 모달
  const [glossaryKey, setGlossaryKey] = useState<string | null>(null)
  // 결과 표 정렬: 기본은 수익률 내림차순
  const [sortKey, setSortKey] = useState<SortKey>('totalReturn')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

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

  const handleTickerSelect = (t: string, name?: string, m?: Market) => {
    setTicker(t)
    setTickerName(name || t)
    if (m && m !== market) {
      setMarket(m)
      setSelectedIds(new Set())
    }
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
    setResults(allResults)
    setSortKey('totalReturn')
    setSortDir('desc')
    setRunning(false)
  }

  const runRecommend = async () => {
    if (!ticker.trim()) return setRecommendError('먼저 종목을 선택해주세요')
    setRecommending(true)
    setRecommendError(null)
    setRecommendResult(null)
    try {
      const res = await fetch('/api/investment/recommend-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim(), market, mode: recommendMode }),
      })
      const json = await res.json()
      if (!res.ok || !json.data) {
        setRecommendError(json.error || '추천 실행 실패')
      } else {
        setRecommendResult(json.data as RecommendationResult)
      }
    } catch (err) {
      setRecommendError(err instanceof Error ? err.message : '네트워크 오류')
    } finally {
      setRecommending(false)
    }
  }

  const applyRecommendations = () => {
    if (!recommendResult) return
    const keys = recommendResult.recommendations.map(r => `preset:${r.presetId}`)
    setSelectedIds(new Set(keys))
  }

  /** 정렬된 결과 목록 — 헤더 클릭 시 sortKey/sortDir 변경 */
  const sortedResults = useMemo(() => {
    const arr = [...results]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      // 에러 결과는 항상 뒤로
      if (a.error && !b.error) return 1
      if (!a.error && b.error) return -1
      const av = getSortValue(a, sortKey)
      const bv = getSortValue(b, sortKey)
      if (av === bv) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return (av - bv) * dir
    })
    return arr
  }, [results, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      // 새 컬럼 클릭 시 기본 방향: MDD는 오름차순(낮을수록 좋음), 그 외는 내림차순
      setSortDir(key === 'mdd' ? 'asc' : 'desc')
    }
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
          {/* 종목 (국내·미국 통합 검색) */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">종목</label>
            <TickerSearch
              market="ALL"
              onSelect={handleTickerSelect}
              clearOnSelect={false}
            />
            {ticker && (
              <p className="text-xs text-at-text-secondary mt-1.5">
                선택됨:
                <span className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-bold ${
                  market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                }`}>{market === 'KR' ? '국내' : '미국'}</span>
                <span className="ml-1.5 font-mono font-semibold text-at-text">{ticker}</span>
                {tickerName && tickerName !== ticker && <span className="ml-2">({tickerName})</span>}
              </p>
            )}
          </div>

          {/* 기간 */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">백테스트 기간</label>
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
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

      {/* 종목 분석 → 전략 추천 */}
      <RecommendSection
        ticker={ticker}
        tickerName={tickerName}
        market={market}
        mode={recommendMode}
        onModeChange={setRecommendMode}
        running={recommending}
        error={recommendError}
        result={recommendResult}
        onRun={runRecommend}
        onApply={applyRecommendations}
        onOpenDetail={setDetailPresetId}
      />

      {/* 상세 정보 모달 */}
      {detailPresetId && (
        <PresetDetailModal presetId={detailPresetId} onClose={() => setDetailPresetId(null)} />
      )}

      {/* 용어 설명 모달 */}
      {glossaryKey && METRIC_GLOSSARY[glossaryKey] && (
        <GlossaryModal term={METRIC_GLOSSARY[glossaryKey]} onClose={() => setGlossaryKey(null)} />
      )}

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
                  onOpenDetail={setDetailPresetId}
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
                onOpenDetail={setDetailPresetId}
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
            <span className="text-xs text-at-text-secondary">
              {sortLabel(sortKey)} {sortDir === 'desc' ? '내림차순' : '오름차순'}
            </span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-at-border mb-4">
            <table className="w-full text-xs">
              <thead className="bg-at-surface-alt">
                <tr>
                  <th className="px-2 py-2 w-8"></th>
                  <GlossaryHeader label="순위" termKey="rank" align="left" onOpen={setGlossaryKey} />
                  <th className="px-3 py-2 text-left font-medium text-at-text-secondary">전략</th>
                  <SortableHeader label="수익률" termKey="totalReturn" sortKey="totalReturn" curKey={sortKey} dir={sortDir} onSort={handleSort} onGloss={setGlossaryKey} />
                  <SortableHeader label="B&H" termKey="buyHold" sortKey="buyHold" curKey={sortKey} dir={sortDir} onSort={handleSort} onGloss={setGlossaryKey} />
                  <SortableHeader label="승률" termKey="winRate" sortKey="winRate" curKey={sortKey} dir={sortDir} onSort={handleSort} onGloss={setGlossaryKey} />
                  <SortableHeader label="거래" termKey="totalTrades" sortKey="totalTrades" curKey={sortKey} dir={sortDir} onSort={handleSort} onGloss={setGlossaryKey} />
                  <SortableHeader label="Sharpe" termKey="sharpe" sortKey="sharpe" curKey={sortKey} dir={sortDir} onSort={handleSort} onGloss={setGlossaryKey} />
                  <SortableHeader label="MDD" termKey="mdd" sortKey="mdd" curKey={sortKey} dir={sortDir} onSort={handleSort} onGloss={setGlossaryKey} />
                  <SortableHeader label="PF" termKey="profitFactor" sortKey="profitFactor" curKey={sortKey} dir={sortDir} onSort={handleSort} onGloss={setGlossaryKey} />
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((r, i) => {
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
          {sortedResults.length >= 2 && sortedResults[0] && !sortedResults[0].error && (
            <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-amber-900 text-xs">
                  <p className="font-medium">{sortLabel(sortKey)} {sortDir === 'desc' ? '최상위' : '최하위'}: {sortedResults[0].strategyName}</p>
                  <p className="mt-0.5">
                    총 수익률 <span className="font-mono font-semibold">{sortedResults[0].metrics.totalReturn > 0 ? '+' : ''}{sortedResults[0].metrics.totalReturn.toFixed(2)}%</span>,
                    {' '}승률 {sortedResults[0].metrics.winRate.toFixed(1)}%, Sharpe {sortedResults[0].metrics.sharpeRatio.toFixed(2)}
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

/** 전략별 매매 내역 미니 표 — expandable row 안에 표시. 행 클릭 시 매매 근거 펼침. */
function TradesMiniTable({ trades }: { trades: BacktestTrade[] }) {
  const limit = 50
  const shown = trades.slice(0, limit)
  const [expandedTradeIdx, setExpandedTradeIdx] = useState<number | null>(null)

  return (
    <div className="overflow-x-auto rounded-lg border border-at-border bg-white">
      <table className="w-full text-[11px]">
        <thead className="bg-at-surface-alt">
          <tr className="text-at-text-secondary">
            <th className="px-2 py-1.5 w-6"></th>
            <th className="px-2 py-1.5 text-left font-medium">종목</th>
            <th className="px-2 py-1.5 text-left font-medium">진입일</th>
            <th className="px-2 py-1.5 text-left font-medium">청산일</th>
            <th className="px-2 py-1.5 text-right font-medium">진입가</th>
            <th className="px-2 py-1.5 text-right font-medium">청산가</th>
            <th className="px-2 py-1.5 text-right font-medium">수량</th>
            <th className="px-2 py-1.5 text-right font-medium">손익</th>
            <th className="px-2 py-1.5 text-right font-medium">수익률</th>
            <th className="px-2 py-1.5 text-right font-medium">보유일</th>
            <th className="px-2 py-1.5 text-left font-medium">청산 사유</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t, i) => {
            const hasSignals = !!(t.entrySignal || t.exitSignal)
            const isExpanded = expandedTradeIdx === i
            const exitReasonLabel = formatExitReasonLabel(t.exitSignal?.reason)
            return (
              <Fragment key={i}>
                <tr
                  className={`border-t border-at-border/60 ${hasSignals ? 'cursor-pointer hover:bg-at-surface-alt/60' : ''}`}
                  onClick={() => {
                    if (!hasSignals) return
                    setExpandedTradeIdx(prev => (prev === i ? null : i))
                  }}
                >
                  <td className="px-2 py-1.5 text-at-text-weak">
                    {hasSignals && (isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
                  </td>
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
                  <td className="px-2 py-1.5 text-at-text-secondary">
                    {exitReasonLabel && (
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${exitReasonClass(t.exitSignal?.reason)}`}>
                        {exitReasonLabel}
                      </span>
                    )}
                  </td>
                </tr>
                {isExpanded && hasSignals && (
                  <tr className="border-t border-at-border/40 bg-blue-50/30">
                    <td colSpan={11} className="px-3 py-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <SignalDetailBlock title="🟢 매수 근거" snapshot={t.entrySignal} accent="emerald" />
                        <SignalDetailBlock title="🔴 매도 근거" snapshot={t.exitSignal} accent="rose" />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
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

/** 매도 사유 한글 라벨 */
function formatExitReasonLabel(reason?: SignalSnapshotReason): string {
  switch (reason) {
    case 'signal': return '시그널'
    case 'stopLoss': return '손절'
    case 'takeProfit': return '익절'
    case 'maxHolding': return '최대보유'
    case 'forceClose': return '기간만료'
    default: return ''
  }
}

function exitReasonClass(reason?: SignalSnapshotReason): string {
  switch (reason) {
    case 'signal': return 'bg-blue-100 text-blue-700'
    case 'stopLoss': return 'bg-red-100 text-red-700'
    case 'takeProfit': return 'bg-emerald-100 text-emerald-700'
    case 'maxHolding': return 'bg-amber-100 text-amber-700'
    case 'forceClose': return 'bg-gray-100 text-gray-600'
    default: return 'bg-gray-100 text-gray-600'
  }
}

type SignalSnapshotReason = NonNullable<BacktestTrade['exitSignal']>['reason']

/** 매매 근거 상세 블록 — 매칭된 조건 + 지표 스냅샷 */
function SignalDetailBlock({
  title,
  snapshot,
  accent,
}: {
  title: string
  snapshot: BacktestTrade['entrySignal']
  accent: 'emerald' | 'rose'
}) {
  const borderClass = accent === 'emerald' ? 'border-emerald-200' : 'border-rose-200'
  const headerClass = accent === 'emerald' ? 'text-emerald-700' : 'text-rose-700'

  if (!snapshot) {
    return (
      <div className={`rounded-lg bg-white border ${borderClass} p-2.5`}>
        <p className={`text-[11px] font-semibold ${headerClass} mb-1`}>{title}</p>
        <p className="text-[10px] text-at-text-weak">신호 정보 없음 (이전 백테스트 데이터)</p>
      </div>
    )
  }

  const indicatorEntries = Object.entries(snapshot.indicators)
  return (
    <div className={`rounded-lg bg-white border ${borderClass} p-2.5`}>
      <p className={`text-[11px] font-semibold ${headerClass} mb-1.5`}>{title}</p>

      {/* 매칭된 조건 */}
      {snapshot.matchedConditions.length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] text-at-text-secondary mb-0.5">충족 조건</p>
          <ul className="space-y-0.5">
            {snapshot.matchedConditions.map((cond, idx) => (
              <li key={idx} className="text-[10.5px] font-mono text-at-text bg-at-surface-alt/60 rounded px-1.5 py-0.5">
                {cond}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 지표 스냅샷 */}
      {indicatorEntries.length > 0 && (
        <div>
          <p className="text-[10px] text-at-text-secondary mb-0.5">지표값 (전일 종가 기준)</p>
          <div className="flex flex-wrap gap-1">
            {indicatorEntries.map(([id, val]) => (
              <span key={id} className="text-[10px] font-mono bg-at-surface-alt rounded px-1.5 py-0.5">
                <span className="text-at-text-secondary">{id}:</span>{' '}
                <span className="text-at-text">{formatIndicatorValue(val)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function formatIndicatorValue(val: number | Record<string, number>): string {
  if (typeof val === 'number') return formatNum(val)
  return Object.entries(val)
    .map(([k, v]) => `${k}=${formatNum(v)}`)
    .join(', ')
}

function formatNum(n: number): string {
  if (!isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(4)
}

function SelectableCard({ item, selectedIds, onToggle, onOpenDetail }: {
  item: SelectableItem
  selectedIds: Set<string>
  onToggle: (key: string) => void
  onOpenDetail: (presetId: string) => void
}) {
  const isSelected = selectedIds.has(item.key)
  const orderIndex = isSelected ? Array.from(selectedIds).indexOf(item.key) : -1
  const color = orderIndex >= 0 ? COLORS[orderIndex % COLORS.length] : null
  // 프리셋 전략의 경우 상세 페이지 ID 추출 (key 형식: 'preset:<id>')
  const presetId = item.source === 'preset' ? item.key.replace(/^preset:/, '') : null
  return (
    <div
      className={`relative text-left p-3 rounded-xl border-2 transition-colors ${
        isSelected
          ? `${color?.border ?? 'border-at-accent'} ${color?.light ?? 'bg-at-accent-light'}`
          : 'border-at-border bg-at-surface hover:border-at-accent/50'
      }`}
    >
      <button onClick={() => onToggle(item.key)} className="text-left w-full">
        <div className="flex items-start justify-between gap-2 pr-7">
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
      {presetId && (
        <button
          onClick={e => { e.stopPropagation(); onOpenDetail(presetId) }}
          className="absolute top-2 right-2 p-1 rounded-full text-at-text-weak hover:text-at-accent hover:bg-at-bg transition-colors"
          title="전략 상세 설명"
          type="button"
        >
          <Info className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
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

// ============================================
// 종목 분석 → 전략 추천 섹션
// ============================================

const REGIME_LABELS: Record<MarketRegime, { label: string; color: string }> = {
  'strong-uptrend': { label: '강한 상승 추세', color: 'bg-red-100 text-red-700' },
  'weak-uptrend': { label: '약한 상승 추세', color: 'bg-orange-100 text-orange-700' },
  'sideways': { label: '횡보', color: 'bg-yellow-100 text-yellow-700' },
  'high-volatility': { label: '변동성 확대', color: 'bg-purple-100 text-purple-700' },
  'downtrend': { label: '하락 추세', color: 'bg-blue-100 text-blue-700' },
  'oversold-bounce': { label: '과매도 반등', color: 'bg-emerald-100 text-emerald-700' },
  'overbought': { label: '과매수', color: 'bg-pink-100 text-pink-700' },
}

function RecommendSection({
  ticker, tickerName, market, mode, onModeChange,
  running, error, result, onRun, onApply, onOpenDetail,
}: {
  ticker: string
  tickerName: string
  market: Market
  mode: RecommendationMode
  onModeChange: (m: RecommendationMode) => void
  running: boolean
  error: string | null
  result: RecommendationResult | null
  onRun: () => void
  onApply: () => void
  onOpenDetail: (presetId: string) => void
}) {
  const modes: { value: RecommendationMode; label: string; desc: string; eta: string }[] = [
    { value: 'rule', label: '룰 기반', desc: '시장 단계 분류 + 매칭만', eta: '~1초' },
    { value: 'hybrid', label: '하이브리드 (추천)', desc: '룰로 5개 후보 → 미니 백테스트 검증', eta: '~10~20초' },
    { value: 'backtest', label: '전체 백테스트', desc: '모든 프리셋 6개월 백테스트', eta: '~30초+' },
  ]

  return (
    <section className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl shadow-sm border border-purple-200 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Wand2 className="w-5 h-5 text-purple-600" />
        <h2 className="font-semibold text-at-text">🔍 이 종목에 적합한 전략 추천</h2>
      </div>
      <p className="text-xs text-at-text-secondary mb-3">
        선택한 종목 <span className="font-mono font-semibold text-at-text">{ticker || '—'}</span>
        {tickerName && tickerName !== ticker && <span className="ml-1">({tickerName})</span>}
        의 최근 가격 흐름을 분석하여 추세/변동성/모멘텀 기반으로 적합한 전략을 추천합니다.
      </p>

      {/* 모드 선택 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
        {modes.map(m => (
          <button
            key={m.value}
            onClick={() => onModeChange(m.value)}
            disabled={running}
            className={`text-left p-2.5 rounded-xl border-2 transition-colors ${
              mode === m.value ? 'border-purple-500 bg-purple-50' : 'border-at-border bg-white hover:border-purple-300'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm text-at-text">{m.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-at-bg text-at-text-weak">{m.eta}</span>
            </div>
            <p className="text-[11px] text-at-text-secondary mt-0.5">{m.desc}</p>
          </button>
        ))}
      </div>

      <button
        onClick={onRun}
        disabled={running || !ticker.trim()}
        className="w-full px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
        {running ? '분석 중...' : `${market === 'KR' ? '국내' : '미국'} 시장 — 추천 받기`}
      </button>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
          <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 분석 결과 */}
      {result && (
        <div className="mt-4 space-y-3">
          {/* 시장 분석 */}
          <div className="bg-white rounded-xl p-3 border border-at-border">
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-sm font-semibold text-at-text">📈 시장 분석 ({result.analysis.asOf} 기준)</p>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${REGIME_LABELS[result.analysis.regime].color}`}>
                {REGIME_LABELS[result.analysis.regime].label}
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <Metric label="vs SMA200" value={`${result.analysis.metrics.priceVsSMA200 > 0 ? '+' : ''}${result.analysis.metrics.priceVsSMA200.toFixed(1)}%`} />
              <Metric label="ADX(14)" value={result.analysis.metrics.adx.toFixed(0)} />
              <Metric label="RSI(14)" value={result.analysis.metrics.rsi.toFixed(0)} />
              <Metric label="ATR%" value={`${result.analysis.metrics.atrPercent.toFixed(2)}%`} />
              <Metric label="BB 폭" value={`${result.analysis.metrics.bbWidth.toFixed(1)}%`} />
              <Metric label="1M 수익률" value={`${result.analysis.metrics.momentum1M > 0 ? '+' : ''}${result.analysis.metrics.momentum1M.toFixed(1)}%`} />
              <Metric label="6M 수익률" value={`${result.analysis.metrics.momentum6M > 0 ? '+' : ''}${result.analysis.metrics.momentum6M.toFixed(1)}%`} />
            </div>
            {result.analysis.reasoning.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-[11px] text-at-text-secondary">
                {result.analysis.reasoning.map((r, i) => <li key={i}>• {r}</li>)}
              </ul>
            )}
          </div>

          {/* 추천 전략 카드들 */}
          <div className="space-y-2">
            <p className="text-sm font-semibold text-at-text">⭐ 추천 전략 Top {result.recommendations.length}</p>
            {result.recommendations.map((rec, i) => (
              <div key={rec.presetId} className="bg-white rounded-xl p-3 border border-at-border">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-purple-600 text-white text-xs font-bold">
                      {i + 1}
                    </span>
                    <button
                      onClick={() => onOpenDetail(rec.presetId)}
                      className="font-semibold text-sm text-at-text hover:text-purple-600 hover:underline inline-flex items-center gap-1"
                    >
                      {rec.presetName}
                      <Info className="w-3 h-3 text-at-text-weak" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-at-text-weak">적합도</span>
                    <span className="text-base font-bold text-purple-600 font-mono">{rec.score.toFixed(0)}</span>
                  </div>
                </div>

                {rec.backtest && (
                  <div className="flex flex-wrap gap-2 mb-2 text-[11px]">
                    <span className={`px-2 py-0.5 rounded ${rec.backtest.totalReturn >= 0 ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
                      6M: {rec.backtest.totalReturn > 0 ? '+' : ''}{rec.backtest.totalReturn.toFixed(2)}%
                    </span>
                    <span className="px-2 py-0.5 rounded bg-at-surface-alt text-at-text-secondary">
                      거래 {rec.backtest.totalTrades}건
                    </span>
                    {rec.backtest.totalTrades > 0 && (
                      <>
                        <span className="px-2 py-0.5 rounded bg-at-surface-alt text-at-text-secondary">
                          승률 {rec.backtest.winRate.toFixed(0)}%
                        </span>
                        <span className="px-2 py-0.5 rounded bg-at-surface-alt text-at-text-secondary">
                          Sharpe {rec.backtest.sharpeRatio.toFixed(2)}
                        </span>
                      </>
                    )}
                  </div>
                )}

                <ul className="space-y-0.5 text-[11px] text-at-text-secondary">
                  {rec.reasons.map((r, j) => (
                    <li key={j} className="flex items-start gap-1">
                      <CheckCircle2 className="w-3 h-3 text-purple-400 flex-shrink-0 mt-0.5" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <button
            onClick={onApply}
            className="w-full px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors inline-flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            추천대로 비교 전략 자동 선택
          </button>
        </div>
      )}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-at-surface-alt rounded-lg px-2 py-1.5">
      <p className="text-[10px] text-at-text-weak">{label}</p>
      <p className="text-sm font-mono font-semibold text-at-text">{value}</p>
    </div>
  )
}

// ============================================
// 프리셋 상세 모달
// ============================================

function PresetDetailModal({ presetId, onClose }: { presetId: string; onClose: () => void }) {
  // ESC로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    // body 스크롤 잠금
    const orig = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = orig
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-at-surface rounded-2xl shadow-2xl border border-at-border my-4"
        onClick={e => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white border border-at-border text-at-text-secondary hover:text-at-text hover:bg-at-bg shadow-sm"
          title="닫기 (ESC)"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-5 sm:p-6">
          <PresetDetailView presetId={presetId} variant="modal" />
        </div>
      </div>
    </div>
  )
}

// ============================================
// 용어 설명 헤더 + 모달
// ============================================

/** 정렬 + 용어 설명 가능한 헤더 셀 */
function SortableHeader({
  label, termKey, sortKey, curKey, dir, onSort, onGloss,
}: {
  label: string
  termKey: string
  sortKey: SortKey
  curKey: SortKey
  dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
  onGloss: (k: string) => void
}) {
  const isActive = curKey === sortKey
  const Icon = isActive ? (dir === 'desc' ? ArrowDown : ArrowUp) : ArrowUpDown
  return (
    <th className="px-3 py-2 font-medium text-at-text-secondary text-right">
      <span className="inline-flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => onSort(sortKey)}
          className={`inline-flex items-center gap-0.5 hover:text-at-accent transition-colors ${isActive ? 'text-at-accent font-semibold' : ''}`}
          title={`${label} 기준 정렬 (현재: ${isActive ? (dir === 'desc' ? '내림차순' : '오름차순') : '비활성'})`}
        >
          {label}
          <Icon className={`w-3 h-3 ${isActive ? '' : 'opacity-50'}`} />
        </button>
        <button
          onClick={() => onGloss(termKey)}
          className="p-0.5 rounded-full text-at-text-weak hover:text-at-accent hover:bg-at-bg transition-colors"
          title="용어 설명"
          type="button"
        >
          <Info className="w-3 h-3" />
        </button>
      </span>
    </th>
  )
}

function sortLabel(k: SortKey): string {
  return ({
    'totalReturn': '수익률',
    'buyHold': 'B&H',
    'winRate': '승률',
    'totalTrades': '거래',
    'sharpe': 'Sharpe',
    'mdd': 'MDD',
    'profitFactor': 'PF',
  } as Record<SortKey, string>)[k]
}

function GlossaryHeader({ label, termKey, align, onOpen }: {
  label: string
  termKey: string
  align: 'left' | 'right'
  onOpen: (key: string) => void
}) {
  const alignClass = align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
  return (
    <th className={`px-3 py-2 font-medium text-at-text-secondary ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <span className={`inline-flex items-center gap-1 ${alignClass}`}>
        {label}
        <button
          onClick={() => onOpen(termKey)}
          className="p-0.5 rounded-full text-at-text-weak hover:text-at-accent hover:bg-at-bg transition-colors"
          title="용어 설명"
          type="button"
        >
          <Info className="w-3 h-3" />
        </button>
      </span>
    </th>
  )
}

function GlossaryModal({
  term,
  onClose,
}: {
  term: { title: string; body: string; formula?: string }
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-at-border"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-full text-at-text-secondary hover:text-at-text hover:bg-at-bg"
          title="닫기 (ESC)"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-at-accent" />
            <h3 className="text-base font-bold text-at-text">{term.title}</h3>
          </div>
          <p className="text-sm text-at-text leading-relaxed">{term.body}</p>
          {term.formula && (
            <div className="mt-3 p-3 rounded-xl bg-at-surface-alt border border-at-border">
              <p className="text-[10px] uppercase tracking-wide text-at-text-weak font-semibold mb-1">계산식</p>
              <p className="font-mono text-xs text-at-text">{term.formula}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** 결과 항목에서 SortKey에 해당하는 비교용 숫자 추출 (없으면 null) */
function getSortValue(r: BacktestResultItem, key: SortKey): number | null {
  if (r.error || !r.metrics) return null
  switch (key) {
    case 'totalReturn': return r.metrics.totalReturn ?? null
    case 'buyHold': return r.buyHold?.totalReturn ?? null
    case 'winRate': return r.metrics.winRate ?? null
    case 'totalTrades': return r.metrics.totalTrades ?? null
    case 'sharpe': return r.metrics.sharpeRatio ?? null
    case 'mdd': return r.metrics.maxDrawdown ?? null
    case 'profitFactor': return r.metrics.profitFactor ?? null
    default: return null
  }
}

function emptyMetrics(): BacktestMetrics {
  return {
    totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0, sharpeRatio: 0,
    winRate: 0, totalTrades: 0, profitFactor: 0,
    avgWin: 0, avgLoss: 0, maxConsecutiveWins: 0, maxConsecutiveLosses: 0, avgHoldingDays: 0,
  }
}
