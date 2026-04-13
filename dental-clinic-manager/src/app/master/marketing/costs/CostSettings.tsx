'use client'

import { useState, useEffect } from 'react'

interface CostSetting {
  id: string
  model: string
  input_price_per_1m: number
  output_price_per_1m: number
  image_price_per_call: number
  usd_to_krw: number
}

const MODEL_LABELS: Record<string, string> = {
  'claude-sonnet-4-6': 'Claude Sonnet 4.6',
  'claude-haiku-4-5': 'Claude Haiku 4.5',
  'gemini-3.0-flash': 'Gemini 3.0 Flash',
  'exchange_rate': '환율 설정',
}

export default function CostSettings() {
  const [settings, setSettings] = useState<CostSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const fetchSettings = async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/marketing/costs/settings')
        const json = await res.json()
        setSettings(json?.settings ?? [])
      } catch {
        setError('설정을 불러오지 못했습니다.')
      } finally {
        setLoading(false)
      }
    }
    fetchSettings()
  }, [])

  const handleChange = (model: string, field: keyof CostSetting, value: string) => {
    setSettings(prev =>
      prev.map(s =>
        s.model === model ? { ...s, [field]: parseFloat(value) || 0 } : s
      )
    )
    setSuccess(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/marketing/costs/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: settings.map(s => ({
            model: s.model,
            input_price_per_1m: s.input_price_per_1m,
            output_price_per_1m: s.output_price_per_1m,
            image_price_per_call: s.image_price_per_call,
            usd_to_krw: s.usd_to_krw,
          })),
        }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-at-border p-6">
        <h2 className="text-base font-semibold text-at-text mb-4">단가 설정</h2>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-16 bg-at-surface-alt rounded" />
          ))}
        </div>
      </div>
    )
  }

  const exchangeRateSetting = settings.find(s => s.model === 'exchange_rate')
  const modelSettings = settings.filter(s => s.model !== 'exchange_rate')

  return (
    <div className="bg-white rounded-xl border border-at-border p-5">
      <h2 className="text-base font-semibold text-at-text mb-4">단가 설정</h2>

      {/* 환율 */}
      {exchangeRateSetting && (
        <div className="mb-5 pb-4 border-b border-at-border">
          <label className="text-xs font-medium text-at-text-weak block mb-1.5">USD → KRW 환율</label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-at-text-weak">$1 =</span>
            <input
              type="number"
              value={exchangeRateSetting.usd_to_krw}
              onChange={(e) => handleChange('exchange_rate', 'usd_to_krw', e.target.value)}
              className="w-full px-3 py-2 border border-at-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              step="0.01"
            />
            <span className="text-xs text-at-text-weak">원</span>
          </div>
        </div>
      )}

      {/* 모델별 단가 */}
      <div className="space-y-4">
        {modelSettings.map(s => (
          <div key={s.model} className="p-3 bg-at-surface-alt rounded-xl">
            <div className="text-xs font-semibold text-at-text-secondary mb-2">
              {MODEL_LABELS[s.model] || s.model}
            </div>

            {/* 텍스트 모델: input/output 단가 */}
            {s.model.startsWith('claude') && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-at-text-weak block mb-0.5">입력 ($/1M tokens)</label>
                  <input
                    type="number"
                    value={s.input_price_per_1m}
                    onChange={(e) => handleChange(s.model, 'input_price_per_1m', e.target.value)}
                    className="w-full px-2 py-1.5 border border-at-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-at-text-weak block mb-0.5">출력 ($/1M tokens)</label>
                  <input
                    type="number"
                    value={s.output_price_per_1m}
                    onChange={(e) => handleChange(s.model, 'output_price_per_1m', e.target.value)}
                    className="w-full px-2 py-1.5 border border-at-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    step="0.01"
                  />
                </div>
              </div>
            )}

            {/* 이미지 모델: 건당 단가 */}
            {s.model.startsWith('gemini') && (
              <div>
                <label className="text-[10px] text-at-text-weak block mb-0.5">이미지 1건당 ($)</label>
                <input
                  type="number"
                  value={s.image_price_per_call}
                  onChange={(e) => handleChange(s.model, 'image_price_per_call', e.target.value)}
                  className="w-full px-2 py-1.5 border border-at-border rounded text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  step="0.001"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 저장 버튼 */}
      <div className="mt-4">
        {error && <div className="text-xs text-red-500 mb-2">{error}</div>}
        {success && <div className="text-xs text-emerald-600 mb-2">저장되었습니다.</div>}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}
