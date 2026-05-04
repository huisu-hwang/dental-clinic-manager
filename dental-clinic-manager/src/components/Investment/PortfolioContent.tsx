'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Briefcase, Loader2, RefreshCw, AlertCircle, TrendingUp, TrendingDown,
  Wallet, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import type { KRBalanceItem } from '@/lib/kisApiService'

interface BalanceData {
  totalEvaluation: number
  totalPnl: number
  items: KRBalanceItem[]
  isPaperTrading: boolean
}

const REFRESH_INTERVAL_MS = 60_000

export default function PortfolioContent() {
  const [data, setData] = useState<BalanceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasCredential, setHasCredential] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch('/api/investment/balance', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) {
        setHasCredential(json.hasCredential !== false)
        setError(json.error || '잔고 조회에 실패했습니다')
        setData(null)
        return
      }
      setHasCredential(true)
      setError(null)
      setData(json.data as BalanceData)
      setUpdatedAt(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : '네트워크 오류')
      setData(null)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!hasCredential) return
    const id = setInterval(() => load(true), REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [load, hasCredential])

  const totalCost = data
    ? data.items.reduce((sum, it) => sum + it.avgPrice * it.quantity, 0)
    : 0
  const totalPnlRate = totalCost > 0 ? (data!.totalPnl / totalCost) * 100 : 0

  const fmtKRW = (v: number) =>
    v.toLocaleString('ko-KR', { maximumFractionDigits: 0 })
  const fmtPct = (v: number) =>
    `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
  const pnlColor = (v: number) =>
    v > 0 ? 'text-red-600' : v < 0 ? 'text-blue-600' : 'text-at-text-secondary'
  const pnlBg = (v: number) =>
    v > 0 ? 'bg-red-50' : v < 0 ? 'bg-blue-50' : 'bg-at-surface-alt'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-at-text">포트폴리오</h1>
          <p className="text-sm text-at-text-secondary mt-1">
            보유 종목의 매입가·현재가·수익률을 실시간으로 확인하세요
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.isPaperTrading && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
              모의투자
            </span>
          )}
          {updatedAt && (
            <span className="text-[11px] text-at-text-weak">
              {updatedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} 기준
            </span>
          )}
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="p-2 rounded-xl bg-at-surface-alt hover:bg-at-bg text-at-text-secondary disabled:opacity-50"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 로딩 */}
      {loading && !data && (
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-at-text-weak" />
        </div>
      )}

      {/* credential 없음 */}
      {!loading && !hasCredential && (
        <div className="bg-white rounded-2xl shadow-sm border border-at-border p-8">
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Briefcase className="w-12 h-12 mb-3 text-at-text-weak opacity-30" />
            <p className="text-sm font-medium text-at-text">계좌 연결이 필요합니다</p>
            <p className="text-xs text-at-text-secondary mt-1">
              한국투자증권 KIS API 계좌를 연결하면 보유 종목이 자동으로 표시됩니다
            </p>
            <Link
              href="/investment/connect"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-at-accent text-white text-sm font-medium hover:bg-at-accent-hover"
            >
              계좌 연결하러 가기
            </Link>
          </div>
        </div>
      )}

      {/* 오류 (credential은 있는 경우) */}
      {!loading && hasCredential && error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3 text-sm text-red-800">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">잔고 조회 실패</p>
            <p className="text-red-700 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* 잔고 표시 */}
      {data && (
        <>
          {/* KPI 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl shadow-sm border border-at-border p-4">
              <div className="flex items-center gap-2 text-xs text-at-text-secondary">
                <Wallet className="w-4 h-4" />
                <span>총 평가금액</span>
              </div>
              <p className="mt-2 text-xl font-bold text-at-text font-mono">
                ₩{fmtKRW(data.totalEvaluation)}
              </p>
              <p className="text-[11px] text-at-text-weak mt-1">
                매입원가 ₩{fmtKRW(totalCost)}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-at-border p-4">
              <div className="flex items-center gap-2 text-xs text-at-text-secondary">
                {data.totalPnl >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>총 손익</span>
              </div>
              <p className={`mt-2 text-xl font-bold font-mono ${pnlColor(data.totalPnl)}`}>
                {data.totalPnl >= 0 ? '+' : ''}₩{fmtKRW(data.totalPnl)}
              </p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-at-border p-4">
              <div className="flex items-center gap-2 text-xs text-at-text-secondary">
                {totalPnlRate >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                <span>총 수익률</span>
              </div>
              <p className={`mt-2 text-xl font-bold font-mono ${pnlColor(totalPnlRate)}`}>
                {fmtPct(totalPnlRate)}
              </p>
            </div>
          </div>

          {/* 종목 표 (데스크톱) */}
          {data.items.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-at-border p-8">
              <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
                <Briefcase className="w-12 h-12 mb-3 opacity-30" />
                <p className="text-sm font-medium">보유 종목이 없습니다</p>
                <p className="text-xs mt-1">매수 주문이 체결되면 자동으로 표시됩니다</p>
              </div>
            </div>
          ) : (
            <>
              <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-at-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-at-surface-alt text-at-text-secondary">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">종목</th>
                      <th className="text-right px-4 py-3 font-medium">수량</th>
                      <th className="text-right px-4 py-3 font-medium">매입가</th>
                      <th className="text-right px-4 py-3 font-medium">현재가</th>
                      <th className="text-right px-4 py-3 font-medium">평가금액</th>
                      <th className="text-right px-4 py-3 font-medium">평가손익</th>
                      <th className="text-right px-4 py-3 font-medium">수익률</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-at-border">
                    {data.items.map((it) => {
                      const evaluation = it.currentPrice * it.quantity
                      return (
                        <tr key={it.ticker} className="hover:bg-at-surface-alt/40">
                          <td className="px-4 py-3">
                            <p className="font-medium text-at-text">{it.tickerName}</p>
                            <p className="text-[11px] text-at-text-weak font-mono">{it.ticker}</p>
                          </td>
                          <td className="text-right px-4 py-3 font-mono text-at-text">
                            {it.quantity.toLocaleString('ko-KR')}
                          </td>
                          <td className="text-right px-4 py-3 font-mono text-at-text-secondary">
                            ₩{fmtKRW(it.avgPrice)}
                          </td>
                          <td className="text-right px-4 py-3 font-mono text-at-text">
                            ₩{fmtKRW(it.currentPrice)}
                          </td>
                          <td className="text-right px-4 py-3 font-mono text-at-text">
                            ₩{fmtKRW(evaluation)}
                          </td>
                          <td className={`text-right px-4 py-3 font-mono ${pnlColor(it.pnl)}`}>
                            {it.pnl >= 0 ? '+' : ''}₩{fmtKRW(it.pnl)}
                          </td>
                          <td className="text-right px-4 py-3">
                            <span className={`inline-block px-2 py-0.5 rounded-md font-mono font-semibold ${pnlBg(it.pnlRate)} ${pnlColor(it.pnlRate)}`}>
                              {fmtPct(it.pnlRate)}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* 종목 카드 (모바일) */}
              <div className="md:hidden space-y-2">
                {data.items.map((it) => {
                  const evaluation = it.currentPrice * it.quantity
                  return (
                    <div key={it.ticker} className="bg-white rounded-2xl shadow-sm border border-at-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-at-text truncate">{it.tickerName}</p>
                          <p className="text-[11px] text-at-text-weak font-mono">{it.ticker}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-md font-mono font-semibold ${pnlBg(it.pnlRate)} ${pnlColor(it.pnlRate)}`}>
                          {fmtPct(it.pnlRate)}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <Field label="수량" value={it.quantity.toLocaleString('ko-KR')} />
                        <Field label="평가금액" value={`₩${fmtKRW(evaluation)}`} />
                        <Field label="매입가" value={`₩${fmtKRW(it.avgPrice)}`} />
                        <Field label="현재가" value={`₩${fmtKRW(it.currentPrice)}`} />
                      </div>
                      <div className={`mt-2 px-2 py-1.5 rounded-lg font-mono text-sm font-semibold text-right ${pnlBg(it.pnl)} ${pnlColor(it.pnl)}`}>
                        {it.pnl >= 0 ? '+' : ''}₩{fmtKRW(it.pnl)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-at-surface-alt rounded-lg px-2 py-1.5">
      <p className="text-[10px] text-at-text-weak">{label}</p>
      <p className="text-xs font-mono text-at-text">{value}</p>
    </div>
  )
}
