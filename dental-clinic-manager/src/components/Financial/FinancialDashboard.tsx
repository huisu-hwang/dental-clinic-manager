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
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
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

  // 모달 상태
  const [showRevenueForm, setShowRevenueForm] = useState(false)
  const [showExpenseForm, setShowExpenseForm] = useState(false)

  // 탭 상태
  const [activeTab, setActiveTab] = useState<'status' | 'settings'>('status')

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
    loadData()
  }, [clinicId, selectedYear, selectedMonth])

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
      <div className="p-6 text-center text-gray-500">
        병원 정보를 불러올 수 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-0 relative">
      {/* 블루 그라데이션 헤더 - 스크롤 시 고정 */}
      <div className="sticky top-14 z-20 bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">경영 현황</h2>
              <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Financial Dashboard</p>
            </div>
          </div>
          
          {/* Date Selector with sleek UI */}
          {activeTab === 'status' && (
            <div className="flex items-center gap-1 bg-white/10 p-1 rounded-xl shadow-sm border border-white/20 self-start sm:self-auto">
              <button
                onClick={goToPreviousMonth}
                className="p-1.5 sm:p-2 hover:bg-white/20 rounded-xl transition-all duration-200 text-white"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <div className="px-3 sm:px-5 py-1 sm:py-1.5 text-white font-bold tracking-wide min-w-[100px] sm:min-w-[130px] text-center text-sm shadow-sm backdrop-blur-sm bg-white/5 rounded-xl">
                {selectedYear}년 {selectedMonth}월
              </div>
              <button
                onClick={goToNextMonth}
                className="p-1.5 sm:p-2 hover:bg-white/20 rounded-xl transition-all duration-200 text-white"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 서브 탭 네비게이션 - 스크롤 시 고정 */}
      <div className="sticky top-[calc(3.5rem+60px)] sm:top-[calc(3.5rem+72px)] z-10 border-x border-b border-at-border bg-at-surface-alt shadow-sm">
        <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('status')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-xl font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'status'
                ? 'bg-white text-blue-600 shadow-sm border border-at-border'
                : 'text-at-text hover:text-at-text hover:bg-white/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            현황 조회
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-xl font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-white text-blue-600 shadow-sm border border-at-border'
                : 'text-at-text hover:text-at-text hover:bg-white/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            설정
          </button>
        </nav>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-at-surface-alt/50 border-x border-b border-at-border rounded-b-xl p-3 sm:p-6 min-h-[calc(100vh-250px)]">
      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          <p className="text-at-text font-medium animate-pulse">데이터를 불러오는 중...</p>
        </div>
      ) : activeTab === 'status' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl shadow-sm border border-at-border p-6 overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="w-24 h-24 text-emerald-600 transform translate-x-4 -translate-y-4" />
              </div>
              <p className="text-sm font-semibold tracking-wider text-at-text uppercase">총 수입</p>
              <h3 className="text-3xl font-black text-at-text mt-2 mb-4">
                {formatCurrency(summary?.total_revenue || 0)}
              </h3>
              <div className="flex items-center justify-between text-xs font-medium bg-at-surface-alt rounded-xl p-3">
                <div className="flex flex-col">
                  <span className="text-at-text">보험수입</span>
                  <span className="text-emerald-700 text-sm mt-0.5">{formatCurrency(summary?.insurance_revenue || 0)}</span>
                </div>
                <div className="h-8 w-px bg-slate-200"></div>
                <div className="flex flex-col items-end">
                  <span className="text-at-text">비보험수입</span>
                  <span className="text-emerald-700 text-sm mt-0.5">{formatCurrency(summary?.non_insurance_revenue || 0)}</span>
                </div>
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

            <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-3xl shadow-md p-6 overflow-hidden relative group hover:shadow-lg transition-shadow text-white">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <PiggyBank className="w-24 h-24 text-white transform translate-x-4 -translate-y-4" />
              </div>
              <p className="text-sm font-semibold tracking-wider text-purple-200 uppercase">세후 순이익</p>
              <h3 className="text-3xl font-black mt-2 mb-4">
                {formatCurrency(summary?.post_tax_profit || 0)}
              </h3>
              <div className="flex items-center justify-between text-xs font-medium bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <span>예상 납부세액</span>
                <span className="text-base">{formatCurrency(summary?.actual_tax_paid || 0)}</span>
              </div>
            </div>
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
                    <span className="bg-slate-200 text-at-text text-xs px-2 py-0.5 rounded-full ml-2">
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
                      <tbody className="divide-y divide-slate-100">
                        {expenses.map(expense => (
                          <tr key={expense.id} className="hover:bg-at-surface-alt/80 transition-colors group">
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-at-surface-alt text-at-text">
                                {expense.category?.name ||
                                  EXPENSE_CATEGORY_LABELS[expense.category?.type as ExpenseCategoryType] ||
                                  '기타'}
                              </span>
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
                                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600" title="세금계산서">
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
                              <button
                                onClick={() => handleDeleteExpense(expense.id)}
                                className="w-8 h-8 inline-flex items-center justify-center text-at-text hover:bg-rose-50 hover:text-rose-600 rounded-xl transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
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

              {/* Tax Information */}
              {summary && (summary.income_tax > 0 || summary.total_tax > 0) && (
                <div className="bg-slate-800 rounded-3xl shadow-sm border border-at-border p-6 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Calculator className="w-32 h-32" />
                  </div>
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2 relative z-10">
                    <Calculator className="w-5 h-5 text-blue-400" />
                    예상 세금 정보
                  </h2>
                  <div className="space-y-4 relative z-10">
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-at-text">종합소득세</span>
                      <span className="font-medium text-at-text">{formatCurrency(summary.income_tax)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-at-text">지방소득세</span>
                      <span className="font-medium text-at-text">{formatCurrency(summary.local_income_tax)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-2xl">
                      <span className="text-sm text-emerald-300 font-medium">정부 지원</span>
                      <span className="font-bold text-emerald-400">-{formatCurrency(summary.government_support)}</span>
                    </div>
                    <div className="w-full h-px bg-slate-700 my-2"></div>
                    <div className="flex justify-between items-center px-1">
                      <span className="text-sm text-rose-300 font-medium">실납부 세금</span>
                      <span className="text-xl font-black text-white">{formatCurrency(summary.actual_tax_paid)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeTab === 'settings' ? (
        <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
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

          {/* 홈택스 인증정보 설정 */}
          <HometaxCredentialsSettings clinicId={clinicId} />

          {/* 이메일 자동 연동 */}
          <div className="bg-white rounded-2xl shadow-sm border border-at-border p-6">
            <h2 className="text-lg font-bold text-at-text mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-500" />
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
