'use client'

import dynamic from 'next/dynamic'

const RegimeMarketGrid = dynamic(() => import('./RegimeMarketGrid'), { ssr: false })

export default function RegimeContent() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">시장 국면 분석</h1>
        <p className="mt-1 text-sm text-gray-600">
          학술 검증 모델(Gupta 2025 HMM Voting Ensemble) 기반으로 주요 시장 지수의 현재 국면(Bull/Bear/Sideways/Crisis)과 5/10/30일 전환 확률을 분석합니다.
          매일 KST 20:30 자동 갱신되며, 매크로 입력(VIX, 금리, 환율)을 활용합니다.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Phase 2 진행 중 — 섹터/사용자 종목/알림/Strategy Matrix 연동은 다음 단계에 추가 예정.
        </p>
      </header>

      <RegimeMarketGrid />
    </div>
  )
}
