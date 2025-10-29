'use client'

/**
 * ContractDetail Component
 * Displays full contract details with signature capability
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { contractService } from '@/lib/contractService'
import SignaturePad from './SignaturePad'
import type { EmploymentContract, ContractSigningData, SignerType } from '@/types/contract'
import type { User } from '@/types/auth'
import { formatResidentNumber, maskResidentNumber } from '@/utils/residentNumberUtils'

interface ContractDetailProps {
  contractId: string
  currentUser: User
}

export default function ContractDetail({ contractId, currentUser }: ContractDetailProps) {
  const router = useRouter()
  const [contract, setContract] = useState<EmploymentContract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signerType, setSignerType] = useState<SignerType>('employee')
  const [signatureStatus, setSignatureStatus] = useState({
    hasEmployerSignature: false,
    hasEmployeeSignature: false
  })

  // Load contract
  useEffect(() => {
    loadContract()
  }, [contractId])

  const loadContract = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await contractService.getContract(contractId)

      if (response.error) {
        setError(response.error)
      } else if (response.data) {
        setContract(response.data)
        loadSignatureStatus()
      }
    } catch (err) {
      console.error('Failed to load contract:', err)
      setError('근로계약서를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const loadSignatureStatus = async () => {
    try {
      const status = await contractService.getSignatureStatus(contractId)
      setSignatureStatus(status)
    } catch (err) {
      console.error('Failed to load signature status:', err)
    }
  }

  const handleSignClick = (type: SignerType) => {
    setSignerType(type)
    setShowSignatureModal(true)
  }

  const handleSignatureSave = async (signatureData: string) => {
    try {
      // Get client info for audit trail
      const clientInfo: ContractSigningData = {
        contract_id: contractId,
        signer_type: signerType,
        signature_data: signatureData,
        ip_address: undefined, // Will be captured server-side if needed
        device_info: navigator.userAgent,
        user_agent: navigator.userAgent
      }

      const response = await contractService.signContract(clientInfo)

      if (response.success) {
        alert('서명이 완료되었습니다.')
        setShowSignatureModal(false)
        loadContract() // Reload to show updated status
      } else {
        alert(`서명 실패: ${response.error}`)
      }
    } catch (err) {
      console.error('Failed to sign contract:', err)
      alert('서명 중 오류가 발생했습니다.')
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatSalary = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount) + '원'
  }

  const canSign = (type: SignerType): boolean => {
    if (!contract) return false

    if (type === 'employer') {
      // Owner/manager can sign as employer
      return (
        (currentUser.role === 'owner' || currentUser.role === 'manager') &&
        !signatureStatus.hasEmployerSignature
      )
    } else {
      // Employee can sign
      return contract.employee_user_id === currentUser.id && !signatureStatus.hasEmployeeSignature
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleCancel = async () => {
    if (!confirm('이 계약서를 취소하시겠습니까?')) return

    const reason = prompt('취소 사유를 입력해주세요:')
    if (!reason) return

    try {
      const response = await contractService.cancelContract(contractId, currentUser.id, reason)
      if (response.success) {
        alert('계약서가 취소되었습니다.')
        loadContract()
      } else {
        alert(`취소 실패: ${response.error}`)
      }
    } catch (err) {
      console.error('Failed to cancel contract:', err)
      alert('취소 중 오류가 발생했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error || !contract) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">{error || '계약서를 찾을 수 없습니다.'}</p>
        <button onClick={() => router.back()} className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
          돌아가기
        </button>
      </div>
    )
  }

  const data = contract.contract_data

  // Determine if user can view full resident number (owner only)
  const canViewFullResidentNumber = currentUser.role === 'owner' || currentUser.id === contract.employee_user_id
  const displayResidentNumber = canViewFullResidentNumber
    ? formatResidentNumber(data.employee_resident_number)
    : maskResidentNumber(data.employee_resident_number)

  return (
    <div className="max-w-4xl mx-auto">
      {/* Action Bar */}
      <div className="mb-6 flex justify-between items-center print:hidden">
        <button onClick={() => router.back()} className="px-4 py-2 text-gray-600 hover:text-gray-900">
          ← 목록으로
        </button>
        <div className="flex gap-3">
          {canSign('employer') && (
            <button
              onClick={() => handleSignClick('employer')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              원장 서명
            </button>
          )}
          {canSign('employee') && (
            <button
              onClick={() => handleSignClick('employee')}
              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              직원 서명
            </button>
          )}
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
          >
            인쇄
          </button>
          {(currentUser.role === 'owner' || currentUser.role === 'manager') && contract.status !== 'cancelled' && (
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              취소
            </button>
          )}
        </div>
      </div>

      {/* Contract Document */}
      <div className="bg-white p-8 md:p-12 rounded-lg shadow-lg border border-gray-200">
        {/* Title */}
        <h1 className="text-3xl font-bold text-center mb-8">근로계약서</h1>

        {/* Status Badge */}
        <div className="mb-6 flex justify-center">
          <span
            className={`px-4 py-2 rounded-full text-sm font-semibold ${
              contract.status === 'completed'
                ? 'bg-green-100 text-green-800'
                : contract.status === 'cancelled'
                ? 'bg-red-100 text-red-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}
          >
            {contract.status === 'completed'
              ? '✓ 계약 완료'
              : contract.status === 'cancelled'
              ? '✗ 계약 취소'
              : '⏳ 서명 대기중'}
          </span>
        </div>

        {/* Contract Content */}
        <div className="space-y-6 text-sm leading-relaxed">
          {/* Parties */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제1조 (당사자)</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="font-semibold">사용자 (이하 "갑")</p>
                <p>병원명: {data.clinic_name}</p>
                <p>원장: {data.employer_name}</p>
                <p>주소: {data.clinic_address}</p>
              </div>
              <div>
                <p className="font-semibold">근로자 (이하 "을")</p>
                <p>성명: {data.employee_name}</p>
                <p>주민등록번호: {displayResidentNumber}</p>
                <p>주소: {data.employee_address}</p>
                <p>전화: {data.employee_phone}</p>
              </div>
            </div>
          </section>

          {/* Employment Period */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제2조 (근로기간)</h2>
            <p>
              근로 계약 기간은 <strong>{formatDate(data.employment_period_start)}</strong>부터{' '}
              {data.is_permanent ? (
                <strong>무기한</strong>
              ) : (
                <>
                  <strong>{data.employment_period_end && formatDate(data.employment_period_end)}</strong>까지
                </>
              )}
              로 한다.
            </p>
          </section>

          {/* Work Location */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제3조 (근무장소)</h2>
            <p>근무지는 {data.clinic_address}로 한다.</p>
          </section>

          {/* Work Hours */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제4조 (근로시간)</h2>
            <p>
              1일 근로시간은 <strong>{data.work_start_time || '09:00'}</strong>부터{' '}
              <strong>{data.work_end_time || '18:00'}</strong>까지로 하며, 1주 근무일수는{' '}
              <strong>{data.work_days_per_week || 5}일</strong>로 한다.
            </p>
            <p className="mt-2">
              연차 휴가는 연간 <strong>{data.annual_leave_days}일</strong>로 한다.
            </p>
          </section>

          {/* Salary */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제5조 (임금)</h2>
            <div className="space-y-2">
              <p>
                기본급: <strong>{formatSalary(data.salary_base)}</strong> (월)
              </p>
              {data.allowance_meal && (
                <p>
                  식대: <strong>{formatSalary(data.allowance_meal)}</strong>
                </p>
              )}
              {data.allowance_transport && (
                <p>
                  교통비: <strong>{formatSalary(data.allowance_transport)}</strong>
                </p>
              )}
              {data.allowance_other && (
                <p>
                  기타 수당: <strong>{formatSalary(data.allowance_other)}</strong>
                </p>
              )}
              <p>
                임금 지급일: 매월 <strong>{data.salary_payment_day}일</strong>
              </p>
            </div>
          </section>

          {/* Social Insurance */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제6조 (사회보험)</h2>
            <p>갑은 을에 대하여 다음 각호의 사회보험에 가입한다:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {data.social_insurance && <li>국민연금</li>}
              {data.health_insurance && <li>건강보험</li>}
              {data.employment_insurance && <li>고용보험</li>}
              {data.pension_insurance && <li>산재보험</li>}
            </ul>
          </section>

          {/* Special Terms */}
          {data.special_terms && (
            <section className="border-b pb-4">
              <h2 className="text-lg font-bold mb-3">제7조 (특약사항)</h2>
              <p className="whitespace-pre-wrap">{data.special_terms}</p>
            </section>
          )}

          {/* General Provisions */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제8조 (기타)</h2>
            <p>이 계약서에 명시되지 않은 사항은 근로기준법 및 관계 법령에 따른다.</p>
          </section>
        </div>

        {/* Signatures */}
        <div className="mt-12 pt-8 border-t">
          <p className="text-center mb-8">위 근로계약을 증명하기 위하여 계약 당사자가 서명날인한다.</p>

          <div className="grid grid-cols-2 gap-8">
            {/* Employer Signature */}
            <div className="border rounded-lg p-4">
              <h3 className="font-bold mb-4 text-center">사용자 (갑)</h3>
              {signatureStatus.hasEmployerSignature ? (
                <div className="text-center">
                  <div className="bg-green-50 border border-green-200 rounded p-4 mb-2">
                    <p className="text-green-800 font-semibold">✓ 서명 완료</p>
                  </div>
                  <p className="text-xs text-gray-600">
                    서명일: {contract.updated_at && formatDate(contract.updated_at)}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="bg-gray-100 border border-gray-300 rounded p-4 mb-2">
                    <p className="text-gray-600">서명 대기중</p>
                  </div>
                  {canSign('employer') && (
                    <button
                      onClick={() => handleSignClick('employer')}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      서명하기 →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Employee Signature */}
            <div className="border rounded-lg p-4">
              <h3 className="font-bold mb-4 text-center">근로자 (을)</h3>
              {signatureStatus.hasEmployeeSignature ? (
                <div className="text-center">
                  <div className="bg-green-50 border border-green-200 rounded p-4 mb-2">
                    <p className="text-green-800 font-semibold">✓ 서명 완료</p>
                  </div>
                  <p className="text-xs text-gray-600">
                    서명일: {contract.updated_at && formatDate(contract.updated_at)}
                  </p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="bg-gray-100 border border-gray-300 rounded p-4 mb-2">
                    <p className="text-gray-600">서명 대기중</p>
                  </div>
                  {canSign('employee') && (
                    <button
                      onClick={() => handleSignClick('employee')}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      서명하기 →
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Contract Date */}
          <p className="text-center mt-8 text-gray-600">
            작성일: {formatDate(contract.created_at)}
          </p>
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {signerType === 'employer' ? '원장 서명' : '직원 서명'}
            </h2>
            <SignaturePad
              onSave={handleSignatureSave}
              onCancel={() => setShowSignatureModal(false)}
              width={500}
              height={200}
            />
          </div>
        </div>
      )}
    </div>
  )
}
