'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'

const KeywordAnalysis = dynamic(() => import('./KeywordAnalysis'), { ssr: false })
const CompetitorCompare = dynamic(() => import('./CompetitorCompare'), { ssr: false })
const SeoReport = dynamic(() => import('./SeoReport'), { ssr: false })

type SubTab = 'keyword' | 'compare' | 'report'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'keyword', label: '키워드 분석' },
  { key: 'compare', label: '경쟁 비교' },
  { key: 'report', label: '종합 보고서' },
]

export default function SeoAnalysisTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('keyword')

  return (
    <div className="space-y-4">
      {/* 서브탭 */}
      <div className="flex gap-1 border-b">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveSubTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeSubTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 서브탭 콘텐츠 */}
      {activeSubTab === 'keyword' && <KeywordAnalysis />}
      {activeSubTab === 'compare' && <CompetitorCompare />}
      {activeSubTab === 'report' && <SeoReport />}
    </div>
  )
}
