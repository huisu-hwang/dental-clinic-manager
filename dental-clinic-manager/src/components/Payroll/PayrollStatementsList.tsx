'use client'

import { useState, useMemo } from 'react'
import {
  FileText,
  Check,
  Send,
  Trash2,
  Eye,
  Plus,
  MessageCircle,
  ChevronDown,
  Calendar,
  Filter
} from 'lucide-react'
import type { PayrollStatement, PayrollSetting, PayrollStatementStatus } from '@/types/payroll'

interface PayrollStatementsListProps {
  statements: PayrollStatement[]
  settings?: PayrollSetting[]
  onSelect: (statement: PayrollStatement) => void
  onGenerate?: (year: number, month: number) => void
  onConfirm?: (statementId: string) => void
  onDelete?: (statementId: string) => void
  onSendKakao?: (statementId: string, phoneNumber: string) => void
  onBulkSendKakao?: (year: number, month: number) => void
  isMyStatements?: boolean
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
}

const STATUS_LABELS: Record<PayrollStatementStatus, string> = {
  draft: '작성중',
  confirmed: '확정됨',
  sent: '발송완료',
  viewed: '확인완료'
}

const STATUS_COLORS: Record<PayrollStatementStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  confirmed: 'bg-blue-100 text-blue-600',
  sent: 'bg-yellow-100 text-yellow-600',
  viewed: 'bg-green-100 text-green-600'
}

const ROLE_LABELS: Record<string, string> = {
  owner: '원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '팀장',
  staff: '직원'
}

export default function PayrollStatementsList({
  statements,
  settings,
  onSelect,
  onGenerate,
  onConfirm,
  onDelete,
  onSendKakao,
  onBulkSendKakao,
  isMyStatements = false,
  showToast
}: PayrollStatementsListProps) {
  const currentDate = new Date()
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1)
  const [filterStatus, setFilterStatus] = useState<PayrollStatementStatus | 'all'>('all')
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false)

  // 연도 옵션 생성
  const yearOptions = useMemo(() => {
    const years = new Set(statements.map(s => s.payment_year))
    years.add(currentDate.getFullYear())
    years.add(currentDate.getFullYear() - 1)
    return Array.from(years).sort((a, b) => b - a)
  }, [statements, currentDate])

  // 필터링된 명세서
  const filteredStatements = useMemo(() => {
    return statements.filter(s => {
      const matchYear = s.payment_year === selectedYear
      const matchMonth = s.payment_month === selectedMonth
      const matchStatus = filterStatus === 'all' || s.status === filterStatus
      return matchYear && matchMonth && matchStatus
    })
  }, [statements, selectedYear, selectedMonth, filterStatus])

  // 월별 명세서 (그룹화되지 않은 목록)
  const monthlyStatements = useMemo(() => {
    return statements.filter(s => s.payment_year === selectedYear && s.payment_month === selectedMonth)
  }, [statements, selectedYear, selectedMonth])

  // 확정된 명세서 수
  const confirmedCount = monthlyStatements.filter(s => s.status !== 'draft').length
  const totalCount = monthlyStatements.length

  const handleGenerate = () => {
    if (onGenerate) {
      onGenerate(selectedYear, selectedMonth)
      setShowGenerateConfirm(false)
    }
  }

  const handleBulkSendKakao = () => {
    if (onBulkSendKakao) {
      if (confirmedCount === 0) {
        showToast('확정된 급여 명세서가 없습니다.', 'warning')
        return
      }
      if (confirm(`${selectedYear}년 ${selectedMonth}월 확정된 급여 명세서를 일괄 발송하시겠습니까?`)) {
        onBulkSendKakao(selectedYear, selectedMonth)
      }
    }
  }

  if (statements.length === 0 && isMyStatements) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">급여 명세서가 없습니다.</p>
        <p className="text-sm text-slate-400 mt-1">급여일이 되면 명세서가 생성됩니다.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 필터 및 액션 */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 연도 선택 */}
          <div className="relative">
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(Number(e.target.value))}
              className="appearance-none pl-4 pr-10 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {yearOptions.map(year => (
                <option key={year} value={year}>{year}년</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 월 선택 */}
          <div className="relative">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(Number(e.target.value))}
              className="appearance-none pl-4 pr-10 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                <option key={month} value={month}>{month}월</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>

          {/* 상태 필터 */}
          {!isMyStatements && (
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as PayrollStatementStatus | 'all')}
                className="appearance-none pl-9 pr-10 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">전체 상태</option>
                <option value="draft">작성중</option>
                <option value="confirmed">확정됨</option>
                <option value="sent">발송완료</option>
                <option value="viewed">확인완료</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          )}
        </div>

        {/* 액션 버튼 (관리자용) */}
        {!isMyStatements && (
          <div className="flex items-center gap-3">
            {onBulkSendKakao && confirmedCount > 0 && (
              <button
                onClick={handleBulkSendKakao}
                className="inline-flex items-center px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                일괄 발송
              </button>
            )}

            {onGenerate && (
              <button
                onClick={() => setShowGenerateConfirm(true)}
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                명세서 생성
              </button>
            )}
          </div>
        )}
      </div>

      {/* 월별 요약 (관리자용) */}
      {!isMyStatements && (
        <div className="p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Calendar className="w-5 h-5 text-slate-500" />
              <span className="font-medium text-slate-700">
                {selectedYear}년 {selectedMonth}월 급여 명세서
              </span>
            </div>
            <div className="text-sm text-slate-600">
              총 {totalCount}건 / 확정 {confirmedCount}건
            </div>
          </div>
        </div>
      )}

      {/* 명세서 목록 */}
      {filteredStatements.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">
            {selectedYear}년 {selectedMonth}월의 급여 명세서가 없습니다.
          </p>
          {!isMyStatements && onGenerate && (
            <button
              onClick={() => setShowGenerateConfirm(true)}
              className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              명세서 생성
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200">
                {!isMyStatements && (
                  <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">직원명</th>
                )}
                <th className="text-left py-3 px-4 text-sm font-medium text-slate-600">기간</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">총 지급액</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">공제액</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-slate-600">실수령액</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">상태</th>
                <th className="text-center py-3 px-4 text-sm font-medium text-slate-600">관리</th>
              </tr>
            </thead>
            <tbody>
              {filteredStatements.map(statement => (
                <tr
                  key={statement.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => onSelect(statement)}
                >
                  {!isMyStatements && (
                    <td className="py-3 px-4">
                      <div>
                        <span className="font-medium text-slate-800">
                          {statement.employee?.name || '알 수 없음'}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {ROLE_LABELS[statement.employee?.role || ''] || statement.employee?.role}
                        </span>
                      </div>
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <span className="text-slate-800">
                      {statement.payment_year}년 {statement.payment_month}월
                    </span>
                    <span className="block text-xs text-slate-500">
                      지급일: {statement.payment_date}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-slate-800">
                      {statement.total_earnings.toLocaleString()}원
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-red-600">
                      -{statement.total_deductions.toLocaleString()}원
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="font-medium text-blue-600">
                      {statement.net_pay.toLocaleString()}원
                    </span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${STATUS_COLORS[statement.status]}`}>
                      {STATUS_LABELS[statement.status]}
                    </span>
                  </td>
                  <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center space-x-1">
                      <button
                        onClick={() => onSelect(statement)}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="상세보기"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {!isMyStatements && onConfirm && statement.status === 'draft' && (
                        <button
                          onClick={() => onConfirm(statement.id)}
                          className="p-2 text-slate-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="확정"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}

                      {!isMyStatements && onSendKakao && statement.status === 'confirmed' && (
                        <button
                          onClick={() => {
                            const setting = settings?.find(s => s.employee_user_id === statement.employee_user_id)
                            if (setting?.kakao_phone_number) {
                              onSendKakao(statement.id, setting.kakao_phone_number)
                            } else {
                              showToast('카카오톡 발송 전화번호가 설정되지 않았습니다.', 'warning')
                            }
                          }}
                          className="p-2 text-slate-500 hover:text-yellow-600 hover:bg-yellow-50 rounded-lg transition-colors"
                          title="카카오톡 발송"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      )}

                      {!isMyStatements && onDelete && statement.status === 'draft' && (
                        <button
                          onClick={() => onDelete(statement.id)}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 명세서 생성 확인 모달 */}
      {showGenerateConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              급여 명세서 생성
            </h3>
            <p className="text-slate-600 mb-6">
              {selectedYear}년 {selectedMonth}월 급여 명세서를 생성하시겠습니까?
              <br />
              <span className="text-sm text-slate-500">
                등록된 모든 직원의 급여 설정을 기반으로 명세서가 생성됩니다.
              </span>
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowGenerateConfirm(false)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleGenerate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
