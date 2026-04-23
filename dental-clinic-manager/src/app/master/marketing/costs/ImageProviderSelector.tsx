'use client'

import { useEffect, useState } from 'react'

type Provider = 'gemini' | 'openai'

const PROVIDER_INFO: Record<Provider, { label: string; description: string; model: string }> = {
  gemini: {
    label: 'Gemini 3.0 Flash',
    model: 'gemini-3.1-flash-image-preview',
    description: 'Google 나노바나나 (기본)',
  },
  openai: {
    label: 'OpenAI gpt-image-2',
    model: 'gpt-image-2',
    description: 'OpenAI 최신 이미지 생성 모델',
  },
}

export default function ImageProviderSelector() {
  const [provider, setProvider] = useState<Provider | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/marketing/image-provider')
        const json = await res.json()
        if (!res.ok) throw new Error(json?.error || '조회 실패')
        setProvider((json.provider as Provider) ?? 'gemini')
      } catch {
        setError('설정을 불러오지 못했습니다.')
        setProvider('gemini')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSelect = async (next: Provider) => {
    if (!provider || provider === next || saving) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/marketing/image-provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: next }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || '저장 실패')
      setProvider(next)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-at-border p-5">
        <h2 className="text-base font-semibold text-at-text mb-4">이미지 생성 모델</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-at-surface-alt rounded" />
          <div className="h-16 bg-at-surface-alt rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-at-border p-5">
      <h2 className="text-base font-semibold text-at-text mb-1">이미지 생성 모델</h2>
      <p className="text-xs text-at-text-weak mb-4">
        AI 글 이미지 생성에 사용할 모델을 선택합니다. 모든 클리닉의 마케팅 이미지 생성에 즉시 반영됩니다.
      </p>

      <div className="space-y-2">
        {(Object.keys(PROVIDER_INFO) as Provider[]).map((key) => {
          const info = PROVIDER_INFO[key]
          const selected = provider === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleSelect(key)}
              disabled={saving}
              className={`w-full text-left p-3 rounded-xl border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                selected
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                  : 'border-at-border bg-white hover:bg-at-surface-alt'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-at-text">{info.label}</div>
                  <div className="text-[11px] text-at-text-weak mt-0.5">{info.description}</div>
                  <div className="text-[10px] text-at-text-weak mt-0.5 font-mono truncate">{info.model}</div>
                </div>
                <div
                  className={`shrink-0 h-4 w-4 rounded-full border ${
                    selected ? 'bg-emerald-500 border-emerald-500' : 'border-at-border'
                  }`}
                  aria-hidden
                />
              </div>
            </button>
          )
        })}
      </div>

      <div className="mt-3 min-h-[18px]">
        {error && <div className="text-xs text-red-500">{error}</div>}
        {success && <div className="text-xs text-emerald-600">변경되었습니다.</div>}
        {saving && <div className="text-xs text-at-text-weak">저장 중...</div>}
      </div>
    </div>
  )
}
