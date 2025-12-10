'use client'

import { useRef } from 'react'
import {
  X,
  Download,
  Printer,
  Check,
  Send,
  Calendar,
  User,
  DollarSign,
  TrendingDown
} from 'lucide-react'
import type { PayrollStatement, PayrollStatementStatus } from '@/types/payroll'

interface PayrollStatementDetailProps {
  statement: PayrollStatement
  onClose: () => void
  onConfirm?: () => void
  onSendKakao?: (statementId: string, phoneNumber: string) => void
  canManage?: boolean
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

export default function PayrollStatementDetail({
  statement,
  onClose,
  onConfirm,
  onSendKakao,
  canManage = false,
  showToast
}: PayrollStatementDetailProps) {
  const printRef = useRef<HTMLDivElement>(null)

  // PDF 다운로드 (간단한 HTML to Canvas 방식)
  const handleDownloadPDF = async () => {
    try {
      // 동적 import로 html2canvas와 jspdf 로드
      const [html2canvasModule, jsPDFModule] = await Promise.all([
        import('html2canvas'),
        import('jspdf')
      ])
      const html2canvas = html2canvasModule.default
      const jsPDF = jsPDFModule.default

      if (!printRef.current) return

      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight)
      pdf.save(`급여명세서_${statement.employee?.name || '직원'}_${statement.payment_year}년${statement.payment_month}월.pdf`)

      showToast('PDF가 다운로드되었습니다.', 'success')
    } catch (error) {
      console.error('PDF 생성 오류:', error)
      showToast('PDF 생성에 실패했습니다.', 'error')
    }
  }

  // 인쇄
  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) {
      showToast('팝업이 차단되었습니다. 팝업을 허용해주세요.', 'warning')
      return
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>급여명세서 - ${statement.employee?.name || '직원'} ${statement.payment_year}년 ${statement.payment_month}월</title>
        <style>
          body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 10px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f3f4f6; }
          .text-right { text-align: right; }
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .text-lg { font-size: 1.125rem; }
          .text-blue { color: #2563eb; }
          .text-red { color: #dc2626; }
          .bg-blue { background-color: #dbeafe; }
          @media print {
            body { margin: 0; }
          }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  // 수당 목록
  const allowancesList = Object.entries(statement.allowances || {})
  const allowancesTotal = allowancesList.reduce((sum, [, val]) => sum + (Number(val) || 0), 0)

  // 기타 공제 목록
  const otherDeductionsList = Object.entries(statement.other_deductions || {})
  const otherDeductionsTotal = otherDeductionsList.reduce((sum, [, val]) => sum + (Number(val) || 0), 0)

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">급여 명세서</h3>
          <p className="text-sm text-slate-500">
            {statement.payment_year}년 {statement.payment_month}월
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className={`px-3 py-1 text-sm font-medium rounded-full ${STATUS_COLORS[statement.status]}`}>
            {STATUS_LABELS[statement.status]}
          </span>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleDownloadPDF}
            className="inline-flex items-center px-3 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <Download className="w-4 h-4 mr-2 text-slate-500" />
            PDF 다운로드
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center px-3 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm"
          >
            <Printer className="w-4 h-4 mr-2 text-slate-500" />
            인쇄
          </button>
        </div>

        {canManage && (
          <div className="flex items-center space-x-2">
            {onConfirm && statement.status === 'draft' && (
              <button
                onClick={onConfirm}
                className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Check className="w-4 h-4 mr-2" />
                확정
              </button>
            )}
            {onSendKakao && statement.status === 'confirmed' && (
              <button
                onClick={() => {
                  // TODO: 전화번호 조회 필요
                  showToast('카카오톡 발송 기능은 급여 설정에서 전화번호를 확인해주세요.', 'info')
                }}
                className="inline-flex items-center px-3 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm"
              >
                <Send className="w-4 h-4 mr-2" />
                카카오톡 발송
              </button>
            )}
          </div>
        )}
      </div>

      {/* 명세서 내용 */}
      <div ref={printRef} className="p-6 space-y-6">
        {/* 기본 정보 */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <User className="w-5 h-5 text-slate-400" />
            <div>
              <div className="text-sm text-slate-500">직원</div>
              <div className="font-medium text-slate-800">
                {statement.employee?.name || '알 수 없음'}
                <span className="ml-2 text-sm text-slate-500">
                  ({ROLE_LABELS[statement.employee?.role || ''] || statement.employee?.role})
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <Calendar className="w-5 h-5 text-slate-400" />
            <div>
              <div className="text-sm text-slate-500">지급일</div>
              <div className="font-medium text-slate-800">{statement.payment_date}</div>
            </div>
          </div>
        </div>

        {/* 지급 내역 */}
        <div>
          <h4 className="flex items-center text-sm font-medium text-slate-700 mb-3">
            <DollarSign className="w-4 h-4 mr-2 text-blue-500" />
            지급 내역
          </h4>
          <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-2 px-4 text-sm font-medium text-slate-600 border-b border-slate-200">항목</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-slate-600 border-b border-slate-200">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2 px-4 text-slate-700">기본급</td>
                <td className="py-2 px-4 text-right text-slate-800">{statement.base_salary.toLocaleString()}원</td>
              </tr>
              {allowancesList.map(([name, amount]) => (
                <tr key={name} className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">{name}</td>
                  <td className="py-2 px-4 text-right text-slate-800">{Number(amount).toLocaleString()}원</td>
                </tr>
              ))}
              {statement.overtime_pay > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">연장근로수당</td>
                  <td className="py-2 px-4 text-right text-slate-800">{statement.overtime_pay.toLocaleString()}원</td>
                </tr>
              )}
              {statement.bonus > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">상여금</td>
                  <td className="py-2 px-4 text-right text-slate-800">{statement.bonus.toLocaleString()}원</td>
                </tr>
              )}
              {statement.other_earnings > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">기타 지급</td>
                  <td className="py-2 px-4 text-right text-slate-800">{statement.other_earnings.toLocaleString()}원</td>
                </tr>
              )}
              <tr className="bg-blue-50">
                <td className="py-3 px-4 font-medium text-blue-700">지급 합계</td>
                <td className="py-3 px-4 text-right font-bold text-blue-700">{statement.total_earnings.toLocaleString()}원</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 공제 내역 */}
        <div>
          <h4 className="flex items-center text-sm font-medium text-slate-700 mb-3">
            <TrendingDown className="w-4 h-4 mr-2 text-red-500" />
            공제 내역
          </h4>
          <table className="w-full border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left py-2 px-4 text-sm font-medium text-slate-600 border-b border-slate-200">항목</th>
                <th className="text-right py-2 px-4 text-sm font-medium text-slate-600 border-b border-slate-200">금액</th>
              </tr>
            </thead>
            <tbody>
              {statement.national_pension > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">국민연금</td>
                  <td className="py-2 px-4 text-right text-red-600">-{statement.national_pension.toLocaleString()}원</td>
                </tr>
              )}
              {statement.health_insurance > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">건강보험</td>
                  <td className="py-2 px-4 text-right text-red-600">-{statement.health_insurance.toLocaleString()}원</td>
                </tr>
              )}
              {statement.long_term_care > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">장기요양보험</td>
                  <td className="py-2 px-4 text-right text-red-600">-{statement.long_term_care.toLocaleString()}원</td>
                </tr>
              )}
              {statement.employment_insurance > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">고용보험</td>
                  <td className="py-2 px-4 text-right text-red-600">-{statement.employment_insurance.toLocaleString()}원</td>
                </tr>
              )}
              {statement.income_tax > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">소득세</td>
                  <td className="py-2 px-4 text-right text-red-600">-{statement.income_tax.toLocaleString()}원</td>
                </tr>
              )}
              {statement.local_income_tax > 0 && (
                <tr className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">지방소득세</td>
                  <td className="py-2 px-4 text-right text-red-600">-{statement.local_income_tax.toLocaleString()}원</td>
                </tr>
              )}
              {otherDeductionsList.map(([name, amount]) => (
                <tr key={name} className="border-b border-slate-100">
                  <td className="py-2 px-4 text-slate-700">{name}</td>
                  <td className="py-2 px-4 text-right text-red-600">-{Number(amount).toLocaleString()}원</td>
                </tr>
              ))}
              <tr className="bg-red-50">
                <td className="py-3 px-4 font-medium text-red-700">공제 합계</td>
                <td className="py-3 px-4 text-right font-bold text-red-700">-{statement.total_deductions.toLocaleString()}원</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 실수령액 */}
        <div className="p-6 bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl text-white">
          <div className="text-center">
            <div className="text-sm opacity-80 mb-1">실수령액</div>
            <div className="text-3xl font-bold">{statement.net_pay.toLocaleString()}원</div>
          </div>
        </div>

        {/* 근태 정보 */}
        {(statement.work_days > 0 || statement.overtime_hours > 0 || statement.leave_days > 0) && (
          <div className="p-4 bg-slate-50 rounded-lg">
            <h4 className="text-sm font-medium text-slate-700 mb-3">근태 정보</h4>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-slate-800">{statement.work_days}</div>
                <div className="text-sm text-slate-500">근무일</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{statement.overtime_hours}</div>
                <div className="text-sm text-slate-500">연장근로(시간)</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-slate-800">{statement.leave_days}</div>
                <div className="text-sm text-slate-500">휴가일</div>
              </div>
            </div>
          </div>
        )}

        {/* 메모 */}
        {statement.notes && (
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="text-sm font-medium text-yellow-800 mb-2">메모</h4>
            <p className="text-sm text-yellow-700">{statement.notes}</p>
          </div>
        )}

        {/* 푸터 정보 */}
        <div className="text-center text-xs text-slate-400 pt-4 border-t border-slate-200">
          <p>발급일시: {new Date(statement.created_at).toLocaleString('ko-KR')}</p>
          {statement.confirmed_at && (
            <p>확정일시: {new Date(statement.confirmed_at).toLocaleString('ko-KR')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
