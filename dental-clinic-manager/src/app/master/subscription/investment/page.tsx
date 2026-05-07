'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'

interface Plan {
  id: string
  feature_id: string
  display_name: string
  monthly_base_price: number
  revenue_share_pct: number
  description: string | null
  is_active: boolean
}

export default function InvestmentPlanAdminPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    if (!authLoading && (!user || user.role !== 'master_admin')) {
      router.replace('/dashboard')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user || user.role !== 'master_admin') return
    fetch('/api/master/user-subscription-plans')
      .then(r => r.json())
      .then((rows: Plan[]) => {
        const inv = rows.find(p => p.feature_id === 'investment') ?? null
        setPlan(inv)
        setLoading(false)
      })
      .catch(e => { setError(String(e)); setLoading(false) })
  }, [user])

  const onSave = async () => {
    if (!plan) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/master/user-subscription-plans/${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthly_base_price: plan.monthly_base_price,
          revenue_share_pct: plan.revenue_share_pct,
          is_active: plan.is_active,
          description: plan.description ?? '',
        }),
      })
      if (!res.ok) { setError((await res.json()).error ?? '저장 실패') }
      else setSavedAt(new Date())
    } finally { setSaving(false) }
  }

  if (authLoading || loading) {
    return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }
  if (!plan) return <div className="p-8 text-red-600">플랜을 찾을 수 없습니다.</div>

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <h1 className="text-2xl font-bold">자동매매 구독료 관리</h1>
      <p className="text-sm text-gray-500">
        변경된 가격은 다음 청구 주기부터 적용됩니다. 진행 중인 결제에는 영향 없음.
      </p>

      <div className="space-y-4 bg-white rounded-xl border p-6">
        <div>
          <label className="block text-sm font-semibold mb-1">월 정액 (원)</label>
          <input
            type="number"
            min={0}
            value={plan.monthly_base_price}
            onChange={e => setPlan({ ...plan, monthly_base_price: Number(e.target.value) })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">수익 공유 % (0~50)</label>
          <input
            type="number" step="0.01" min={0} max={50}
            value={plan.revenue_share_pct}
            onChange={e => setPlan({ ...plan, revenue_share_pct: Number(e.target.value) })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold mb-1">설명</label>
          <textarea
            value={plan.description ?? ''}
            onChange={e => setPlan({ ...plan, description: e.target.value })}
            className="w-full border rounded-lg px-3 py-2"
            rows={3}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={plan.is_active}
            onChange={e => setPlan({ ...plan, is_active: e.target.checked })}
          />
          플랜 활성화
        </label>

        {error && <div className="text-red-600 text-sm">{error}</div>}
        {savedAt && <div className="text-green-600 text-sm">저장됨: {savedAt.toLocaleTimeString()}</div>}

        <button
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          저장
        </button>
      </div>
    </div>
  )
}
