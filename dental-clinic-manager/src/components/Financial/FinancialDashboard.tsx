'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  FinancialSummary,
  ExpenseRecord,
  EXPENSE_CATEGORY_LABELS,
  ExpenseCategoryType,
} from '@/types/financial'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import RevenueForm from './RevenueForm'
import ExpenseForm from './ExpenseForm'
import HometaxSyncPanel from './HometaxSyncPanel'
import HometaxDataView from './HometaxDataView'
import HometaxCredentialsSettings from './HometaxCredentialsSettings'
// import TaxSettingsForm from './TaxSettingsForm' // 추후 구체화 후 복원
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Plus,
  ChevronLeft,
  ChevronRight,
  Loader2,
  FileText,
  Trash2,
  Calculator,
  Building2,
  BarChart3,
  Building,
  Mail,
  ChevronDown,
  ChevronUp,
  Settings,
  RefreshCw,
  Download,
} from 'lucide-react'
import dynamic from 'next/dynamic'

const EmailIntegrationSettings = dynamic(() => import('@/components/marketing/EmailIntegrationSettings'), { ssr: false })
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

export default function FinancialDashboard() {
  const { user } = useAuth()
  const clinicId = user?.clinic_id

  // 현재 연월
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)

  // 데이터 상태
  const [summary, setSummary] = useState<FinancialSummary | null>(null)
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([])
  const [loading, setLoading] = useState(true)

  // 수입 동기화 상태
  const [syncPending, setSyncPending] = useState(false)
  const [syncRetryCount, setSyncRetryCount] = useState(0)
  const [backfillLoading, setBackfillLoading] = useState(false)

  // 모달 상태
  const [showRevenueForm, setShowRevenueForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)

  // 탭 상태 (URL ?tab=settings 로 진입 시 설정 탭 자동 활성화)
  const [activeTab, setActiveTab] = useState<'status' | 'settings'>(() => {
    if (typeof window === 'undefined') return 'status'
    const params = new URLSearchParams(window.location.search)
    return params.get('tab') === 'settings' ? 'settings' : 'status'
  })

  // 데이터 로드
  const loadData = async () => {
    if (!clinicId) return

    try {
      // 재무 요약 로드
      const summaryRes = await fetch(
        `/api/financial/summary?clinicId=${clinicId}&year=${selectedYear}&month=${selectedMonth}`
      )
      const summaryData = await summaryRes.json()
      if (summaryData.success) {
        setSummary(summaryData.data)
        setSyncPending(!!summaryData.sync_pending)
      }

      // 지출 내역 로드
      const expenseRes = await fetch(
        `/api/financial/expense?clinicId=${clinicId}&year=${selectedYear}&month=${selectedMonth}`
      )
      const expenseData = await expenseRes.json()
      if (expenseData.success) {
        setExpenses(expenseData.data || [])
      }
    } catch (error) {
      console.error('Error loading financial data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setSyncRetryCount(0)
    loadData()
  }, [clinicId, selectedYear, selectedMonth])

  // sync_pending일 때 자동 재조회
  // 워커 동기화 주기가 최대 5분이므로, 처음 30초는 5초 간격 → 이후 15초 간격으로 최대 5분까지 폴링
  useEffect(() => {
    if (!syncPending) return
    const maxRetries = 26 // 6회(30초) + 20회(300초) = 약 5분 30초
    if (syncRetryCount >= maxRetries) return
    const interval = syncRetryCount < 6 ? 5000 : 15000
    const timer = setTimeout(() => {
      setSyncRetryCount(prev => prev + 1)
      loadData()
    }, interval)
    return () => clearTimeout(timer)
  }, [syncPending, syncRetryCount])

  // 과거 데이터 전체 불러오기
  const handleBackfillRequest = async () => {
    if (!clinicId) return
    setBackfillLoading(true)
    try {
      const res = await fetch('/api/dentweb/request-revenue-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinic_id: clinicId, mode: 'backfill' }),
      })
      const result = await res.json()
      if (result.success) {
        await appAlert(`${result.data.added_count}개월 수입 데이터 동기화를 요청했습니다. 워커에서 처리 후 자동으로 반영됩니다.`)
        setSyncPending(true)
        setSyncRetryCount(0)
      } else {
        await appAlert(result.error || '요청 실패')
      }
    } catch {
      await appAlert('요청 중 오류가 발생했습니다.')
    } finally {
      setBackfillLoading(false)
    }
  }

  // 월 이동
  const goToPreviousMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear(selectedYear - 1)
      setSelectedMonth(12)
    } else {
      setSelectedMonth(selectedMonth - 1)
    }
  }

  const goToNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear(selectedYear + 1)
      setSelectedMonth(1)
    } else {
      setSelectedMonth(selectedMonth + 1)
    }
  }

  // 지출 삭제
  const handleDeleteExpense = async (expenseId: string) => {
    if (!await appConfirm('이 지출 기록을 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/financial/expense?id=${expenseId}`, {
        method: 'DELETE',
      })
      const result = await response.json()
      if (result.success) {
        loadData()
      } else {
        await appAlert('삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('Delete error:', error)
      await appAlert('삭제 중 오류가 발생했습니다.')
    }
  }

  const profitMargin = summary?.total_revenue
    ? ((summary.pre_tax_profit / summary.total_revenue) * 100).toFixed(1)
    : '0'

  if (!clinicId) {
    return (
      <div className="p-6 text-center text-at-text-weak">
        병원 정보를 불러올 수 없습니다.
      </div>
    )
  }

  return (
    <div className="bg-white min-h-screen">
      {/* 서브 탭 네비게이션 (sticky) */}
      <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 flex items-center justify-between gap-3">
        <nav className="flex space-x-1 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-xl font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'status'
                ? 'bg-at-accent-light text-at-accent'
                : 'text-at-text-weak hover:bg-at-surface-alt'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            현황 조회
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-xl font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-at-accent-light text-at-accent'
                : 'text-at-text-weak hover:bg-at-surface-alt'
            }`}
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            설정
          </button>
        </nav>

        {/* Date Selector */}
        {activeTab === 'status' && (
          <div className="flex items-center gap-1 bg-at-surface-alt p-1 rounded-xl border border-at-border flex-shrink-0">
            <button
              onClick={goToPreviousMonth}
              className="p-1.5 hover:bg-white rounded-xl transition-all duration-200 text-at-text"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 py-1 text-at-text font-bold tracking-wide min-w-[100px] text-center text-sm bg-white rounded-xl border border-at-border">
              {selectedYear}년 {selectedMonth}월
            </div>
            <button
              onClick={goToNextMonth}
              className="p-1.5 hover:bg-white rounded-xl transition-all duration-200 text-at-text"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 탭 콘텐츠 */}
      <div className="p-4 sm:p-6 space-y-6">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          <p className="text-at-text font-medium animate-pulse">데이터를 불러오는 중...</p>
        </div>
      ) : activeTab === 'status' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* 수입 동기화 안내 배너 */}
          {syncPending && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-amber-600 animate-spin" />
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    {selectedYear}년 {selectedMonth}월 수입 데이터를 덴트웹에서 불러오는 중...
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    워커 동기화 주기에 따라 자동으로 반영됩니다 (최대 수 분 소요)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleBackfillRequest}
                  disabled={backfillLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-xl hover:bg-amber-700 transition disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {backfillLoading ? '요청 중...' : '과거 전체 불러오기'}
                </button>
              </div>
            </div>
          )}

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl shadow-sm border border-at-border p-6 overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="w-24 h-24 text-emerald-600 transform translate-x-4 -translate-y-4" />
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold tracking-wider text-at-text uppercase">총 수입</p>
                {summary?.revenue_source_type === 'dentweb' && (
                  <span className="bg-cyan-100 text-cyan-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">덴트웹 연동</span>
                )}
              </div>
              <h3 className="text-3xl font-black text-at-text mt-2 mb-4">
                {formatCurrency(summary?.total_revenue || 0)}
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-medium bg-at-surface-alt rounded-xl p-3">
                  <div className="flex flex-col">
                    <span className="text-at-text">보험수입</span>
                    <span className="text-emerald-700 text-sm mt-0.5">{formatCurrency(summary?.insurance_revenue || 0)}</span>
                  </div>
                  <div className="h-8 w-px bg-at-border"></div>
                  <div className="flex flex-col items-end">
                    <span className="text-at-text">비보험수입</span>
                    <span className="text-emerald-700 text-sm mt-0.5">{formatCurrency(summary?.non_insurance_revenue || 0)}</span>
                  </div>
                </div>
                {(summary?.other_revenue || 0) > 0 && (
                  <div className="flex items-center justify-between text-xs font-medium bg-at-surface-alt rounded-xl p-3">
                    <span className="text-at-text">기타수입</span>
                    <span className="text-emerald-700 text-sm">{formatCurrency(summary?.other_revenue || 0)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-at-border p-6 overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingDown className="w-24 h-24 text-rose-600 transform translate-x-4 -translate-y-4" />
              </div>
              <p className="text-sm font-semibold tracking-wider text-at-text uppercase">총 지출</p>
              <h3 className="text-3xl font-black text-at-text mt-2 mb-4">
                {formatCurrency(summary?.total_expense || 0)}
              </h3>
              <div className="flex items-center justify-between text-xs font-medium bg-at-surface-alt rounded-xl p-3">
                <div className="flex flex-col">
                  <span className="text-at-text">인건비 비중</span>
                  <span className="text-rose-700 text-sm mt-0.5">{formatCurrency(summary?.personnel_expense || 0)}</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-500 to-blue-600 rounded-3xl shadow-md p-6 overflow-hidden relative group hover:shadow-lg transition-shadow text-white">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <DollarSign className="w-24 h-24 text-white transform translate-x-4 -translate-y-4" />
              </div>
              <p className="text-sm font-semibold tracking-wider text-indigo-100 uppercase">세전 순이익</p>
              <h3 className="text-3xl font-black mt-2 mb-4">
                {formatCurrency(summary?.pre_tax_profit || 0)}
              </h3>
              <div className="flex items-center justify-between text-xs font-medium bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <span>영업 이익률</span>
                <span className="text-base">{profitMargin}%</span>
              </div>
            </div>

            {/* 예상 세후 순이익 카드 — 추후 구체화 후 다시 노출 예정 */}
          </div>

          {/* Hometax Integration - Placeholder */}
          <div className="pt-6">
            <h2 className="text-xl font-bold text-at-text mb-6 flex items-center gap-2">
              <Building className="w-6 h-6 text-indigo-500" />
              홈택스 매입·매출 통합 현황
              <span className="bg-amber-100 text-amber-700 text-xs px-2.5 py-1 rounded-full ml-2">연동 준비 중</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Pillar 1-2: Hometax Data Summary (6종 데이터 카드) */}
              <div className="lg:col-span-2 bg-white rounded-3xl border border-at-border shadow-sm overflow-hidden">
                <div className="p-5">
                  <HometaxDataView
                    clinicId={clinicId}
                    year={selectedYear}
                    month={selectedMonth}
                  />
                </div>
              </div>

              {/* Pillar 3: Hometax Sync Manager */}
              <div className="bg-white rounded-3xl border border-at-border shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 flex-1">
                  <HometaxSyncPanel
                    clinicId={clinicId}
                    year={selectedYear}
                    month={selectedMonth}
                    onSyncComplete={loadData}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Detailed Expense Table Section */}
              <div className="bg-white rounded-3xl shadow-sm border border-at-border overflow-hidden">
                <div className="p-6 border-b border-at-border flex items-center justify-between bg-at-surface-alt/50">
                  <h2 className="text-lg font-bold text-at-text flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-indigo-500" />
                    상세 지출 내역
                    <span className="bg-at-border text-at-text text-xs px-2 py-0.5 rounded-full ml-2">
                      {expenses.length}건
                    </span>
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowRevenueForm(true)}
                      className="flex items-center justify-center w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
                      title="수입 추가"
                    >
                      <TrendingUp className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {expenses.length === 0 ? (
                  <div className="p-16 text-center text-at-text flex flex-col items-center">
                    <div className="w-20 h-20 bg-at-surface-alt rounded-full flex items-center justify-center mb-4">
                      <FileText className="w-10 h-10 text-at-text" />
                    </div>
                    <p className="font-medium text-at-text text-lg">이번 달 지출 내역이 없습니다</p>
                    <p className="text-sm mt-1">설정 탭에서 지출을 추가하거나 홈택스 연동을 진행하세요.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-at-surface-alt/80 text-xs uppercase font-semibold text-at-text tracking-wider">
                          <th className="px-6 py-4 border-b border-at-border">분류</th>
                          <th className="px-6 py-4 border-b border-at-border">내역</th>
                          <th className="px-6 py-4 border-b border-at-border text-right">금액</th>
                          <th className="px-6 py-4 border-b border-at-border text-center">증빙</th>
                          <th className="px-6 py-4 border-b border-at-border text-center">작업</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-at-border">
                        {expenses.map(expense => {
                          const isPayroll = expense.source === 'payroll'
                          return (
                          <tr key={expense.id} className="hover:bg-at-surface-alt/80 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-at-surface-alt text-at-text">
                                  {expense.category?.name ||
                                    EXPENSE_CATEGORY_LABELS[expense.category?.type as ExpenseCategoryType] ||
                                    '기타'}
                                </span>
                                {isPayroll && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700" title="급여 명세서에서 자동 생성됨">
                                    급여 자동
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-medium text-at-text">{expense.description || '-'}</p>
                              <p className="text-xs text-at-text mt-0.5">{expense.vendor_name}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <p className="font-bold text-at-text">{formatCurrency(expense.amount)}</p>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex justify-center gap-1.5">
                                {expense.has_tax_invoice && (
                                  <div className="w-8 h-8 rounded-full bg-at-accent-light flex items-center justify-center text-at-accent" title="세금계산서">
                                    <Receipt className="w-4 h-4" />
                                  </div>
                                )}
                                {expense.is_business_card && (
                                  <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600" title="사업용카드">
                                    <Building2 className="w-4 h-4" />
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              {isPayroll ? (
                                <span className="text-[10px] text-at-text-weak" title="급여 명세서에서 관리됩니다">
                                  급여에서 관리
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="w-8 h-8 inline-flex items-center justify-center text-at-text hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </td>
                          </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6">
              {/* Category Breakdown */}
              {summary && (
                <div className="bg-white rounded-3xl shadow-sm border border-at-border p-6">
                  <h2 className="text-lg font-bold text-at-text mb-6 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-indigo-500" />
                    지출 카테고리
                  </h2>
                  <div className="space-y-4">
                    {[
                      { label: '인건비', value: summary.personnel_expense, color: 'bg-rose-500' },
                      { label: '사업용카드 매입', value: summary.business_card_purchase || 0, color: 'bg-indigo-500' },
                      { label: '임대료', value: summary.rent_expense, color: 'bg-purple-500' },
                      { label: '재료비', value: summary.material_expense, color: 'bg-emerald-500' },
                      { label: '유지비', value: summary.utilities_expense, color: 'bg-amber-500' },
                    ].map(item => {
                      const total = summary.total_expense || 1;
                      const percent = Math.round((item.value / total) * 100);
                      return (
                        <div key={item.label} className="group">
                          <div className="flex justify-between items-end mb-1">
                            <span className="text-sm font-semibold text-at-text">{item.label}</span>
                            <span className="text-sm font-bold text-at-text">{formatCurrency(item.value)}</span>
                          </div>
                          <div className="w-full h-2.5 bg-at-surface-alt rounded-full overflow-hidden">
                            <div
                              className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Estimated Tax Information (올해 누적 기준) */}
              {summary && (
                <div className="bg-slate-800 rounded-3xl shadow-sm border border-at-border p-6 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Calculator className="w-32 h-32" />
                  </div>
                  <h2 className="text-lg font-bold mb-2 flex items-center gap-2 relative z-10">
                    <Calculator className="w-5 h-5 text-at-accent" />
                    예상 세금 (올해 누적)
                  </h2>
                  <p className="text-xs text-slate-300 mb-6 relative z-10">
                    1월~{summary?.estimated_elapsed_months || selectedMonth}월 누적 순이익 기준 추정. 설정 탭에서 세무 설정을 업데이트하면 정확도가 높아집니다.
                  </p>
                  <div className="space-y-4 relative z-10">
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-slate-200">누적 순이익</span>
                      <span className="font-medium text-white">{formatCurrency(summary.ytd_net_income ?? 0)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-slate-200">과세표준 (공제 반영)</span>
                      <span className="font-medium text-white">{formatCurrency(summary.estimated_taxable_income ?? 0)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-slate-200">예상 종합소득세</span>
                      <span className="font-medium text-white">{formatCurrency(summary.estimated_income_tax ?? 0)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-slate-200">예상 지방소득세</span>
                      <span className="font-medium text-white">{formatCurrency(summary.estimated_local_tax ?? 0)}</span>
                    </div>
                    <div className="w-full h-px bg-slate-700 my-2"></div>
                    <div className="flex justify-between items-center px-1">
                      <span className="text-sm text-rose-300 font-medium">예상 세금 합계</span>
                      <span className="text-xl font-black text-white">{formatCurrency(summary.estimated_total_tax ?? 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'settings' ? (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          {/* 지출 입력 */}
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-at-text flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-indigo-500" />
                  지출 입력
                </h2>
                <p className="text-sm text-at-text mt-1">
                  {selectedYear}년 {selectedMonth}월 지출 내역을 수동으로 추가합니다.
                </p>
              </div>
              <button
                onClick={() => setShowExpenseForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                지출 추가
              </button>
            </div>
            <div className="text-xs text-at-text bg-at-surface-alt rounded-xl p-3">
              현황 조회 탭에서 선택한 월({selectedYear}년 {selectedMonth}월)에 추가됩니다. 다른 월에 입력하려면 현황 조회 탭에서 월을 변경한 뒤 다시 시도하세요.
            </div>
          </div>

          {/* 세무 설정 (예상 세금 계산용) — 추후 구체화 후 다시 노출 예정 */}
          {/* <TaxSettingsForm clinicId={clinicId} onSaved={loadData} /> */}

          {/* 홈택스 인증정보 설정 */}
          <HometaxCredentialsSettings clinicId={clinicId} />

          {/* 이메일 자동 연동 */}
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-6">
            <h2 className="text-lg font-bold text-at-text mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-at-accent" />
              이메일 자동 연동
            </h2>
            <p className="text-sm text-at-text mb-6">
              병원 이메일을 연동하면 기공료·급여명세서를 자동으로 처리합니다.
            </p>
            <EmailIntegrationSettings />
          </div>
        </div>
      ) : null}
      </div>

      {/* 수입 입력 모달 */}
      {showRevenueForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <RevenueForm
              clinicId={clinicId}
              year={selectedYear}
              month={selectedMonth}
              initialData={
                summary
                  ? {
                    insurance_revenue: summary.insurance_revenue,
                    non_insurance_revenue: summary.non_insurance_revenue,
                    other_revenue: summary.other_revenue,
                  }
                  : undefined
              }
              onSave={() => {
                setShowRevenueForm(false)
                loadData()
              }}
              onCancel={() => setShowRevenueForm(false)}
            />
          </div>
        </div>
      )}

      {/* 지출 입력 모달 */}
      {showExpenseForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto bg-white rounded-3xl shadow-2xl animate-in zoom-in-95 duration-200">
            <ExpenseForm
              clinicId={clinicId}
              year={selectedYear}
              month={selectedMonth}
              onSave={() => {
                setShowExpenseForm(false)
                loadData()
              }}
              onCancel={() => setShowExpenseForm(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
