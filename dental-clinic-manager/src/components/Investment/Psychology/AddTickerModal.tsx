'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function AddTickerModal({ onClose, onAdded }: {
  onClose: () => void
  onAdded: () => void
}) {
  const [ticker, setTicker] = useState('')
  const [market, setMarket] = useState<'KR' | 'US'>('KR')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async () => {
    if (!ticker.trim()) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/investment/psychology/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim(), market }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '추가 실패'); return }
      onAdded()
      onClose()
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">종목 추가</h3>
        <div>
          <label className="block text-xs font-semibold mb-1">시장</label>
          <div className="flex gap-2">
            {(['KR','US'] as const).map(m => (
              <button key={m} onClick={() => setMarket(m)}
                className={`px-3 py-1.5 rounded-lg text-sm ${market === m ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                {m === 'KR' ? '한국' : '미국'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">티커</label>
          <input value={ticker} onChange={e => setTicker(e.target.value)}
            placeholder={market === 'KR' ? '예: 005930' : '예: AAPL'}
            className="w-full border rounded-lg px-3 py-2" />
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm">취소</button>
          <button onClick={onSubmit} disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm inline-flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            추가
          </button>
        </div>
      </div>
    </div>
  )
}
