'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const RegimeMarketGrid = dynamic(() => import('./RegimeMarketGrid'), { ssr: false })
const RegimeUserTickerTab = dynamic(() => import('./RegimeUserTickerTab'), { ssr: false })

type Tab = 'markets' | 'tickers'

const TABS: { id: Tab; label: string }[] = [
  { id: 'markets', label: '시장 지수' },
  { id: 'tickers', label: '내 종목 분석' },
]

export default function RegimeContent() {
  const [tab, setTab] = useState<Tab>('markets')

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">시장 국면 분석</h1>
        <p className="mt-1 text-sm text-gray-600">
          3가지 학술 모델(Gupta 2025 HMM Voting · RHINE 적응 Kernel Markov · Sun 2025 Reservoir Hypernet)의 소프트 보팅으로
          주요 시장 지수의 현재 국면(Bull/Bear/Sideways/Crisis)과 5/10/30일 전환 확률을 분석합니다.
          매일 KST 20:30 자동 갱신되며, 매크로 입력(VIX, 금리, 환율)을 활용합니다.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          카드 클릭 시 타임라인 · 전환 확률 매트릭스 · 모델별 투표 · 이 국면에서 잘 작동한 전략 Top 10 확인 가능.
        </p>
      </header>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-b-2 border-indigo-600 text-indigo-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'markets' && <RegimeMarketGrid />}
      {tab === 'tickers' && <RegimeUserTickerTab />}
    </div>
  )
}
