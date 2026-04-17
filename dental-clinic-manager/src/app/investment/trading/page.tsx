'use client'

import { useState, useEffect, useCallback } from 'react'
import { Activity, Send, ArrowUpCircle, ArrowDownCircle, Clock, Loader2 } from 'lucide-react'
import type { TradeOrder, Market, OrderType, OrderMethod } from '@/types/investment'

export default function TradingPage() {
  const [orders, setOrders] = useState<TradeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // 주문 폼 상태
  const [ticker, setTicker] = useState('')
  const [market, setMarket] = useState<Market>('KR')
  const [orderType, setOrderType] = useState<OrderType>('buy')
  const [orderMethod, setOrderMethod] = useState<OrderMethod>('limit')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')

  const loadOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/orders?limit=20')
      const json = await res.json()
      if (json.data) setOrders(json.data)
    } catch {
      console.error('주문 내역 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  const submitOrder = async () => {
    if (!ticker.trim()) { alert('종목 코드를 입력해주세요'); return }
    if (!quantity || Number(quantity) <= 0) { alert('수량을 입력해주세요'); return }
    if (orderMethod === 'limit' && (!price || Number(price) <= 0)) {
      alert('지정가를 입력해주세요'); return
    }

    if (!confirm(`${ticker.toUpperCase()} ${Number(quantity)}주 ${orderType === 'buy' ? '매수' : '매도'} 주문을 제출하시겠습니까?`)) {
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/investment/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker: ticker.trim(),
          market,
          orderType,
          orderMethod,
          quantity: Number(quantity),
          price: orderMethod === 'limit' ? Number(price) : undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setTicker('')
        setQuantity('')
        setPrice('')
        loadOrders()
      } else {
        alert(json.error || '주문 실패')
      }
    } catch {
      alert('네트워크 오류')
    } finally {
      setSubmitting(false)
    }
  }

  const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    pending: { label: '대기', color: 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20' },
    submitted: { label: '제출됨', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
    confirmed: { label: '확인', color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
    partially_filled: { label: '부분체결', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20' },
    filled: { label: '체결', color: 'text-green-600 bg-green-50 dark:bg-green-900/20' },
    cancelled: { label: '취소', color: 'text-gray-500 bg-gray-50 dark:bg-gray-900/20' },
    failed: { label: '실패', color: 'text-red-600 bg-red-50 dark:bg-red-900/20' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-at-text">자동매매 현황</h1>
        <p className="text-sm text-at-text-secondary mt-1">실시간 매매 상태와 수동 주문을 관리하세요</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 수동 주문 폼 */}
        <div className="lg:col-span-1">
          <div className="bg-at-surface rounded-2xl shadow-at-card p-5 space-y-4">
            <h2 className="font-semibold text-at-text">수동 주문</h2>

            <div className="flex gap-2">
              <button
                onClick={() => setOrderType('buy')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  orderType === 'buy'
                    ? 'bg-red-500 text-white'
                    : 'bg-at-bg text-at-text-secondary hover:bg-red-50 dark:hover:bg-red-900/20'
                }`}
              >
                <ArrowUpCircle className="w-4 h-4 inline mr-1" />
                매수
              </button>
              <button
                onClick={() => setOrderType('sell')}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  orderType === 'sell'
                    ? 'bg-blue-500 text-white'
                    : 'bg-at-bg text-at-text-secondary hover:bg-blue-50 dark:hover:bg-blue-900/20'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4 inline mr-1" />
                매도
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <select
                value={market}
                onChange={e => setMarket(e.target.value as Market)}
                className="px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
              >
                <option value="KR">국내</option>
                <option value="US">미국</option>
              </select>
              <select
                value={orderMethod}
                onChange={e => setOrderMethod(e.target.value as OrderMethod)}
                className="px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-at-accent"
              >
                <option value="limit">지정가</option>
                <option value="market">시장가</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-at-text-secondary mb-1">종목 코드</label>
              <input
                type="text"
                value={ticker}
                onChange={e => setTicker(e.target.value)}
                placeholder={market === 'KR' ? '005930' : 'AAPL'}
                className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm font-mono focus:outline-none focus:border-at-accent"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-at-text-secondary mb-1">수량</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="0"
                  min="1"
                  className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm font-mono focus:outline-none focus:border-at-accent"
                />
              </div>
              {orderMethod === 'limit' && (
                <div>
                  <label className="block text-xs text-at-text-secondary mb-1">가격</label>
                  <input
                    type="number"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="0"
                    min="0"
                    className="w-full px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm font-mono focus:outline-none focus:border-at-accent"
                  />
                </div>
              )}
            </div>

            <button
              onClick={submitOrder}
              disabled={submitting}
              className={`w-full py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${
                orderType === 'buy'
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              } disabled:opacity-50`}
            >
              {submitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {orderType === 'buy' ? '매수' : '매도'} 주문
            </button>
          </div>
        </div>

        {/* 주문 내역 + 자동매매 현황 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 자동매매 현황 */}
          <div className="bg-at-surface rounded-2xl shadow-at-card p-5">
            <h2 className="font-semibold text-at-text mb-3">자동매매 현황</h2>
            <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
              <Activity className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">활성화된 자동매매가 없습니다</p>
              <p className="text-xs mt-1">전략을 활성화하면 실시간 매매 현황이 표시됩니다</p>
            </div>
          </div>

          {/* 최근 주문 내역 */}
          <div className="bg-at-surface rounded-2xl shadow-at-card p-5">
            <h2 className="font-semibold text-at-text mb-3">최근 주문 내역</h2>
            {loading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-at-accent" />
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-at-text-weak">
                <Clock className="w-10 h-10 mb-2 opacity-30" />
                <p className="text-sm">주문 내역이 없습니다</p>
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
                        <tr key={o.id} className="border-b border-at-border/50 hover:bg-at-bg transition-colors">
                          <td className="py-2 px-2 font-mono text-at-text-secondary">
                            {new Date(o.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="py-2 px-2 font-mono font-medium text-at-text">{o.ticker}</td>
                          <td className={`py-2 px-2 text-center font-medium ${
                            o.order_type === 'buy' ? 'text-red-500' : 'text-blue-500'
                          }`}>
                            {o.order_type === 'buy' ? '매수' : '매도'}
                          </td>
                          <td className="py-2 px-2 text-right font-mono">{o.quantity}</td>
                          <td className="py-2 px-2 text-right font-mono">
                            {o.order_price ? Number(o.order_price).toLocaleString() : '시장가'}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${status.color}`}>
                              {status.label}
                            </span>
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
  )
}
