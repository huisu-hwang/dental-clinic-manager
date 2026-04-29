'use client'
import { useEffect, useState } from 'react'
import type { RLModel } from '@/types/rlTrading'
import ModelLibraryPanel from '@/components/Investment/RLModels/ModelLibraryPanel'
import KillSwitchToggle from '@/components/Investment/RLModels/KillSwitchToggle'

export default function RLModelsPage() {
  const [models, setModels] = useState<RLModel[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = () => {
    fetch('/api/investment/rl-models')
      .then((r) => r.json())
      .then((j) => setModels(j.data ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between pb-3 border-b border-at-border">
        <h2 className="text-lg font-bold text-at-text">RL 모델 라이브러리</h2>
        <KillSwitchToggle />
      </div>
      <div className="bg-at-error-bg border border-at-error rounded-xl p-3 text-sm text-at-error">
        ⚠ 강화학습 모델은 검증 전까지 paper 계좌 + automation_level=1 사용을 강력히 권장합니다.
      </div>
      <ModelLibraryPanel models={models} onChange={refresh} />
    </div>
  )
}
