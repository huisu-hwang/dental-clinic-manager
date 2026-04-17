'use client'

import { useEffect, useState, useCallback } from 'react'
import { Target, Plus, Play, Pause, Trash2, BarChart3, Edit3 } from 'lucide-react'
import Link from 'next/link'
import type { InvestmentStrategy } from '@/types/investment'

export default function StrategyListPage() {
  const [strategies, setStrategies] = useState<InvestmentStrategy[]>([])
  const [loading, setLoading] = useState(true)

  const loadStrategies = useCallback(async () => {
    try {
      const res = await fetch('/api/investment/strategies')
      const json = await res.json()
      if (json.data) setStrategies(json.data)
    } catch {
      console.error('전략 목록 조회 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStrategies() }, [loadStrategies])

  const toggleActive = async (id: string, isActive: boolean) => {
    const res = await fetch('/api/investment/strategies', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !isActive }),
    })
    if (res.ok) loadStrategies()
  }

  const deleteStrategy = async (id: string) => {
    if (!confirm('이 전략을 삭제하시겠습니까?')) return
    const res = await fetch(`/api/investment/strategies?id=${id}`, { method: 'DELETE' })
    if (res.ok) loadStrategies()
    else {
      const json = await res.json()
      alert(json.error || '삭제 실패')
    }
  }

  const MARKET_LABELS: Record<string, string> = { KR: '국내', US: '미국' }
  const LEVEL_LABELS: Record<number, string> = { 1: '알림만', 2: '완전자동' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-at-text">전략 관리</h1>
          <p className="text-sm text-at-text-secondary mt-1">매매 전략을 생성하고 백테스트하세요</p>
        </div>
        <Link
          href="/investment/strategy/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover transition-colors"
        >
          <Plus className="w-4 h-4" />
          새 전략 만들기
        </Link>
      </div>

      {loading ? (
        <div className="bg-at-surface rounded-2xl shadow-at-card p-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-at-bg rounded-xl" />
            ))}
          </div>
        </div>
      ) : strategies.length === 0 ? (
        <div className="bg-at-surface rounded-2xl shadow-at-card p-8">
          <div className="flex flex-col items-center justify-center py-8 text-at-text-weak">
            <Target className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">아직 생성된 전략이 없습니다</p>
            <p className="text-xs mt-1">새 전략을 만들어 백테스트해보세요</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map(s => (
            <div key={s.id} className="bg-at-surface rounded-2xl shadow-at-card p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-at-text">{s.name}</h3>
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                      s.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {s.is_active ? '활성' : '비활성'}
                    </span>
                    <span className="px-2 py-0.5 text-xs rounded-full bg-at-accent-light text-at-accent font-medium">
                      {MARKET_LABELS[s.target_market] || s.target_market}
                    </span>
                  </div>
                  {s.description && (
                    <p className="text-xs text-at-text-secondary mt-1">{s.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-2 text-xs text-at-text-weak">
                    <span>시간프레임: {s.timeframe}</span>
                    <span>지표: {(s.indicators as unknown[]).length}개</span>
                    <span>자동화: {LEVEL_LABELS[s.automation_level] || s.automation_level}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Link
                    href={`/investment/strategy/${s.id}/backtest`}
                    className="p-2 rounded-lg hover:bg-at-bg transition-colors text-at-text-secondary"
                    title="백테스트"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </Link>
                  <Link
                    href={`/investment/strategy/${s.id}/edit`}
                    className="p-2 rounded-lg hover:bg-at-bg transition-colors text-at-text-secondary"
                    title="수정"
                  >
                    <Edit3 className="w-4 h-4" />
                  </Link>
                  <button
                    onClick={() => toggleActive(s.id, s.is_active)}
                    className="p-2 rounded-lg hover:bg-at-bg transition-colors text-at-text-secondary"
                    title={s.is_active ? '비활성화' : '활성화'}
                  >
                    {s.is_active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => deleteStrategy(s.id)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-400"
                    title="삭제"
                    disabled={s.is_active}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
