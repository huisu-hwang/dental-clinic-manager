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
import CodefSyncPanel from './CodefSyncPanel'
import CreditCardSalesPanel from './CreditCardSalesPanel'
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
  CreditCard,
  Building,
  ArrowRight
} from 'lucide-react'

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
    if (!confirm('이 지출 기록을 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/financial/expense?id=${expenseId}`, {
        method: 'DELETE',
      })
      const result = await response.json()
      if (result.success) {
        loadData()
      } else {
        alert('삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('Delete error:', error)
      alert('삭제 중 오류가 발생했습니다.')
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
    <div className="p-6 md:p-8 space-y-8 bg-slate-50 min-h-screen">
      {/* 헤더 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">경영 현황</h1>
          <p className="text-sm text-slate-500 mt-1">월별 수입, 지출, 손익을 한눈에 파악하고 관리하세요.</p>
        </div>

        {/* Date Selector with sleek UI */}
        <div className="flex items-center gap-1 bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
          <button
            onClick={goToPreviousMonth}
            className="p-2.5 hover:bg-slate-100 rounded-xl transition-all duration-200 text-slate-600"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-6 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-bold tracking-wide min-w-[150px] text-center shadow-md">
            {selectedYear}년 {selectedMonth}월
          </div>
          <button
            onClick={goToNextMonth}
            className="p-2.5 hover:bg-slate-100 rounded-xl transition-all duration-200 text-slate-600"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-medium animate-pulse">경영 데이터를 불러오는 중...</p>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">

          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingUp className="w-24 h-24 text-emerald-600 transform translate-x-4 -translate-y-4" />
              </div>
              <p className="text-sm font-semibold tracking-wider text-slate-500 uppercase">총 수입</p>
              <h3 className="text-3xl font-black text-slate-900 mt-2 mb-4">
                {formatCurrency(summary?.total_revenue || 0)}
              </h3>
              <div className="flex items-center justify-between text-xs font-medium bg-slate-50 rounded-xl p-3">
                <div className="flex flex-col">
                  <span className="text-slate-400">보험수입</span>
                  <span className="text-emerald-700 text-sm mt-0.5">{formatCurrency(summary?.insurance_revenue || 0)}</span>
                </div>
                <div className="h-8 w-px bg-slate-200"></div>
                <div className="flex flex-col items-end">
                  <span className="text-slate-400">비보험수입</span>
                  <span className="text-emerald-700 text-sm mt-0.5">{formatCurrency(summary?.non_insurance_revenue || 0)}</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6 overflow-hidden relative group hover:shadow-md transition-shadow">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                <TrendingDown className="w-24 h-24 text-rose-600 transform translate-x-4 -translate-y-4" />
              </div>
              <p className="text-sm font-semibold tracking-wider text-slate-500 uppercase">총 지출</p>
              <h3 className="text-3xl font-black text-slate-900 mt-2 mb-4">
                {formatCurrency(summary?.total_expense || 0)}
              </h3>
              <div className="flex items-center justify-between text-xs font-medium bg-slate-50 rounded-xl p-3">
                <div className="flex flex-col">
                  <span className="text-slate-400">인건비 비중</span>
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

          {/* Hometax Integration Tri-Pillar Dashboard */}
          <div className="pt-6">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
              <Building className="w-6 h-6 text-indigo-500" />
              홈택스 매입·매출 통합 현황
              <span className="bg-indigo-100 text-indigo-700 text-xs px-2.5 py-1 rounded-full ml-2">자동 연동</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Pillar 1: Tax Invoices */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-indigo-300 transition-colors">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600">
                      <FileText className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-800">세금계산서</h3>
                  </div>
                </div>
                <div className="p-6 flex-1 flex flex-col justify-center space-y-6">
                  {summary?.codef_sync ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-500">매출 (발행건)</p>
                          <p className="text-2xl font-bold text-blue-600 mt-1">{summary.codef_sync.tax_invoice_sales_count}건</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-blue-100" />
                      </div>
                      <div className="h-px bg-slate-100 w-full"></div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-500">매입 (수취건)</p>
                          <p className="text-2xl font-bold text-rose-500 mt-1">{summary.codef_sync.tax_invoice_purchase_count}건</p>
                        </div>
                        <TrendingDown className="w-8 h-8 text-rose-100" />
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-slate-400 py-4">
                      연동된 데이터가 없습니다
                    </div>
                  )}
                </div>
              </div>

              {/* Pillar 2: Cash Receipts */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-emerald-300 transition-colors">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                      <Receipt className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-800">현금영수증</h3>
                  </div>
                </div>
                <div className="p-6 flex-1 flex flex-col justify-center space-y-6">
                  {summary?.codef_sync ? (
                    <>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-500">매출 (발행건)</p>
                          <p className="text-2xl font-bold text-emerald-600 mt-1">{summary.codef_sync.cash_receipt_sales_count}건</p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-emerald-100" />
                      </div>
                      <div className="h-px bg-slate-100 w-full"></div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-slate-500">매입 (수취건)</p>
                          <p className="text-2xl font-bold text-rose-500 mt-1">{summary.codef_sync.cash_receipt_purchase_count}건</p>
                        </div>
                        <TrendingDown className="w-8 h-8 text-rose-100" />
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-slate-400 py-4">
                      연동된 데이터가 없습니다
                    </div>
                  )}
                </div>
              </div>

              {/* Pillar 3: Codef Connection Manager / Quick Actions */}
              <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-600">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-slate-800">연동 관리</h3>
                  </div>
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <CodefSyncPanel
                    clinicId={clinicId}
                    year={selectedYear}
                    month={selectedMonth}
                    onSyncComplete={loadData}
                  />
                  {summary?.codef_sync?.synced_at && (
                    <p className="text-xs text-center text-slate-400 mt-4">
                      마지막 동기화: {new Date(summary.codef_sync.synced_at).toLocaleString('ko-KR')}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 신용카드 매출 조회 패널 - Beautiful integration */}
            <div className="mt-6">
              <CreditCardSalesPanel
                clinicId={clinicId}
                year={selectedYear}
                month={selectedMonth}
              />
            </div>
          </div>

          <div className="pt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Detailed Expense Table Section */}
              <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-indigo-500" />
                    상세 지출 내역
                    <span className="bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full ml-2">
                      {expenses.length}건
                    </span>
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowExpenseForm(true)}
                      className="flex items-center justify-center w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100 transition-colors"
                      title="지출 추가"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
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
                  <div className="p-16 text-center text-slate-400 flex flex-col items-center">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                      <FileText className="w-10 h-10 text-slate-300" />
                    </div>
                    <p className="font-medium text-slate-600 text-lg">이번 달 지출 내역이 없습니다</p>
                    <p className="text-sm mt-1 mb-6">수동으로 내역을 추가하거나 홈택스 연동을 진행하세요.</p>
                    <button
                      onClick={() => setShowExpenseForm(true)}
                      className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl shadow-sm hover:bg-indigo-700 transition"
                    >
                      <Plus className="w-5 h-5" />
                      지출 추가하기
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/80 text-xs uppercase font-semibold text-slate-500 tracking-wider">
                          <th className="px-6 py-4 border-b border-slate-100">분류</th>
                          <th className="px-6 py-4 border-b border-slate-100">내역</th>
                          <th className="px-6 py-4 border-b border-slate-100 text-right">금액</th>
                          <th className="px-6 py-4 border-b border-slate-100 text-center">증빙</th>
                          <th className="px-6 py-4 border-b border-slate-100 text-center">작업</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {expenses.map(expense => (
                          <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors group">
                            <td className="px-6 py-4">
                              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                                {expense.category?.name ||
                                  EXPENSE_CATEGORY_LABELS[expense.category?.type as ExpenseCategoryType] ||
                                  '기타'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <p className="font-medium text-slate-800">{expense.description || '-'}</p>
                              <p className="text-xs text-slate-400 mt-0.5">{expense.vendor_name}</p>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <p className="font-bold text-slate-900">{formatCurrency(expense.amount)}</p>
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
                                className="w-8 h-8 inline-flex items-center justify-center text-slate-300 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
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
                <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6">
                  <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
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
                            <span className="text-sm font-semibold text-slate-700">{item.label}</span>
                            <span className="text-sm font-bold text-slate-900">{formatCurrency(item.value)}</span>
                          </div>
                          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
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
                <div className="bg-slate-800 rounded-3xl shadow-sm border border-slate-700 p-6 text-white relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Calculator className="w-32 h-32" />
                  </div>
                  <h2 className="text-lg font-bold mb-6 flex items-center gap-2 relative z-10">
                    <Calculator className="w-5 h-5 text-blue-400" />
                    예상 세금 정보
                  </h2>
                  <div className="space-y-4 relative z-10">
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-slate-300">종합소득세</span>
                      <span className="font-medium text-slate-100">{formatCurrency(summary.income_tax)}</span>
                    </div>
                    <div className="flex justify-between items-center bg-slate-700/50 p-3 rounded-2xl">
                      <span className="text-sm text-slate-300">지방소득세</span>
                      <span className="font-medium text-slate-100">{formatCurrency(summary.local_income_tax)}</span>
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
      )}

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
