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

    setLoading(true)
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

  // 수익률 계산
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
    <div className="p-6 space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">경영 현황</h1>
          <p className="text-sm text-gray-500 mt-1">월별 수입, 지출, 손익을 관리합니다.</p>
        </div>

        {/* 월 선택 */}
        <div className="flex items-center gap-2">
          <button
            onClick={goToPreviousMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="px-4 py-2 bg-white border rounded-lg font-semibold min-w-[140px] text-center">
            {selectedYear}년 {selectedMonth}월
          </div>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 총 수입 */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">총 수입</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(summary?.total_revenue || 0)}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    <span className="text-blue-600">
                      보험 {formatCurrency(summary?.insurance_revenue || 0)}
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="text-purple-600">
                      비보험 {formatCurrency(summary?.non_insurance_revenue || 0)}
                    </span>
                  </div>
                </div>
                <div className="p-3 bg-green-100 rounded-full">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            {/* 총 지출 */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">총 지출</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(summary?.total_expense || 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    인건비 {formatCurrency(summary?.personnel_expense || 0)}
                  </p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            {/* 세전 순이익 */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">세전 순이익</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      (summary?.pre_tax_profit || 0) >= 0 ? 'text-blue-600' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(summary?.pre_tax_profit || 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">수익률 {profitMargin}%</p>
                </div>
                <div className="p-3 bg-blue-100 rounded-full">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            {/* 세후 순이익 */}
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">세후 순이익</p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      (summary?.post_tax_profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {formatCurrency(summary?.post_tax_profit || 0)}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    세금 {formatCurrency(summary?.actual_tax_paid || 0)}
                  </p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <PiggyBank className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowRevenueForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <TrendingUp className="w-4 h-4" />
              수입 입력
            </button>
            <button
              onClick={() => setShowExpenseForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              지출 추가
            </button>
          </div>

          {/* CODEF 홈택스 연동 패널 */}
          <CodefSyncPanel
            clinicId={clinicId}
            year={selectedYear}
            month={selectedMonth}
            onSyncComplete={loadData}
          />

          {/* 지출 내역 테이블 */}
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Receipt className="w-5 h-5 text-gray-400" />
                지출 내역
              </h2>
              <span className="text-sm text-gray-500">{expenses.length}건</span>
            </div>

            {expenses.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>이번 달 지출 내역이 없습니다.</p>
                <button
                  onClick={() => setShowExpenseForm(true)}
                  className="mt-3 text-blue-600 hover:underline text-sm"
                >
                  지출 추가하기
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        카테고리
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        내역
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        거래처
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        금액
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        증빙
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                        작업
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {expenses.map(expense => (
                      <tr key={expense.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {expense.category?.name ||
                              EXPENSE_CATEGORY_LABELS[
                                expense.category?.type as ExpenseCategoryType
                              ] ||
                              '기타'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {expense.description || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {expense.vendor_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-right font-medium">
                          {formatCurrency(expense.amount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {expense.has_tax_invoice && (
                            <span
                              className="inline-flex items-center text-green-600"
                              title="세금계산서"
                            >
                              <Receipt className="w-4 h-4" />
                            </span>
                          )}
                          {expense.is_business_card && (
                            <span
                              className="inline-flex items-center text-blue-600 ml-1"
                              title="사업용카드"
                            >
                              <Building2 className="w-4 h-4" />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            title="삭제"
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

          {/* 지출 카테고리별 요약 */}
          {summary && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-gray-400" />
                지출 카테고리별 현황
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {[
                  { label: '인건비', value: summary.personnel_expense, color: 'blue' },
                  { label: '임대료', value: summary.rent_expense, color: 'purple' },
                  { label: '관리비', value: summary.utilities_expense, color: 'yellow' },
                  { label: '재료비', value: summary.material_expense, color: 'green' },
                  { label: '기공비', value: summary.lab_expense, color: 'pink' },
                  { label: '기타', value: summary.other_expense, color: 'gray' },
                ].map(item => (
                  <div key={item.label} className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">{item.label}</p>
                    <p className="text-sm font-semibold mt-1">
                      {formatCurrency(item.value || 0)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 세금 정보 */}
          {summary && (summary.income_tax > 0 || summary.total_tax > 0) && (
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-gray-400" />
                세금 정보
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">종합소득세</p>
                  <p className="text-lg font-semibold mt-1">
                    {formatCurrency(summary.income_tax)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">지방소득세</p>
                  <p className="text-lg font-semibold mt-1">
                    {formatCurrency(summary.local_income_tax)}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">정부 지원</p>
                  <p className="text-lg font-semibold mt-1 text-green-600">
                    +{formatCurrency(summary.government_support)}
                  </p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg">
                  <p className="text-xs text-gray-500">실납부 세금</p>
                  <p className="text-lg font-semibold mt-1 text-red-600">
                    {formatCurrency(summary.actual_tax_paid)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 수입 입력 모달 */}
      {showRevenueForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
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
