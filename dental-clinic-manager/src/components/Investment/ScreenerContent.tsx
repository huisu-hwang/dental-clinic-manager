'use client'

/**
 * 전략 부합 종목 스크리너
 *
 * 사용자가 전략(저장 또는 프리셋)을 선택하고 기준일/종목 풀을 정하면,
 * 그 시점에 매수 조건을 충족한 종목들을 표시.
 */

import { useState, useEffect, useCallback, Fragment } from 'react'
import { Search, Loader2, AlertCircle, Sparkles, User, X, CheckCircle2, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import PresetDetailView from '@/components/Investment/PresetDetailView'
import type { InvestmentStrategy, Market, ConditionGroup, IndicatorConfig } from '@/types/investment'

const DAYTRADING_PRESET_IDS = new Set(['day-vwap-bounce', 'day-orb-breakout', 'day-closing-pressure'])

type UniverseId = 'KR_TOP' | 'US_TOP' | 'ALL'

interface ScreenerMatch {
  ticker: string
  market: Market
  name: string
  asOfDate: string
  price: number
  matchedConditions: string[]
  indicators: Record<string, number | Record<string, number>>
}

interface ScreenerResult {
  strategyName: string
  asOfDate: string
  universe: UniverseId
  universeLabel: string
  evaluated: number
  total: number
  matches: ScreenerMatch[]
  failed: { ticker: string; market: Market; reason: string }[]
}

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
  { id: 'KR_TOP', label: '국내 시총 상위', eta: '~20초', desc: '국내 70개 종목 (기본)' },
  { id: 'US_TOP', label: '미국 시총 상위', eta: '~20초', desc: '미국 70개 종목' },
  { id: 'ALL', label: '전체 (KR + US)', eta: '~40초', desc: '국내 + 미국 약 140개' },
]

export default function ScreenerContent() {
  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [loadingStrategies, setLoadingStrategies] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [universe, setUniverse] = useState<UniverseId>('KR_TOP')
  const [asOfDate, setAsOfDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ScreenerResult | null>(null)
  const [detailPresetId, setDetailPresetId] = useState<string | null>(null)
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set())

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
  const selected = allItems.find(it => it.key === selectedKey)

  const runScreener = async () => {
    if (!selected) return setError('전략을 선택해주세요')
    setRunning(true)
    setError(null)
    setResult(null)

    const body: Record<string, unknown> = { asOfDate, universe }
    if (selected.source === 'user') body.strategyId = selected.strategyId
    else body.preset = selected.preset

    try {
      const res = await fetch('/api/investment/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok || !json.data) {
        setError(json.error || '스크리너 실행 실패')
      } else {
        setResult(json.data as ScreenerResult)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류')
    } finally {
      setRunning(false)
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

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <div className="flex items-center gap-2">
          <Search className="w-6 h-6 text-purple-500" />
          <h1 className="text-xl font-bold text-at-text">전략 부합 종목 스크리너</h1>
        </div>
        <p className="text-sm text-at-text-secondary mt-1">
          선택한 전략의 매수 조건을 기준일 시점에서 충족하는 종목을 찾아냅니다.
        </p>
      </div>

      {/* 1. 전략 선택 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <h2 className="font-semibold text-at-text mb-3">📋 1. 전략 선택</h2>

        {/* 내 전략 */}
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
                  selected={selectedKey === item.key}
                  onSelect={() => setSelectedKey(item.key)}
                  onOpenDetail={setDetailPresetId}
                />
              ))}
            </div>
          </div>
        )}

        {/* 프리셋 */}
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
                  selected={selectedKey === item.key}
                  onSelect={() => setSelectedKey(item.key)}
                  onOpenDetail={setDetailPresetId}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 2. 기준일 / 종목 풀 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <h2 className="font-semibold text-at-text mb-3">⚙️ 2. 기준일 및 종목 풀</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
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
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">종목 풀</label>
            <div className="grid grid-cols-3 gap-2">
              {UNIVERSE_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUniverse(opt.id)}
                  disabled={running}
                  className={`text-left p-2.5 rounded-xl border-2 transition-colors ${
                    universe === opt.id ? 'border-purple-500 bg-purple-50' : 'border-at-border bg-white hover:border-purple-300'
                  } disabled:opacity-50`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-at-text">{opt.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-at-bg text-at-text-weak">{opt.eta}</span>
                  </div>
                  <p className="text-[11px] text-at-text-secondary mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={runScreener}
          disabled={running || !selected}
          className="mt-4 w-full px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {running
            ? `스캔 중... (선택한 종목 ${UNIVERSE_OPTIONS.find(o => o.id === universe)?.desc.split(' ').pop()} 평가)`
            : selected ? `'${selected.name}' 매수 조건으로 스캔` : '전략을 먼저 선택하세요'}
        </button>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
            <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* 3. 결과 */}
      {result && (
        <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="font-semibold text-at-text">
              🎯 매수 조건 충족 종목 ({result.matches.length}건 / {result.evaluated}/{result.total} 평가)
            </h2>
            <div className="flex items-center gap-2 text-xs text-at-text-secondary">
              <span>전략: <span className="font-semibold text-at-text">{result.strategyName}</span></span>
              <span>·</span>
              <span>기준일: <span className="font-mono">{result.asOfDate}</span></span>
              <span>·</span>
              <span>{result.universeLabel}</span>
            </div>
          </div>

          {result.matches.length === 0 ? (
            <div className="rounded-xl border border-dashed border-at-border bg-at-surface-alt p-8 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-at-text-weak mb-2" />
              <p className="text-sm text-at-text-secondary">
                기준일에 매수 조건을 충족한 종목이 없습니다.
              </p>
              <p className="text-xs text-at-text-weak mt-1">
                다른 기준일이나 종목 풀로 다시 시도해보세요.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-at-border">
              <table className="w-full text-xs">
                <thead className="bg-at-surface-alt">
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
                  {result.matches.map(m => {
                    const key = `${m.market}:${m.ticker}`
                    const expanded = expandedTickers.has(key)
                    return (
                      <Fragment key={key}>
                        <tr
                          className="border-t border-at-border hover:bg-at-surface-alt cursor-pointer"
                          onClick={() => toggleExpand(key)}
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

          {result.failed.length > 0 && (
            <div className="mt-3 text-xs text-at-text-weak">
              <details>
                <summary className="cursor-pointer hover:text-at-text">
                  평가 실패 {result.failed.length}건 (펼치기)
                </summary>
                <ul className="mt-2 space-y-0.5 ml-4">
                  {result.failed.slice(0, 10).map((f, i) => (
                    <li key={i}>
                      [{f.market}] {f.ticker} — {f.reason}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-[11px] text-at-text-weak">
            <Info className="w-3 h-3" />
            <span>각 종목 행 클릭 시 충족 조건과 지표값 상세 펼침. 종목명 클릭 시 비교 페이지로 이동하여 백테스트 가능.</span>
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

function StrategyCard({ item, selected, onSelect, onOpenDetail }: {
  item: SelectableItem
  selected: boolean
  onSelect: () => void
  onOpenDetail: (id: string) => void
}) {
  const presetId = item.source === 'preset' ? item.key.replace(/^preset:/, '') : null
  return (
    <div
      className={`relative p-3 rounded-xl border-2 transition-colors ${
        selected ? 'border-purple-500 bg-purple-50' : 'border-at-border bg-at-surface hover:border-purple-300'
      }`}
    >
      <button onClick={onSelect} className="w-full text-left pr-7">
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

