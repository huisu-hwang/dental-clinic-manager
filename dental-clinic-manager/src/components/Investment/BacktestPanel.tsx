'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Play, Loader2, TrendingUp, TrendingDown,
  BarChart3, Award, Clock, Plus, X, Trophy, ArrowLeft,
} from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import type { InvestmentStrategy, BacktestMetrics, BacktestTrade, EquityCurvePoint, Market } from '@/types/investment'

interface BuyHoldData {
  totalReturn: number
  annualizedReturn: number
  equityCurve: EquityCurvePoint[]
}

interface BacktestResultData {
  ticker: string
  tickerName?: string
  market: Market
  metrics: BacktestMetrics
  trades: BacktestTrade[]
  equityCurve: EquityCurvePoint[]
  buyHold?: BuyHoldData
}

interface TickerEntry {
  ticker: string
  name: string
  market: Market
}

interface BacktestPanelProps {
  strategyId: string
  onBack: () => void
}

export default function BacktestPanel({ strategyId, onBack }: BacktestPanelProps) {
  const [strategy, setStrategy] = useState<InvestmentStrategy | null>(null)
  const [loading, setLoading] = useState(true)
  const [runningTickers, setRunningTickers] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<BacktestResultData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selectedResultIdx, setSelectedResultIdx] = useState<number | null>(null)

  const [tickers, setTickers] = useState<TickerEntry[]>([])
  const [addingMarket, setAddingMarket] = useState<Market>('KR')

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [initialCapital, setInitialCapital] = useState(10_000_000)

  const loadStrategy = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      const found = (json.data || []).find((s: InvestmentStrategy) => s.id === strategyId)
      if (found) setStrategy(found)
    } catch {
      console.error('전략 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [strategyId])

  useEffect(() => {
    loadStrategy()
    const end = new Date()
    const start = new Date()
    start.setFullYear(start.getFullYear() - 1)
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }, [loadStrategy])

  const addTicker = (ticker: string, name?: string) => {
    if (!ticker.trim()) return
    const upperTicker = ticker.trim().toUpperCase()
    if (tickers.some(t => t.ticker === upperTicker && t.market === addingMarket)) return
    setTickers(prev => [...prev, { ticker: upperTicker, name: name || upperTicker, market: addingMarket }])
  }

  const removeTicker = (idx: number) => {
    setTickers(prev => prev.filter((_, i) => i !== idx))
  }

  const runAllBacktests = async () => {
    if (tickers.length === 0) { setError('종목을 추가해주세요'); return }
    if (!startDate || !endDate) { setError('기간을 설정해주세요'); return }

    setError(null)
    setResults([])
    setSelectedResultIdx(null)

    const allTickers = new Set(tickers.map(t => t.ticker))
    setRunningTickers(allTickers)

    const promises = tickers.map(async (entry) => {
      try {
        const res = await fetch('/api/investment/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ strategyId, ticker: entry.ticker, market: entry.market, startDate, endDate, initialCapital }),
        })
        const json = await res.json()
        if (!res.ok) return { ticker: entry.ticker, error: json.error }
        const data = json.data
        return {
          ticker: entry.ticker,
          tickerName: entry.name,
          market: entry.market,
          metrics: data.metrics || data.full_metrics,
          trades: data.trades || [],
          equityCurve: data.equityCurve || data.equity_curve || [],
          buyHold: data.buyHold || data.buy_hold || undefined,
        }
      } catch {
        return { ticker: entry.ticker, error: '네트워크 오류' }
      } finally {
        setRunningTickers(prev => { const next = new Set(prev); next.delete(entry.ticker); return next })
      }
    })

    const settled = await Promise.all(promises)
    const successes: BacktestResultData[] = []
    const errors: string[] = []
    for (const result of settled) {
      if ('error' in result && result.error) errors.push(`${result.ticker}: ${result.error}`)
      else if ('metrics' in result && result.metrics) successes.push(result as BacktestResultData)
    }
    successes.sort((a, b) => b.metrics.totalReturn - a.metrics.totalReturn)
    setResults(successes)
    if (successes.length > 0) setSelectedResultIdx(0)
    if (errors.length > 0) setError(errors.join('\n'))
  }

  const isRunning = runningTickers.size > 0

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
      </div>
    )
  }

  if (!strategy) {
    return (
      <div className="text-center py-20 text-at-text-weak">
        <p>전략을 찾을 수 없습니다</p>
        <button onClick={onBack} className="text-at-accent text-sm mt-2 inline-block">
          전략 목록으로 돌아가기
        </button>
      </div>
    )
  }

  const selectedResult = selectedResultIdx !== null ? results[selectedResultIdx] : null

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg hover:bg-at-surface-alt transition-colors"
          title="전략 목록으로 돌아가기"
        >
          <ArrowLeft className="w-5 h-5 text-at-text-secondary" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-at-text">백테스트</h1>
          <p className="text-sm text-at-text-secondary mt-0.5">{strategy.name}</p>
        </div>
      </div>

      {/* 종목 추가 */}
      <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5 space-y-4">
        <h2 className="font-semibold text-at-text">종목 선택</h2>
        <div className="flex items-center gap-2">
          <select
            value={addingMarket}
            onChange={e => setAddingMarket(e.target.value as Market)}
            className="px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent w-24"
          >
            <option value="KR">국내</option>
            <option value="US">미국</option>
          </select>
          <TickerSearch
            value=""
            onChange={(ticker, name) => { if (ticker) addTicker(ticker, name) }}
            market={addingMarket}
            className="flex-1"
          />
        </div>

        {tickers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tickers.map((t, i) => (
              <span key={`${t.ticker}-${t.market}-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-at-bg text-sm">
                <span className={`px-1 py-0.5 rounded text-[10px] font-bold ${t.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                  {t.market}
                </span>
                <span className="font-mono font-semibold text-at-text">{t.ticker}</span>
                {t.name !== t.ticker && <span className="text-at-text-secondary text-xs">{t.name}</span>}
                <button onClick={() => removeTicker(i)} className="text-at-text-weak hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-at-text-weak mr-1">빠른 추가:</span>
          {[
            { ticker: '005930', name: '삼성전자', market: 'KR' as Market },
            { ticker: '000660', name: 'SK하이닉스', market: 'KR' as Market },
            { ticker: '035420', name: 'NAVER', market: 'KR' as Market },
            { ticker: 'AAPL', name: 'Apple', market: 'US' as Market },
            { ticker: 'MSFT', name: 'Microsoft', market: 'US' as Market },
            { ticker: 'NVDA', name: 'NVIDIA', market: 'US' as Market },
          ].map(q => (
            <button
              key={`${q.ticker}-${q.market}`}
              onClick={() => { if (!tickers.some(t => t.ticker === q.ticker && t.market === q.market)) setTickers(prev => [...prev, q]) }}
              disabled={tickers.some(t => t.ticker === q.ticker && t.market === q.market)}
              className="px-2 py-0.5 rounded text-xs bg-at-bg text-at-text-secondary hover:bg-at-accent-light hover:text-at-accent transition-colors disabled:opacity-30"
            >
              <Plus className="w-3 h-3 inline mr-0.5" />{q.name}
            </button>
          ))}
        </div>
      </div>

      {/* 기간/자금 + 실행 */}
      <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-at-text-secondary mb-1">시작일</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent" />
          </div>
          <div>
            <label className="block text-xs text-at-text-secondary mb-1">종료일</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent" />
          </div>
          <div>
            <label className="block text-xs text-at-text-secondary mb-1">초기 자금</label>
            <input type="number" value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value) || 10_000_000)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm font-mono focus:outline-none focus:border-at-accent" />
          </div>
        </div>
        <button
          onClick={runAllBacktests}
          disabled={isRunning || tickers.length === 0}
          className="w-full py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isRunning ? (
            <><Loader2 className="w-4 h-4 animate-spin" />{tickers.length}개 종목 백테스트 중... ({tickers.length - runningTickers.size}/{tickers.length})</>
          ) : (
            <><Play className="w-4 h-4" />{tickers.length}개 종목 백테스트 실행</>
          )}
        </button>
        {error && <p className="text-sm text-red-500 whitespace-pre-line">{error}</p>}
      </div>

      {/* 결과 비교 테이블 */}
      {results.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-at-accent" />
            <h2 className="font-semibold text-at-text">백테스트 결과 비교</h2>
            <span className="text-xs text-at-text-weak">({results.length}개 종목, 수익률순 정렬)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-at-text-secondary border-b border-at-border">
                  <th className="text-left py-2 px-2">#</th>
                  <th className="text-left py-2 px-2">종목</th>
                  <th className="text-center py-2 px-2">시장</th>
                  <th className="text-right py-2 px-2">전략 수익률</th>
                  <th className="text-right py-2 px-2">단순보유</th>
                  <th className="text-right py-2 px-2">초과수익</th>
                  <th className="text-right py-2 px-2">MDD</th>
                  <th className="text-right py-2 px-2">Sharpe</th>
                  <th className="text-right py-2 px-2">승률</th>
                  <th className="text-right py-2 px-2">PF</th>
                  <th className="text-right py-2 px-2">매매수</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr
                    key={`${r.ticker}-${r.market}`}
                    onClick={() => setSelectedResultIdx(i)}
                    className={`border-b border-at-border/50 cursor-pointer transition-colors ${selectedResultIdx === i ? 'bg-at-accent-light/50' : 'hover:bg-at-bg'}`}
                  >
                    <td className="py-2.5 px-2">{i === 0 ? <Trophy className="w-3.5 h-3.5 text-amber-500" /> : <span className="text-at-text-weak">{i + 1}</span>}</td>
                    <td className="py-2.5 px-2">
                      <span className="font-mono font-semibold text-at-text">{r.ticker}</span>
                      {r.tickerName && r.tickerName !== r.ticker && <span className="text-at-text-secondary ml-1">{r.tickerName}</span>}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${r.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{r.market}</span>
                    </td>
                    <td className={`py-2.5 px-2 text-right font-mono font-semibold ${r.metrics.totalReturn >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                      {r.metrics.totalReturn > 0 ? '+' : ''}{r.metrics.totalReturn.toFixed(2)}%
                    </td>
                    <td className={`py-2.5 px-2 text-right font-mono ${(r.buyHold?.totalReturn ?? 0) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                      {(r.buyHold?.totalReturn ?? 0) > 0 ? '+' : ''}{(r.buyHold?.totalReturn ?? 0).toFixed(2)}%
                    </td>
                    {(() => {
                      const excess = r.metrics.totalReturn - (r.buyHold?.totalReturn ?? 0)
                      return <td className={`py-2.5 px-2 text-right font-mono font-bold ${excess >= 0 ? 'text-green-600' : 'text-orange-500'}`}>{excess > 0 ? '+' : ''}{excess.toFixed(2)}%p</td>
                    })()}
                    <td className="py-2.5 px-2 text-right font-mono text-blue-500">-{r.metrics.maxDrawdown.toFixed(2)}%</td>
                    <td className="py-2.5 px-2 text-right font-mono">{r.metrics.sharpeRatio.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{r.metrics.winRate.toFixed(1)}%</td>
                    <td className="py-2.5 px-2 text-right font-mono">{r.metrics.profitFactor.toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-mono">{r.metrics.totalTrades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 선택된 종목 상세 결과 */}
      {selectedResult && (
        <>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-at-text">{selectedResult.ticker} 상세 결과</h2>
            {selectedResult.tickerName && selectedResult.tickerName !== selectedResult.ticker && (
              <span className="text-sm text-at-text-secondary">{selectedResult.tickerName}</span>
            )}
          </div>

          {/* 핵심 지표 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <MetricCard label="전략 수익률" value={`${selectedResult.metrics.totalReturn > 0 ? '+' : ''}${selectedResult.metrics.totalReturn.toFixed(2)}%`} positive={selectedResult.metrics.totalReturn > 0} icon={selectedResult.metrics.totalReturn >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />} />
            <MetricCard label="단순 보유" value={`${(selectedResult.buyHold?.totalReturn ?? 0) > 0 ? '+' : ''}${(selectedResult.buyHold?.totalReturn ?? 0).toFixed(2)}%`} positive={(selectedResult.buyHold?.totalReturn ?? 0) > 0} icon={<BarChart3 className="w-4 h-4" />} />
            {(() => {
              const excess = selectedResult.metrics.totalReturn - (selectedResult.buyHold?.totalReturn ?? 0)
              return <MetricCard label="초과 수익" value={`${excess > 0 ? '+' : ''}${excess.toFixed(2)}%p`} positive={excess > 0} icon={<Award className="w-4 h-4" />} />
            })()}
            <MetricCard label="MDD" value={`-${selectedResult.metrics.maxDrawdown.toFixed(2)}%`} positive={false} icon={<TrendingDown className="w-4 h-4" />} />
            <MetricCard label="승률" value={`${selectedResult.metrics.winRate.toFixed(1)}%`} positive={selectedResult.metrics.winRate >= 50} icon={<Award className="w-4 h-4" />} />
            <MetricCard label="총 매매" value={`${selectedResult.metrics.totalTrades}회`} positive={true} icon={<Clock className="w-4 h-4" />} />
          </div>

          {/* 상세 지표 */}
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
            <h3 className="font-semibold text-at-text mb-3">상세 지표</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div><p className="text-at-text-secondary text-xs">Sharpe Ratio</p><p className="font-mono font-semibold text-at-text">{selectedResult.metrics.sharpeRatio.toFixed(2)}</p></div>
              <div><p className="text-at-text-secondary text-xs">Profit Factor</p><p className="font-mono font-semibold text-at-text">{selectedResult.metrics.profitFactor.toFixed(2)}</p></div>
              <div><p className="text-at-text-secondary text-xs">평균 수익</p><p className="font-mono font-semibold text-green-600">{selectedResult.metrics.avgWin.toLocaleString()}원</p></div>
              <div><p className="text-at-text-secondary text-xs">평균 손실</p><p className="font-mono font-semibold text-red-500">{selectedResult.metrics.avgLoss.toLocaleString()}원</p></div>
              <div><p className="text-at-text-secondary text-xs">최대 연속 수익</p><p className="font-mono font-semibold text-at-text">{selectedResult.metrics.maxConsecutiveWins}회</p></div>
              <div><p className="text-at-text-secondary text-xs">최대 연속 손실</p><p className="font-mono font-semibold text-at-text">{selectedResult.metrics.maxConsecutiveLosses}회</p></div>
              <div><p className="text-at-text-secondary text-xs">평균 보유 기간</p><p className="font-mono font-semibold text-at-text">{selectedResult.metrics.avgHoldingDays.toFixed(1)}일</p></div>
            </div>
          </div>

          {/* 자산 곡선 */}
          {selectedResult.equityCurve.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-at-text">자산 곡선</h3>
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-at-accent inline-block" /> 전략</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-1.5 rounded bg-amber-400 inline-block" /> 단순 보유</span>
                </div>
              </div>
              <div className="relative h-36 overflow-hidden">
                {(() => {
                  const stratSample = sampleCurve(selectedResult.equityCurve, 80)
                  const bhSample = selectedResult.buyHold?.equityCurve ? sampleCurve(selectedResult.buyHold.equityCurve, 80) : []
                  const allValues = [...stratSample.map(p => p.value), ...bhSample.map(p => p.value)]
                  const min = Math.min(...allValues)
                  const max = Math.max(...allValues)
                  const range = max - min || 1
                  return (
                    <>
                      <div className="absolute inset-0 flex items-end gap-0.5">
                        {bhSample.map((point, i) => <div key={`bh-${i}`} className="flex-1 rounded-t bg-amber-300/40" style={{ height: `${Math.max(1, ((point.value - min) / range) * 100)}%` }} title={`단순 보유 ${point.date}: ${point.value.toLocaleString()}원`} />)}
                      </div>
                      <div className="absolute inset-0 flex items-end gap-0.5">
                        {stratSample.map((point, i) => <div key={`st-${i}`} className="flex-1 rounded-t bg-at-accent/70" style={{ height: `${Math.max(1, ((point.value - min) / range) * 100)}%` }} title={`전략 ${point.date}: ${point.value.toLocaleString()}원`} />)}
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-at-text-weak">
                <span>{selectedResult.equityCurve[0]?.date}</span>
                <span>{selectedResult.equityCurve[selectedResult.equityCurve.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* 매매 내역 */}
          {selectedResult.trades.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5">
              <h3 className="font-semibold text-at-text mb-3">매매 내역 ({selectedResult.trades.length}건)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-at-text-secondary border-b border-at-border">
                      <th className="text-left py-2 px-2">진입일</th>
                      <th className="text-left py-2 px-2">청산일</th>
                      <th className="text-right py-2 px-2">진입가</th>
                      <th className="text-right py-2 px-2">청산가</th>
                      <th className="text-right py-2 px-2">수량</th>
                      <th className="text-right py-2 px-2">손익</th>
                      <th className="text-right py-2 px-2">수익률</th>
                      <th className="text-right py-2 px-2">보유일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedResult.trades.map((t, i) => (
                      <tr key={i} className="border-b border-at-border/50 hover:bg-at-surface-alt transition-colors">
                        <td className="py-2 px-2 font-mono">{t.entryDate}</td>
                        <td className="py-2 px-2 font-mono">{t.exitDate}</td>
                        <td className="py-2 px-2 text-right font-mono">{t.entryPrice.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono">{t.exitPrice.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono">{t.quantity}</td>
                        <td className={`py-2 px-2 text-right font-mono font-semibold ${t.pnl >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {t.pnl >= 0 ? '+' : ''}{Math.round(t.pnl).toLocaleString()}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${t.pnlPercent >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {t.pnlPercent >= 0 ? '+' : ''}{t.pnlPercent.toFixed(2)}%
                        </td>
                        <td className="py-2 px-2 text-right font-mono">{t.holdingDays}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MetricCard({ label, value, positive, icon }: {
  label: string; value: string; positive: boolean; icon: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-at-border p-4">
      <div className="flex items-center gap-1.5 text-at-text-secondary mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-bold font-mono ${positive ? 'text-red-500' : 'text-blue-500'}`}>{value}</p>
    </div>
  )
}

function sampleCurve(curve: EquityCurvePoint[], maxPoints: number): EquityCurvePoint[] {
  if (curve.length <= maxPoints) return curve
  const step = Math.ceil(curve.length / maxPoints)
  return curve.filter((_, i) => i % step === 0)
}
