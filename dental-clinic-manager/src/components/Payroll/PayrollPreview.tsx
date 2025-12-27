'use client'

import { useRef } from 'react'
import type { PayrollStatement } from '@/types/payroll'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import { formatResidentNumberForPayroll } from '@/lib/payrollService'

interface PayrollPreviewProps {
  statement: PayrollStatement
  clinicName: string
  onClose: () => void
}

export default function PayrollPreview({ statement, clinicName, onClose }: PayrollPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null)

  // 인쇄 기능
  const handlePrint = () => {
    const printContent = printRef.current
    if (!printContent) return

    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>급여명세서 - ${statement.statementYear}년 ${statement.statementMonth}월</title>
          <style>
            @page { margin: 10mm; }
            body {
              font-family: 'Malgun Gothic', sans-serif;
              font-size: 12px;
              line-height: 1.4;
              color: #000;
            }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #000; padding: 6px 8px; }
            th { background-color: #f0f0f0; }
            .title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 15px; }
            .header-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            .section-title { background-color: #e0e0e0; text-align: center; font-weight: bold; }
            .amount { text-align: right; }
            .total-row { background-color: #f5f5f5; font-weight: bold; }
            .footer-info { margin-top: 15px; font-size: 11px; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    printWindow.print()
    printWindow.close()
  }

  // 날짜 포맷
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
  }

  // 지급 항목 배열
  const paymentItems = [
    { label: '기본급', value: statement.payments.baseSalary || 0 },
    { label: '상여', value: statement.payments.bonus || 0 },
    { label: '식대', value: statement.payments.mealAllowance || 0 },
    { label: '자가운전', value: statement.payments.vehicleAllowance || 0 },
    { label: '연차수당', value: statement.payments.annualLeaveAllowance || 0 },
    { label: '추가급여', value: statement.payments.additionalPay || 0 },
    { label: '초과근무수당', value: statement.payments.overtimePay || 0 },
  ]

  // 공제 항목 배열
  const deductionItems = [
    { label: '국민연금', value: statement.deductions.nationalPension },
    { label: '건강보험', value: statement.deductions.healthInsurance },
    { label: '장기요양보험료', value: statement.deductions.longTermCare },
    { label: '고용보험', value: statement.deductions.employmentInsurance },
    { label: '기타공제액', value: statement.deductions.otherDeductions || 0 },
    { label: '건강보험료정산', value: statement.deductions.healthInsuranceAdjustment || 0 },
    { label: '장기요양보험료정산', value: statement.deductions.longTermCareAdjustment || 0 },
    { label: '소득세', value: statement.deductions.incomeTax },
    { label: '지방소득세', value: statement.deductions.localIncomeTax },
    { label: '농특세', value: statement.deductions.agricultureTax || 0 },
  ]

  // 행 수 맞추기 (최소 11행)
  const maxRows = Math.max(paymentItems.length, deductionItems.length, 11)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-800">급여명세서 미리보기</h2>
          <div className="flex space-x-3">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              인쇄
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 rounded-md hover:bg-slate-50"
            >
              닫기
            </button>
          </div>
        </div>

        {/* 명세서 내용 */}
        <div ref={printRef} className="p-8">
          {/* 제목 */}
          <h1 className="text-2xl font-bold text-center mb-6">
            {statement.statementYear}년 {statement.statementMonth}월분 급여명세서
          </h1>

          {/* 기본 정보 */}
          <div className="mb-4 text-sm">
            <div className="flex justify-between mb-1">
              <span>회 사 명 : {clinicName}</span>
              <span>입 사 일 : {formatDate(statement.hireDate)}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span>성    명 : {statement.employeeName}</span>
              <span className="flex space-x-8">
                <span>생년월일(사번) : {formatResidentNumberForPayroll(statement.employeeResidentNumber)}</span>
                <span>지 급 일 : {formatDate(statement.paymentDate)}</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span>부    서 : {statement.department || ''}</span>
              <span>직    위 : {statement.position || ''}</span>
            </div>
          </div>

          {/* 세부 내역 테이블 */}
          <table className="w-full border-collapse border border-slate-400 text-sm">
            {/* 헤더 */}
            <thead>
              <tr>
                <th colSpan={4} className="border border-slate-400 bg-slate-200 py-2 text-center font-bold">
                  세부 내역
                </th>
              </tr>
              <tr>
                <th colSpan={2} className="border border-slate-400 bg-slate-100 py-1.5 text-center">
                  지         급
                </th>
                <th colSpan={2} className="border border-slate-400 bg-slate-100 py-1.5 text-center">
                  공         제
                </th>
              </tr>
              <tr>
                <th className="border border-slate-400 bg-slate-50 py-1.5 text-center w-1/4">
                  임 금 항 목
                </th>
                <th className="border border-slate-400 bg-slate-50 py-1.5 text-center w-1/4">
                  지 급 금 액
                </th>
                <th className="border border-slate-400 bg-slate-50 py-1.5 text-center w-1/4">
                  공 제 항 목
                </th>
                <th className="border border-slate-400 bg-slate-50 py-1.5 text-center w-1/4">
                  공 제 금 액
                </th>
              </tr>
            </thead>

            {/* 본문 */}
            <tbody>
              {Array.from({ length: maxRows }).map((_, index) => {
                const payment = paymentItems[index]
                const deduction = deductionItems[index]

                return (
                  <tr key={index}>
                    <td className="border border-slate-400 py-1.5 px-2">
                      {payment?.label || ''}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-2 text-right">
                      {payment && payment.value > 0 ? formatCurrency(payment.value) : ''}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-2">
                      {deduction?.label || ''}
                    </td>
                    <td className="border border-slate-400 py-1.5 px-2 text-right">
                      {deduction && deduction.value > 0 ? formatCurrency(deduction.value) : ''}
                    </td>
                  </tr>
                )
              })}

              {/* 합계 행 */}
              <tr className="bg-slate-100 font-bold">
                <td className="border border-slate-400 py-2 px-2 text-center">
                  지 급 액 계
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right">
                  {formatCurrency(statement.totalPayment)}
                </td>
                <td className="border border-slate-400 py-2 px-2 text-center">
                  공 제 액 계
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right">
                  {formatCurrency(statement.totalDeduction)}
                </td>
              </tr>

              {/* 실수령액 행 */}
              <tr className="bg-slate-200 font-bold">
                <td colSpan={2} className="border border-slate-400"></td>
                <td className="border border-slate-400 py-2 px-2 text-center">
                  실 수 령 액
                </td>
                <td className="border border-slate-400 py-2 px-2 text-right text-blue-700">
                  {formatCurrency(statement.netPay)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* 근무 정보 */}
          <div className="mt-4 text-sm border border-slate-400 p-3">
            <div className="grid grid-cols-3 gap-x-4 gap-y-1">
              <div className="flex justify-between">
                <span>• 근 로 일 수 :</span>
                <span>{statement.workInfo?.workDays || ''}</span>
              </div>
              <div className="flex justify-between">
                <span>• 연장근로시간수 :</span>
                <span>{statement.workInfo?.overtimeHours || ''}</span>
              </div>
              <div className="flex justify-between">
                <span>• 휴일근로시간수 :</span>
                <span>{statement.workInfo?.holidayWorkHours || ''}</span>
              </div>
              <div className="flex justify-between">
                <span>• 총 근로시간수 :</span>
                <span>{statement.workInfo?.totalWorkHours || ''}</span>
              </div>
              <div className="flex justify-between">
                <span>• 야간근로시간수 :</span>
                <span>{statement.workInfo?.nightWorkHours || ''}</span>
              </div>
              <div className="flex justify-between">
                <span>• 통 상 시 급 (원) :</span>
                <span>{statement.workInfo?.hourlyRate ? formatCurrency(statement.workInfo.hourlyRate) : ''}</span>
              </div>
              <div className="flex justify-between col-span-2">
                <span></span>
              </div>
              <div className="flex justify-between">
                <span>• 가 족 수 :</span>
                <span>{statement.workInfo?.familyCount || ''}</span>
              </div>
            </div>
          </div>

          {/* 하단 정보 (세후 계약 안내) */}
          {statement.salaryType === 'net' && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
              ※ 본 급여명세서는 세후 계약 기준으로 작성되었습니다.
              실수령액 {formatCurrency(statement.netPay)}원을 기준으로 세전 금액이 역산되었습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
