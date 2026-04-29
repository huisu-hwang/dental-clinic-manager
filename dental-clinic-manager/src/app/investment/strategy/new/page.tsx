'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StrategyBuilder from '@/components/Investment/StrategyBuilder/StrategyBuilder'
import RLStrategyForm from '@/components/Investment/RLModels/RLStrategyForm'

type StrategyType = 'rule' | 'rl'

export default function NewStrategyPage() {
  const router = useRouter()
  const [type, setType] = useState<StrategyType>('rule')

  return (
    <div className="p-4 sm:p-6 space-y-4 bg-white min-h-screen">
      {/* 전략 유형 토글 */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setType('rule')}
          className={
            type === 'rule'
              ? 'bg-at-accent-light text-at-accent px-3 py-1.5 rounded-xl text-sm font-medium'
              : 'px-3 py-1.5 text-at-text-secondary hover:bg-at-surface-alt rounded-xl text-sm'
          }
        >
          룰 기반
        </button>
        <button
          type="button"
          onClick={() => setType('rl')}
          className={
            type === 'rl'
              ? 'bg-at-accent-light text-at-accent px-3 py-1.5 rounded-xl text-sm font-medium'
              : 'px-3 py-1.5 text-at-text-secondary hover:bg-at-surface-alt rounded-xl text-sm'
          }
        >
          강화학습 (RL)
        </button>
      </div>

      {/* 콘텐츠 */}
      {type === 'rule' ? (
        <StrategyBuilder
          onSaved={() => router.push('/investment/strategy')}
          onCancel={() => router.push('/investment/strategy')}
        />
      ) : (
        <RLStrategyForm onCreated={() => router.push('/investment/strategy')} />
      )}
    </div>
  )
}
