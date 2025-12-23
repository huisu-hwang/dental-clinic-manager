'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface CashLedgerHistoryItem {
  id: string
  report_date: string
  ledger_type: 'carried_forward' | 'closing_balance'
  items: Array<{ id: string; label: string; value: number; count: number }>
  total_amount: number
  author_name: string
  is_past_date_edit: boolean
  edited_at: string
}

interface GroupedHistory {
  date: string
  carried_forward: CashLedgerHistoryItem | null
  closing_balance: CashLedgerHistoryItem | null
  editCount: number
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

export default function CashLedgerHistory() {
  const [history, setHistory] = useState<GroupedHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const supabase = createClient()
      if (!supabase) {
        console.error('[CashLedgerHistory] Supabase client not available')
        return
      }

      // 현금 출납 히스토리 조회 (최근 30일)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data, error } = await supabase
        .from('cash_ledger_history')
        .select('*')
        .gte('report_date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('report_date', { ascending: false })
        .order('edited_at', { ascending: false })

      if (error) {
        console.error('[CashLedgerHistory] Error fetching history:', error)
        return
      }

      if (!data || data.length === 0) {
        setHistory([])
        return
      }

      // 날짜별로 그룹화하고 각 타입별 최신 기록만 유지
      const groupedMap = new Map<string, {
        carried_forward: CashLedgerHistoryItem | null
        closing_balance: CashLedgerHistoryItem | null
        editCount: number
      }>()

      for (const item of data) {
        const existing = groupedMap.get(item.report_date) || {
          carried_forward: null,
          closing_balance: null,
          editCount: 0
        }

        existing.editCount++

        if (item.ledger_type === 'carried_forward' && !existing.carried_forward) {
          existing.carried_forward = item
        } else if (item.ledger_type === 'closing_balance' && !existing.closing_balance) {
          existing.closing_balance = item
        }

        groupedMap.set(item.report_date, existing)
      }

      const grouped: GroupedHistory[] = Array.from(groupedMap.entries())
        .map(([date, data]) => ({
          date,
          ...data
        }))
        .sort((a, b) => b.date.localeCompare(a.date))

      setHistory(grouped)
    } catch (err) {
      console.error('[CashLedgerHistory] Unexpected error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const toggleExpand = (date: string) => {
    setExpandedDates(prev => {
      const newSet = new Set(prev)
      if (newSet.has(date)) {
        newSet.delete(date)
      } else {
        newSet.add(date)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        불러오는 중...
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500 text-sm">
        현금 출납 기록이 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history.map((item) => {
        const isExpanded = expandedDates.has(item.date)
        const latestEdit = item.carried_forward?.edited_at || item.closing_balance?.edited_at
        const authorName = item.carried_forward?.author_name || item.closing_balance?.author_name || '알 수 없음'

        return (
          <div key={item.date} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* 헤더 */}
            <button
              onClick={() => toggleExpand(item.date)}
              className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
                <span className="font-medium text-sm text-slate-800">
                  {formatDate(item.date)}
                </span>
                {item.editCount > 2 && (
                  <span className="text-xs text-slate-500">
                    (수정 {Math.floor(item.editCount / 2)}회)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>작성자: {authorName}</span>
                {latestEdit && (
                  <span className="hidden sm:inline">
                    최종 수정: {formatDateTime(latestEdit)}
                  </span>
                )}
              </div>
            </button>

            {/* 상세 내용 */}
            {isExpanded && (
              <div className="p-3 sm:p-4 space-y-3 bg-white">
                {/* 전일 이월액 */}
                {item.carried_forward && (
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-blue-800">전일 이월액</span>
                      <span className="text-sm font-bold text-blue-800">
                        {formatCurrency(item.carried_forward.total_amount)}원
                      </span>
                    </div>
                    {item.carried_forward.items && item.carried_forward.items.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {item.carried_forward.items.map((cashItem, idx) => (
                          <span key={idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                            {cashItem.label}: {cashItem.count}개
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 금일 잔액 */}
                {item.closing_balance && (
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-800">금일 잔액</span>
                      <span className="text-sm font-bold text-green-800">
                        {formatCurrency(item.closing_balance.total_amount)}원
                      </span>
                    </div>
                    {item.closing_balance.items && item.closing_balance.items.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {item.closing_balance.items.map((cashItem, idx) => (
                          <span key={idx} className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {cashItem.label}: {cashItem.count}개
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* 증감 표시 */}
                {item.carried_forward && item.closing_balance && (
                  <div className="text-center pt-2 border-t border-slate-100">
                    {(() => {
                      const diff = item.closing_balance.total_amount - item.carried_forward.total_amount
                      return (
                        <span className={`text-sm font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-red-600' : 'text-slate-500'}`}>
                          증감: {diff > 0 ? '+' : ''}{formatCurrency(diff)}원
                        </span>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
