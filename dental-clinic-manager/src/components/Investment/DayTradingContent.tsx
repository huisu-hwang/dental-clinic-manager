'use client'

/**
 * 단타(Day Trading) 모듈 메인 콘텐츠
 *
 * - 단타 프리셋 카탈로그 (3종)
 * - 종목/시장/timeframe/기간 선택
 * - 분봉 백테스트 즉시 실행 + 결과 표시
 *
 * 일봉 swing 시스템과 별도로 동작 (별도 API: /api/investment/daytrading-backtest).
 */

import { useState, useMemo } from 'react'
import { Zap, Play, Loader2, Target, TrendingDown, TrendingUp, AlertCircle, CheckCircle2, X } from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'
import type { Market, BacktestMetrics, BacktestTrade, EquityCurvePoint, PresetStrategy } from '@/types/investment'

type Timeframe = '1m' | '5m' | '15m'

interface BacktestResponse {
  data?: {
    metrics: BacktestMetrics
    trades: BacktestTrade[]
    equityCurve: EquityCurvePoint[]
    buyHold: { totalReturn: number; finalValue: number }
    meta: { timeframe: Timeframe; totalBars: number; firstBar: string; lastBar: string }
  }
  error?: string
}

const DAY_TRADING_PRESET_IDS = ['day-vwap-bounce', 'day-orb-breakout', 'day-closing-pressure']

export default function DayTradingContent() {
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DAY_TRADING_PRESET_IDS[0])
  const [ticker, setTicker] = useState('AAPL')
  const [tickerName, setTickerName] = useState('Apple Inc.')
  const [market, setMarket] = useState<Market>('US')
  const [timeframe, setTimeframe] = useState<Timeframe>('5m')
  const [initialCapital, setInitialCapital] = useState(10_000_000)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BacktestResponse['data'] | null>(null)

  const dayTradingPresets = useMemo(
    () => PRESET_STRATEGIES.filter(p => DAY_TRADING_PRESET_IDS.includes(p.id)),
    []
  )
  const selectedPreset = useMemo<PresetStrategy | undefined>(
    () => dayTradingPresets.find(p => p.id === selectedPresetId),
    [dayTradingPresets, selectedPresetId]
  )

  const runBacktest = async () => {
    if (!selectedPreset) return setError('프리셋을 선택해주세요')
    if (!ticker.trim()) return setError('종목 코드를 입력해주세요')

    setRunning(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/investment/daytrading-backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: {
            indicators: selectedPreset.indicators,
            buyConditions: selectedPreset.buyConditions,
            sellConditions: selectedPreset.sellConditions,
            riskSettings: selectedPreset.riskSettings,
          },
          ticker: ticker.trim(),
          market,
          timeframe,
          initialCapital,
        }),
      })
      const json: BacktestResponse = await res.json()
      if (!res.ok) {
        setError(json.error || '백테스트 실패')
      } else if (json.data) {
        setResult(json.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '네트워크 오류')
    } finally {
      setRunning(false)
    }
  }

  const handleTickerSelect = (t: string, name?: string) => {
    setTicker(t)
    setTickerName(name || t)
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2">
          <Zap className="w-6 h-6 text-amber-500" />
          <h1 className="text-xl font-bold text-at-text">단타 (Day Trading)</h1>
        </div>
        <p className="text-sm text-at-text-secondary mt-1">
          분봉 데이터(1~15분봉)로 일중 매매 전략을 백테스트합니다. 장 마감 시 자동 청산되며, 슬리피지가 강화 적용됩니다.
        </p>
      </div>

      {/* 안내 박스 */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
        <div className="flex gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-amber-900">
            <p className="font-medium mb-1">단타 모듈 한계</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-800 text-xs">
              <li>1분봉은 최근 7일, 5분봉/15분봉은 최근 60일까지만 조회 가능 (Yahoo Finance 정책)</li>
              <li>한국 시장은 0.49% 왕복 수수료 + 슬리피지로 단타 마진이 작음</li>
              <li>표본이 적으므로 단일 백테스트 결과는 참고용 - 다양한 종목/기간 시도 권장</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 프리셋 선택 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <h2 className="font-semibold text-at-text mb-3">📋 단타 전략 프리셋</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {dayTradingPresets.map(p => {
            const isSelected = selectedPresetId === p.id
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPresetId(p.id)}
                className={`text-left p-4 rounded-xl border-2 transition-colors ${
                  isSelected
                    ? 'border-at-accent bg-at-accent-light'
                    : 'border-at-border bg-at-surface hover:border-at-accent/50'
                }`}
              >
                <p className="font-medium text-at-text text-sm">{p.name}</p>
                <p className="text-xs text-at-text-secondary mt-1.5 line-clamp-3">{p.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.indicators.map(ind => (
                    <span key={ind.id} className="text-[10px] px-1.5 py-0.5 rounded bg-at-bg text-at-text-weak font-mono">
                      {ind.type}
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* 백테스트 폼 */}
      <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
        <h2 className="font-semibold text-at-text mb-3">🔬 백테스트 실행</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 시장 */}
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">시장</label>
            <div className="flex gap-2">
              {(['US', 'KR'] as Market[]).map(m => (
                <button
                  key={m}
                  onClick={() => setMarket(m)}
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

          {/* timeframe */}
          <div>
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">분봉 단위</label>
            <div className="flex gap-2">
              {(['1m', '5m', '15m'] as Timeframe[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                    timeframe === t
                      ? 'bg-at-accent text-white'
                      : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-bg'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* 종목 검색 */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-at-text-secondary mb-1.5">종목 검색</label>
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

          {/* 초기자본 */}
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

          {/* 실행 */}
          <div className="flex items-end">
            <button
              onClick={runBacktest}
              disabled={running || !ticker.trim() || !selectedPreset}
              className="w-full px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? '실행 중...' : '백테스트 실행'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-sm text-red-800">
            <X className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
      </section>

      {/* 결과 */}
      {result && (
        <section className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-at-text">📊 백테스트 결과</h2>
            <div className="text-xs text-at-text-secondary">
              {result.meta.totalBars}봉 · {result.meta.firstBar?.slice(0, 16)} ~ {result.meta.lastBar?.slice(0, 16)}
            </div>
          </div>

          {/* 메트릭 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <MetricCard
              label="총 수익률"
              value={`${(result.metrics.totalReturn * 100).toFixed(2)}%`}
              positive={result.metrics.totalReturn > 0}
              icon={result.metrics.totalReturn > 0 ? TrendingUp : TrendingDown}
            />
            <MetricCard
              label="Buy & Hold"
              value={`${(result.buyHold.totalReturn * 100).toFixed(2)}%`}
              positive={result.buyHold.totalReturn > 0}
            />
            <MetricCard
              label="승률"
              value={`${(result.metrics.winRate * 100).toFixed(1)}%`}
              positive={result.metrics.winRate >= 0.5}
            />
            <MetricCard
              label="총 거래"
              value={`${result.metrics.totalTrades}회`}
            />
            <MetricCard
              label="Sharpe Ratio"
              value={result.metrics.sharpeRatio.toFixed(2)}
              positive={result.metrics.sharpeRatio > 1}
            />
            <MetricCard
              label="Max Drawdown"
              value={`${(result.metrics.maxDrawdown * 100).toFixed(2)}%`}
              positive={false}
            />
            <MetricCard
              label="Profit Factor"
              value={result.metrics.profitFactor.toFixed(2)}
              positive={result.metrics.profitFactor > 1}
            />
            <MetricCard
              label="평균 보유 봉수"
              value={`${result.metrics.avgHoldingDays.toFixed(1)}봉`}
            />
          </div>

          {/* 거래 내역 */}
          {result.trades.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-at-border">
              <table className="w-full text-xs">
                <thead className="bg-at-surface-alt">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-at-text-secondary">종목</th>
                    <th className="px-3 py-2 text-left font-medium text-at-text-secondary">진입</th>
                    <th className="px-3 py-2 text-left font-medium text-at-text-secondary">청산</th>
                    <th className="px-3 py-2 text-right font-medium text-at-text-secondary">수량</th>
                    <th className="px-3 py-2 text-right font-medium text-at-text-secondary">진입가</th>
                    <th className="px-3 py-2 text-right font-medium text-at-text-secondary">청산가</th>
                    <th className="px-3 py-2 text-right font-medium text-at-text-secondary">손익</th>
                    <th className="px-3 py-2 text-right font-medium text-at-text-secondary">%</th>
                    <th className="px-3 py-2 text-right font-medium text-at-text-secondary">보유봉수</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.slice(0, 50).map((t, i) => (
                    <tr key={i} className="border-t border-at-border">
                      <td className="px-3 py-2 font-mono font-semibold text-at-text">{t.ticker}</td>
                      <td className="px-3 py-2 font-mono text-at-text-secondary">{t.entryDate.slice(5, 16)}</td>
                      <td className="px-3 py-2 font-mono text-at-text-secondary">{t.exitDate.slice(5, 16)}</td>
                      <td className="px-3 py-2 text-right font-mono">{t.quantity}</td>
                      <td className="px-3 py-2 text-right font-mono">{t.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono">{t.exitPrice.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${t.pnl > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.pnl > 0 ? '+' : ''}{t.pnl.toFixed(0)}
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${t.pnlPercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {t.pnlPercent > 0 ? '+' : ''}{(t.pnlPercent * 100).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{t.holdingDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.trades.length > 50 && (
                <p className="px-3 py-2 text-xs text-at-text-secondary border-t border-at-border bg-at-surface-alt">
                  최근 50건만 표시 (총 {result.trades.length}건)
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-8 text-at-text-secondary text-sm">
              <Target className="w-8 h-8 mx-auto mb-2 opacity-30" />
              해당 기간에 매수 시그널이 발생하지 않았습니다. 다른 종목/프리셋을 시도해보세요.
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  positive,
  icon: Icon,
}: {
  label: string
  value: string
  positive?: boolean
  icon?: React.ElementType
}) {
  const colorClass =
    positive === undefined
      ? 'text-at-text'
      : positive
      ? 'text-green-600'
      : 'text-red-600'
  return (
    <div className="rounded-xl border border-at-border bg-at-surface p-3">
      <div className="flex items-center gap-1.5 text-xs text-at-text-secondary mb-1">
        {Icon && <Icon className="w-3 h-3" />}
        {positive === true && <CheckCircle2 className="w-3 h-3 text-green-500" />}
        {label}
      </div>
      <div className={`text-base font-semibold font-mono ${colorClass}`}>{value}</div>
    </div>
  )
}
