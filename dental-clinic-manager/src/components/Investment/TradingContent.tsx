'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity, Send, ArrowUpCircle, ArrowDownCircle, Clock, Loader2 } from 'lucide-react'
import type { TradeOrder, Market, OrderType, OrderMethod } from '@/types/investment'
import TradingSettingsPanel from './TradingSettingsPanel'
import TickerSearch from './TickerSearch'

export default function TradingContent() {
  const [orders, setOrders] = useState<TradeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [ticker, setTicker] = useState('')
  const [tickerName, setTickerName] = useState('')
  const [market, setMarket] = useState<Market>('KR')
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [quoteLoading, setQuoteLoading] = useState(false)
  const [orderType, setOrderType] = useState<OrderType>('buy')
  const [orderMethod, setOrderMethod] = useState<OrderMethod>('limit')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/orders?limit=20')
      const json = await res.json()
      if (json.data) setOrders(json.data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  // 종목·시장 변경 시 현재가 자동 조회
  useEffect(() => {
    if (!ticker.trim()) { setCurrentPrice(null); return }
    let cancelled = false
    setQuoteLoading(true)
    fetch(`/api/investment/quote?ticker=${encodeURIComponent(ticker.trim())}&market=${market}`)
      .then(r => r.json())
      .then(json => {
        if (cancelled) return
        const p = json?.data?.price
        if (typeof p === 'number' && p > 0) setCurrentPrice(p)
        else setCurrentPrice(null)
      })
      .catch(() => { if (!cancelled) setCurrentPrice(null) })
      .finally(() => { if (!cancelled) setQuoteLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market])

  const applyCurrentPrice = () => {
    if (currentPrice === null || currentPrice <= 0) return
    setOrderMethod('limit')
    setPrice(String(currentPrice))
  }

  const submitOrder = async () => {
    if (!ticker.trim()) { alert('종목 코드를 입력해주세요'); return }
    if (!quantity || Number(quantity) <= 0) { alert('수량을 입력해주세요'); return }
    if (orderMethod === 'limit' && (!price || Number(price) <= 0)) { alert('지정가를 입력해주세요'); return }
    if (!confirm(`${ticker.toUpperCase()} ${Number(quantity)}주 ${orderType === 'buy' ? '매수' : '매도'} 주문을 제출하시겠습니까?`)) return

    setSubmitting(true)
    try {
      const res = await fetch('/api/investment/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.trim(), market, orderType, orderMethod,
          quantity: Number(quantity),
          price: orderMethod === 'limit' ? Number(price) : undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const json = await res.json()
      if (res.ok) { setTicker(''); setTickerName(''); setQuantity(''); setPrice(''); loadOrders() }
      else alert(json.error || '주문 실패')
    } catch { alert('네트워크 오류') } finally { setSubmitting(false) }
  }

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    pending: { label: '대기', color: 'text-yellow-600 bg-yellow-50' },
    submitted: { label: '제출됨', color: 'text-blue-600 bg-blue-50' },
    confirmed: { label: '확인', color: 'text-blue-600 bg-blue-50' },
    partially_filled: { label: '부분체결', color: 'text-purple-600 bg-purple-50' },
    filled: { label: '체결', color: 'text-green-600 bg-green-50' },
    cancelled: { label: '취소', color: 'text-gray-500 bg-gray-50' },
    failed: { label: '실패', color: 'text-red-600 bg-red-50' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-at-text">자동매매 현황</h2>
        <p className="text-sm text-at-text-secondary mt-1">실시간 매매 상태와 수동 주문을 관리하세요</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 수동 주문 폼 */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-5 space-y-4">
            <h3 className="font-semibold text-at-text">수동 주문</h3>
            <div className="flex gap-2">
              <button onClick={() => setOrderType('buy')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${orderType === 'buy' ? 'bg-red-500 text-white' : 'bg-at-surface-alt text-at-text-secondary hover:bg-red-50'}`}>
                <ArrowUpCircle className="w-4 h-4 inline mr-1" />매수
              </button>
              <button onClick={() => setOrderType('sell')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${orderType === 'sell' ? 'bg-blue-500 text-white' : 'bg-at-surface-alt text-at-text-secondary hover:bg-blue-50'}`}>
                <ArrowDownCircle className="w-4 h-4 inline mr-1" />매도
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={market}
                onChange={e => {
                  const next = e.target.value as Market
                  if (next !== market) {
                    setMarket(next)
                    setTicker('')
                    setTickerName('')
                  }
                }}
                className="px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent">
                <option value="KR">국내</option><option value="US">미국</option>
              </select>
              <select value={orderMethod} onChange={e => setOrderMethod(e.target.value as OrderMethod)}
                className="px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm focus:outline-none focus:border-at-accent">
                <option value="limit">지정가</option><option value="market">시장가</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-at-text-secondary mb-1">
                종목 <span className="text-at-text-weak font-normal">(종목명 또는 코드로 검색)</span>
              </label>
              <TickerSearch
                market={market}
                onSelect={(t, name, m) => {
                  setTicker(t)
                  setTickerName(name || '')
                  if (m && m !== market) setMarket(m)
                }}
                placeholder={market === 'KR' ? '예: 삼성전자, 005930' : '예: AAPL, Apple'}
                clearOnSelect={false}
              />
              {ticker && (
                <div className="mt-1.5 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                  <span className="text-at-text-secondary">
                    <span className="font-mono font-semibold text-at-text">{ticker}</span>
                    {tickerName && tickerName !== ticker && (
                      <span className="ml-1.5">{tickerName}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => { setTicker(''); setTickerName(''); setCurrentPrice(null) }}
                      className="ml-2 text-at-text-weak hover:text-at-accent underline"
                    >
                      초기화
                    </button>
                  </span>
                  <span className="font-mono">
                    {quoteLoading ? (
                      <span className="text-at-text-weak inline-flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> 시세 조회 중...
                      </span>
                    ) : currentPrice !== null ? (
                      <span className="text-at-text">
                        현재가{' '}
                        <span className="font-semibold">
                          {market === 'KR'
                            ? `${Math.round(currentPrice).toLocaleString()}원`
                            : `$${currentPrice.toFixed(2)}`}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-at-text-secondary mb-1">수량</label>
                <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="0" min="1"
                  className="w-full px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm font-mono focus:outline-none focus:border-at-accent" />
              </div>
              {orderMethod === 'limit' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-at-text-secondary">가격</label>
                    <button
                      type="button"
                      onClick={applyCurrentPrice}
                      disabled={currentPrice === null || quoteLoading}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-at-accent/10 text-at-accent hover:bg-at-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="현재가를 가격 필드에 입력"
                    >
                      현재가 입력
                    </button>
                  </div>
                  <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" min="0"
                    className="w-full px-3 py-2 rounded-xl border border-at-border bg-white text-at-text text-sm font-mono focus:outline-none focus:border-at-accent" />
                </div>
              )}
            </div>
            {orderMethod === 'market' && currentPrice !== null && (
              <div className="text-[11px] text-at-text-secondary px-3 py-2 rounded-lg bg-at-surface-alt">
                시장가 주문은 즉시 체결가로 처리됩니다 (예상 체결가 약{' '}
                <span className="font-mono font-semibold">
                  {market === 'KR'
                    ? `${Math.round(currentPrice).toLocaleString()}원`
                    : `$${currentPrice.toFixed(2)}`}
                </span>
                ). 슬리피지 가능성 있음.
              </div>
            )}
            {/* 빠른 주문: 현재가로 즉시 매수/매도 */}
            {currentPrice !== null && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOrderType('buy')
                    applyCurrentPrice()
                  }}
                  disabled={quoteLoading}
                  className="py-2 rounded-xl text-xs font-medium border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                >
                  현재가 매수 가격 적용
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOrderType('sell')
                    applyCurrentPrice()
                  }}
                  disabled={quoteLoading}
                  className="py-2 rounded-xl text-xs font-medium border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  현재가 매도 가격 적용
                </button>
              </div>
            )}
            <button onClick={submitOrder} disabled={submitting}
              className={`w-full py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                orderType === 'buy' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white'
              } disabled:opacity-50`}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {orderType === 'buy' ? '매수' : '매도'} 주문
            </button>
          </div>
        </div>

        {/* 주문 내역 + 자동매매 현황 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-at-border overflow-hidden">
            <div className="px-5 py-4 border-b border-at-border">
              <h3 className="font-semibold text-at-text">자동매매 현황</h3>
            </div>
            <div className="p-5">
              <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
                <Activity className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">활성화된 자동매매가 없습니다</p>
              </div>
            </div>
          </div>

          <TradingSettingsPanel />

          <div className="bg-white rounded-2xl shadow-sm border border-at-border overflow-hidden">
            <div className="px-5 py-4 border-b border-at-border">
              <h3 className="font-semibold text-at-text">최근 주문 내역</h3>
            </div>
            <div className="p-5">
              {loading ? (
                <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent" /></div>
              ) : orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
                  <Clock className="w-10 h-10 mb-2 opacity-30" /><p className="text-sm">주문 내역이 없습니다</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-at-text-secondary border-b border-at-border">
                        <th className="text-left py-2 px-2">시간</th>
                        <th className="text-left py-2 px-2">종목</th>
                        <th className="text-center py-2 px-2">유형</th>
                        <th className="text-right py-2 px-2">수량</th>
                        <th className="text-right py-2 px-2">가격</th>
                        <th className="text-center py-2 px-2">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => {
                        const status = STATUS_LABELS[o.status] || { label: o.status, color: 'text-gray-500' }
                        return (
                          <tr key={o.id} className="border-b border-at-border/50 hover:bg-at-surface-alt transition-colors">
                            <td className="py-2 px-2 font-mono text-at-text-secondary">
                              {new Date(o.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-2 px-2 font-mono font-medium text-at-text">{o.ticker}</td>
                            <td className={`py-2 px-2 text-center font-medium ${o.order_type === 'buy' ? 'text-red-500' : 'text-blue-500'}`}>
                              {o.order_type === 'buy' ? '매수' : '매도'}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">{o.quantity}</td>
                            <td className="py-2 px-2 text-right font-mono">{o.order_price ? Number(o.order_price).toLocaleString() : '시장가'}</td>
                            <td className="py-2 px-2 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${status.color}`}>{status.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
