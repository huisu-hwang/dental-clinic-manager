'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Play, Loader2, TrendingUp, TrendingDown, BarChart3, Award, Clock } from 'lucide-react'
import Link from 'next/link'
import type { InvestmentStrategy, BacktestMetrics, BacktestTrade, EquityCurvePoint } from '@/types/investment'

interface BacktestResultData {
  metrics: BacktestMetrics
  trades: BacktestTrade[]
  equityCurve: EquityCurvePoint[]
}

export default function BacktestPage() {
  const params = useParams()
  const strategyId = params.id as string

  const [strategy, setStrategy] = useState<InvestmentStrategy | null>(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<BacktestResultData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 폼 상태
  const [ticker, setTicker] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [initialCapital, setInitialCapital] = useState(10_000_000)

  const loadStrategy = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      const found = (json.data || []).find((s: InvestmentStrategy) => s.id === strategyId)
      if (found) {
        setStrategy(found)
        // 기본값 설정
        if (!ticker) {
          setTicker(found.target_market === 'KR' ? '005930' : 'AAPL')
        }
      }
    } catch {
      console.error('전략 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [strategyId, ticker])

  useEffect(() => {
    loadStrategy()
    // 기본 날짜 (최근 1년)
    const end = new Date()
    const start = new Date()
    start.setFullYear(start.getFullYear() - 1)
    setEndDate(end.toISOString().split('T')[0])
    setStartDate(start.toISOString().split('T')[0])
  }, [loadStrategy])

  const runBacktest = async () => {
    if (!ticker.trim() || !startDate || !endDate) {
      setError('종목 코드와 기간을 입력해주세요')
      return
    }
    setRunning(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/investment/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId,
          ticker: ticker.trim().toUpperCase(),
          market: strategy?.target_market || 'KR',
          startDate,
          endDate,
          initialCapital,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || '백테스트 실행 실패')
        return
      }
      // 결과 추출
      const data = json.data
      if (data.metrics || data.full_metrics) {
        setResult({
          metrics: data.metrics || data.full_metrics,
          trades: data.trades || [],
          equityCurve: data.equityCurve || data.equity_curve || [],
        })
      }
    } catch {
      setError('네트워크 오류')
    } finally {
      setRunning(false)
    }
  }

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
        <Link href="/investment/strategy" className="text-at-accent text-sm mt-2 inline-block">
          전략 목록으로 돌아가기
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link href="/investment/strategy" className="p-2 rounded-lg hover:bg-at-bg transition-colors">
          <ArrowLeft className="w-5 h-5 text-at-text-secondary" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-at-text">백테스트</h1>
          <p className="text-sm text-at-text-secondary mt-0.5">{strategy.name}</p>
        </div>
      </div>

      {/* 백테스트 설정 */}
      <div className="bg-at-surface rounded-2xl shadow-at-card p-5 space-y-4">
        <h2 className="font-semibold text-at-text">백테스트 설정</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-at-text-secondary mb-1">종목 코드</label>
            <input
              type="text"
              value={ticker}
              onChange={e => setTicker(e.target.value)}
              placeholder={strategy.target_market === 'KR' ? '005930' : 'AAPL'}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm font-mono focus:outline-none focus:border-at-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-at-text-secondary mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-at-text-secondary mb-1">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
            />
          </div>
          <div>
            <label className="block text-xs text-at-text-secondary mb-1">초기 자금</label>
            <input
              type="number"
              value={initialCapital}
              onChange={e => setInitialCapital(Number(e.target.value) || 10_000_000)}
              className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm font-mono focus:outline-none focus:border-at-accent"
            />
          </div>
        </div>
        <button
          onClick={runBacktest}
          disabled={running}
          className="w-full py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              백테스트 실행 중...
            </>
          ) : (
            <>
              <Play className="w-4 h-4" />
              백테스트 실행
            </>
          )}
        </button>
        {error && (
          <p className="text-sm text-red-500 text-center">{error}</p>
        )}
      </div>

      {/* 결과 */}
      {result && (
        <>
          {/* 핵심 지표 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MetricCard
              label="총 수익률"
              value={`${result.metrics.totalReturn > 0 ? '+' : ''}${result.metrics.totalReturn.toFixed(2)}%`}
              positive={result.metrics.totalReturn > 0}
              icon={result.metrics.totalReturn >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            />
            <MetricCard
              label="연환산 수익률"
              value={`${result.metrics.annualizedReturn > 0 ? '+' : ''}${result.metrics.annualizedReturn.toFixed(2)}%`}
              positive={result.metrics.annualizedReturn > 0}
              icon={<BarChart3 className="w-4 h-4" />}
            />
            <MetricCard
              label="MDD"
              value={`-${result.metrics.maxDrawdown.toFixed(2)}%`}
              positive={false}
              icon={<TrendingDown className="w-4 h-4" />}
            />
            <MetricCard
              label="승률"
              value={`${result.metrics.winRate.toFixed(1)}%`}
              positive={result.metrics.winRate >= 50}
              icon={<Award className="w-4 h-4" />}
            />
            <MetricCard
              label="총 매매"
              value={`${result.metrics.totalTrades}회`}
              positive={true}
              icon={<Clock className="w-4 h-4" />}
            />
          </div>

          {/* 상세 지표 */}
          <div className="bg-at-surface rounded-2xl shadow-at-card p-5">
            <h2 className="font-semibold text-at-text mb-3">상세 지표</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-at-text-secondary text-xs">Sharpe Ratio</p>
                <p className="font-mono font-semibold text-at-text">{result.metrics.sharpeRatio.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-at-text-secondary text-xs">Profit Factor</p>
                <p className="font-mono font-semibold text-at-text">{result.metrics.profitFactor.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-at-text-secondary text-xs">평균 수익</p>
                <p className="font-mono font-semibold text-green-600">{result.metrics.avgWin.toLocaleString()}원</p>
              </div>
              <div>
                <p className="text-at-text-secondary text-xs">평균 손실</p>
                <p className="font-mono font-semibold text-red-500">{result.metrics.avgLoss.toLocaleString()}원</p>
              </div>
              <div>
                <p className="text-at-text-secondary text-xs">최대 연속 수익</p>
                <p className="font-mono font-semibold text-at-text">{result.metrics.maxConsecutiveWins}회</p>
              </div>
              <div>
                <p className="text-at-text-secondary text-xs">최대 연속 손실</p>
                <p className="font-mono font-semibold text-at-text">{result.metrics.maxConsecutiveLosses}회</p>
              </div>
              <div>
                <p className="text-at-text-secondary text-xs">평균 보유 기간</p>
                <p className="font-mono font-semibold text-at-text">{result.metrics.avgHoldingDays.toFixed(1)}일</p>
              </div>
            </div>
          </div>

          {/* 자산 곡선 (텍스트 기반) */}
          {result.equityCurve.length > 0 && (
            <div className="bg-at-surface rounded-2xl shadow-at-card p-5">
              <h2 className="font-semibold text-at-text mb-3">자산 곡선</h2>
              <div className="flex items-end gap-0.5 h-32 overflow-hidden">
                {sampleCurve(result.equityCurve, 80).map((point, i) => {
                  const min = Math.min(...sampleCurve(result.equityCurve, 80).map(p => p.value))
                  const max = Math.max(...sampleCurve(result.equityCurve, 80).map(p => p.value))
                  const range = max - min || 1
                  const height = ((point.value - min) / range) * 100
                  const isProfit = point.value >= initialCapital
                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-t ${isProfit ? 'bg-green-400 dark:bg-green-600' : 'bg-red-400 dark:bg-red-600'}`}
                      style={{ height: `${Math.max(2, height)}%` }}
                      title={`${point.date}: ${point.value.toLocaleString()}원`}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-at-text-weak">
                <span>{result.equityCurve[0]?.date}</span>
                <span>{result.equityCurve[result.equityCurve.length - 1]?.date}</span>
              </div>
            </div>
          )}

          {/* 매매 내역 */}
          {result.trades.length > 0 && (
            <div className="bg-at-surface rounded-2xl shadow-at-card p-5">
              <h2 className="font-semibold text-at-text mb-3">매매 내역 ({result.trades.length}건)</h2>
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
                    {result.trades.map((t, i) => (
                      <tr key={i} className="border-b border-at-border/50 hover:bg-at-bg transition-colors">
                        <td className="py-2 px-2 font-mono">{t.entryDate}</td>
                        <td className="py-2 px-2 font-mono">{t.exitDate}</td>
                        <td className="py-2 px-2 text-right font-mono">{t.entryPrice.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono">{t.exitPrice.toLocaleString()}</td>
                        <td className="py-2 px-2 text-right font-mono">{t.quantity}</td>
                        <td className={`py-2 px-2 text-right font-mono font-semibold ${
                          t.pnl >= 0 ? 'text-red-500' : 'text-blue-500'
                        }`}>
                          {t.pnl >= 0 ? '+' : ''}{Math.round(t.pnl).toLocaleString()}
                        </td>
                        <td className={`py-2 px-2 text-right font-mono ${
                          t.pnlPercent >= 0 ? 'text-red-500' : 'text-blue-500'
                        }`}>
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
    <div className="bg-at-surface rounded-2xl shadow-at-card p-4">
      <div className="flex items-center gap-1.5 text-at-text-secondary mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-bold font-mono ${
        positive ? 'text-red-500' : 'text-blue-500'
      }`}>
        {value}
      </p>
    </div>
  )
}

/** 자산 곡선 샘플링 (너무 많은 데이터 포인트 방지) */
function sampleCurve(curve: EquityCurvePoint[], maxPoints: number): EquityCurvePoint[] {
  if (curve.length <= maxPoints) return curve
  const step = Math.ceil(curve.length / maxPoints)
  return curve.filter((_, i) => i % step === 0)
}
