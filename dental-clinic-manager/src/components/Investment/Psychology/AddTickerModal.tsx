'use client'
import { useState, useMemo } from 'react'
import { Loader2, X, AlertCircle, Check } from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import RecentTickersButtons from '@/components/Investment/RecentTickersButtons'
import FavoritesButtons from '@/components/Investment/FavoritesButtons'
import { useRecentTickers } from '@/hooks/useRecentTickers'
import type { Market } from '@/types/investment'

interface QueueItem {
  ticker: string
  name: string
  market: Market
}

const keyOf = (it: { ticker: string; market: Market }) => `${it.market}:${it.ticker}`

export default function AddTickerModal({ onClose, onAdded }: {
  onClose: () => void
  onAdded: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<{ ticker: string; ok: boolean; reason?: string }[]>([])
  const { add: rememberTicker } = useRecentTickers()

  const queueKeys = useMemo(() => new Set(queue.map(keyOf)), [queue])

  const pickToQueue = (ticker: string, name?: string, market?: Market) => {
    if (!market) return
    const item: QueueItem = { ticker, name: name || ticker, market }
    if (queueKeys.has(keyOf(item))) return
    setQueue(prev => [...prev, item])
    setError(null)
  }

  const removeFromQueue = (key: string) => {
    setQueue(prev => prev.filter(it => keyOf(it) !== key))
  }

  const onSubmit = async () => {
    if (!queue.length) return
    setSubmitting(true); setError(null); setResults([])
    const localResults: { ticker: string; ok: boolean; reason?: string }[] = []
    let successCount = 0
    for (const it of queue) {
      try {
        const res = await fetch('/api/investment/psychology/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticker: it.ticker, market: it.market }),
        })
        const data = await res.json().catch(() => ({}))
        if (res.ok) {
          rememberTicker(it.ticker, it.name, it.market)
          localResults.push({ ticker: it.ticker, ok: true })
          successCount++
        } else {
          localResults.push({ ticker: it.ticker, ok: false, reason: data?.error ?? `HTTP ${res.status}` })
        }
      } catch {
        localResults.push({ ticker: it.ticker, ok: false, reason: '네트워크 오류' })
      }
    }
    setResults(localResults)
    setSubmitting(false)

    if (successCount > 0) onAdded()
    // 성공한 종목만 큐에서 제거하고, 실패한 종목은 유지하여 사용자가 재시도/조정 가능
    setQueue(prev => prev.filter(it => !localResults.some(r => r.ticker === it.ticker && r.ok)))

    const failed = localResults.filter(r => !r.ok)
    if (failed.length === 0) {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-lg w-full max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-at-border">
          <h3 className="text-lg font-bold text-at-text">종목 추가</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-at-text-weak hover:bg-at-surface-alt transition-colors"
            title="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-at-text-secondary mb-2">종목 검색</label>
            <TickerSearch
              onSelect={pickToQueue}
              market="ALL"
              placeholder="종목명 또는 티커 (예: 삼성전자, AAPL)"
              clearOnSelect
            />
            <p className="mt-1.5 text-[11px] text-at-text-weak">
              여러 종목을 검색해서 한 번에 추가할 수 있습니다.
            </p>
          </div>

          <div className="space-y-2">
            <FavoritesButtons market="ALL" onSelect={pickToQueue} excludeKeys={queueKeys} />
            <RecentTickersButtons market="ALL" onSelect={pickToQueue} excludeKeys={queueKeys} />
          </div>

          {queue.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-at-text-secondary mb-2">
                추가 대기 ({queue.length})
              </div>
              <ul className="space-y-1.5 max-h-44 overflow-y-auto">
                {queue.map(it => {
                  const k = keyOf(it)
                  const result = results.find(r => r.ticker === it.ticker)
                  return (
                    <li
                      key={k}
                      className={`flex items-center gap-2 p-2.5 rounded-xl text-sm ${
                        result?.ok
                          ? 'bg-emerald-50 text-emerald-700'
                          : result && !result.ok
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-at-accent-light text-at-accent'
                      }`}
                    >
                      <span className="font-semibold">{it.ticker}</span>
                      <span className="text-at-text-secondary">·</span>
                      <span className="truncate">{it.name}</span>
                      <span className="ml-auto text-[11px] text-at-text-secondary">
                        {it.market === 'KR' ? '한국' : '미국'}
                      </span>
                      {result?.ok ? (
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      ) : result && !result.ok ? (
                        <span className="text-[11px] text-rose-600 flex-shrink-0" title={result.reason}>
                          실패
                        </span>
                      ) : (
                        <button
                          onClick={() => removeFromQueue(k)}
                          className="p-0.5 rounded-md text-at-text-weak hover:text-rose-500 transition-colors flex-shrink-0"
                          title="제거"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
              {results.some(r => !r.ok) && (
                <p className="mt-2 text-[11px] text-rose-600">
                  실패한 종목: {results.filter(r => !r.ok).map(r => `${r.ticker}(${r.reason ?? '오류'})`).join(', ')}
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-at-border bg-at-surface-alt">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-at-text-secondary hover:bg-white transition-colors"
          >
            닫기
          </button>
          <button
            onClick={onSubmit}
            disabled={submitting || queue.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {queue.length > 1 ? `${queue.length}개 추가` : '추가'}
          </button>
        </div>
      </div>
    </div>
  )
}
