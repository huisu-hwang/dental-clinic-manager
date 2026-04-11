'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Receipt,
  CreditCard,
  Building2,
  TrendingUp,
  TrendingDown,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { formatCurrency } from '@/utils/taxCalculationUtils'

interface HometaxDataViewProps {
  clinicId: string
  year: number
  month: number
}

interface HometaxSummary {
  summary: Record<string, { count: number; totalAmount: number; scrapedAt: string | null }>
  lastSyncedAt: string | null
  hasData: boolean
}

interface RawDataRecord {
  data_type: string
  raw_data: Record<string, unknown>[]
  record_count: number
  scraped_at: string
}

const DATA_TYPE_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bgColor: string }> = {
  // 세금계산서는 현재 제외 (추후 구현 예정)
  cash_receipt_sales: { label: '현금영수증 매출', icon: Receipt, color: 'text-emerald-600', bgColor: 'bg-emerald-100' },
  cash_receipt_purchase: { label: '현금영수증 매입', icon: Receipt, color: 'text-orange-600', bgColor: 'bg-orange-100' },
  business_card_purchase: { label: '사업용카드 매입', icon: CreditCard, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  credit_card_sales: { label: '신용카드 매출', icon: Building2, color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
}

export default function HometaxDataView({ clinicId, year, month }: HometaxDataViewProps) {
  const [summary, setSummary] = useState<HometaxSummary | null>(null)
  const [detailData, setDetailData] = useState<RawDataRecord[]>([])
  const [expandedType, setExpandedType] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const loadSummary = useCallback(async () => {
    try {
      const res = await fetch(`/api/hometax/data/summary?clinicId=${clinicId}&year=${year}&month=${month}`)
      const data = await res.json()
      if (data.success) {
        setSummary(data.data)
      }
    } catch {
      // 무시
    } finally {
      setLoading(false)
    }
  }, [clinicId, year, month])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  // 상세 데이터 로드
  const loadDetail = async (dataType: string) => {
    if (expandedType === dataType) {
      setExpandedType(null)
      return
    }

    try {
      const res = await fetch(`/api/hometax/data?clinicId=${clinicId}&year=${year}&month=${month}&dataType=${dataType}`)
      const data = await res.json()
      if (data.success && data.data?.length > 0) {
        setDetailData(data.data)
      } else {
        setDetailData([])
      }
    } catch {
      setDetailData([])
    }

    setExpandedType(dataType)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    )
  }

  if (!summary?.hasData) {
    return null // 데이터 없으면 섹션 자체를 숨김
  }

  return (
    <div className="space-y-4">
      {/* 요약 카드 그리드 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(DATA_TYPE_CONFIG).map(([key, config]) => {
          const data = summary?.summary[key]
          const totalAmount = data?.totalAmount || 0
          const Icon = config.icon
          const isSales = key.includes('sales')

          return (
            <button
              key={key}
              onClick={() => loadDetail(key)}
              className={`p-4 rounded-2xl border transition-all text-left ${
                expandedType === key
                  ? 'border-indigo-300 bg-indigo-50/50 shadow-sm'
                  : 'border-at-border bg-white hover:border-at-border hover:shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`w-8 h-8 rounded-xl ${config.bgColor} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${config.color}`} />
                </div>
                {isSales ? (
                  <TrendingUp className="w-4 h-4 text-at-text" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-at-text" />
                )}
              </div>
              <p className="text-xs font-medium text-at-text">{config.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${totalAmount > 0 ? config.color : 'text-at-text'}`}>
                {totalAmount > 0 ? formatCurrency(totalAmount) : '0원'}
              </p>
              {expandedType === key ? (
                <ChevronUp className="w-3 h-3 text-indigo-400 mt-1" />
              ) : totalAmount > 0 ? (
                <ChevronDown className="w-3 h-3 text-at-text mt-1" />
              ) : null}
            </button>
          )
        })}
      </div>

      {/* 마지막 동기화 시간 */}
      {summary?.lastSyncedAt && (
        <p className="text-xs text-center text-at-text">
          마지막 동기화: {new Date(summary.lastSyncedAt).toLocaleString('ko-KR')}
        </p>
      )}

      {/* 상세 데이터 테이블 */}
      {expandedType && detailData.length > 0 && (
        <div className="bg-white rounded-2xl border border-at-border overflow-hidden animate-in slide-in-from-top-2 duration-200">
          <div className="p-4 border-b border-at-border bg-at-surface-alt/50">
            <h4 className="text-sm font-bold text-at-text">
              {DATA_TYPE_CONFIG[expandedType]?.label} 상세
            </h4>
          </div>
          <div className="overflow-x-auto max-h-80">
            {detailData.map((rawData, idx) => {
              const records = rawData.raw_data || []
              if (records.length === 0) {
                return (
                  <div key={idx} className="p-6 text-center text-at-text text-sm">
                    데이터가 없습니다
                  </div>
                )
              }

              // 컬럼 키 추출
              const columns = Object.keys(records[0])

              return (
                <table key={idx} className="w-full text-xs">
                  <thead>
                    <tr className="bg-at-surface-alt">
                      {columns.map(col => (
                        <th key={col} className="px-3 py-2 text-left text-at-text font-medium whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-at-border">
                    {records.slice(0, 50).map((record, rIdx) => (
                      <tr key={rIdx} className="hover:bg-at-surface-alt">
                        {columns.map(col => {
                          const val = record[col]
                          const isAmount = typeof val === 'number' && (
                            col.includes('amount') || col.includes('vat') || col.includes('tax') || col.includes('payment')
                          )
                          return (
                            <td key={col} className={`px-3 py-2 whitespace-nowrap ${isAmount ? 'text-right font-medium' : ''}`}>
                              {isAmount ? formatCurrency(val as number) : String(val ?? '')}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })}
          </div>
          {detailData.some(d => (d.raw_data?.length || 0) > 50) && (
            <div className="p-3 text-center text-xs text-at-text border-t border-at-border">
              최대 50건까지 표시됩니다
            </div>
          )}
        </div>
      )}
    </div>
  )
}
