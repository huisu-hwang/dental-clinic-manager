'use client'

/**
 * ContractDetail Component
 * Displays full contract details with signature capability
 */

import { useState, useEffect, useRef } from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { useRouter } from 'next/navigation'
import { contractService } from '@/lib/contractService'
import SignaturePad from './SignaturePad'
import type { EmploymentContract, ContractSigningData, SignerType, ContractSignature } from '@/types/contract'
import type { UserProfile } from '@/contexts/AuthContext'
import { formatResidentNumber, maskResidentNumber } from '@/utils/residentNumberUtils'
import { decryptResidentNumber } from '@/utils/encryptionUtils'
import { collectSignatureMetadata } from '@/utils/documentLegalUtils'

interface ContractDetailProps {
  contractId: string
  currentUser: UserProfile
}

export default function ContractDetail({ contractId, currentUser }: ContractDetailProps) {
  const router = useRouter()
  const [contract, setContract] = useState<EmploymentContract | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [signerType, setSignerType] = useState<SignerType>('employee')
  const [signatureStatus, setSignatureStatus] = useState<{
    hasEmployerSignature: boolean
    hasEmployeeSignature: boolean
    signatures: ContractSignature[]
  }>({
    hasEmployerSignature: false,
    hasEmployeeSignature: false,
    signatures: []
  })
  const [decryptedResidentNumber, setDecryptedResidentNumber] = useState<string>('')
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const contractContentRef = useRef<HTMLDivElement>(null)

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

        // 주민번호 복호화
        if (response.data.contract_data.employee_resident_number) {
          console.log('[ContractDetail] Decrypting resident number...')
          const decrypted = await decryptResidentNumber(response.data.contract_data.employee_resident_number)
          setDecryptedResidentNumber(decrypted || '')

          if (!decrypted) {
            console.warn('[ContractDetail] Failed to decrypt resident number')
          }
        }

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
      // 서명 메타데이터 수집 (법적 효력 요건 - 전자서명법 준수)
      const signatureMetadata = collectSignatureMetadata()

      // Get client info for audit trail
      const clientInfo: ContractSigningData = {
        contract_id: contractId,
        signer_type: signerType,
        signature_data: signatureData,
        ip_address: signatureMetadata.ip_address || undefined, // Will be captured server-side
        device_info: signatureMetadata.device_info,
        user_agent: signatureMetadata.user_agent,
        legal_consent_agreed: true // 서명 시 법적 효력 동의
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

  const handleDownloadPdf = async () => {
    if (!contractContentRef.current || isPdfGenerating) return

    setIsPdfGenerating(true)
    try {
      // Convert DOM to image using html-to-image (supports oklch colors)
      const imgData = await toPng(contractContentRef.current, {
        quality: 0.95,
        pixelRatio: 2, // Higher quality
      })
      // Create PDF
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()

      // Get image dimensions
      const img = new Image()
      img.src = imgData
      await new Promise((resolve) => { img.onload = resolve })

      const imgWidth = img.width
      const imgHeight = img.height
      const ratio = imgWidth / imgHeight
      const width = pdfWidth
      const height = width / ratio

      let position = 0
      let heightLeft = height

      pdf.addImage(imgData, 'PNG', 0, position, width, height)
      heightLeft -= pdfHeight

      while (heightLeft > 0) {
        position = heightLeft - height
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, width, height)
        heightLeft -= pdfHeight
      }

      pdf.save(`근로계약서_${contract?.employee?.name || '문서'}.pdf`)
    } catch (error) {
      console.error('PDF 생성 중 오류 발생:', error)
      alert(`PDF를 생성하는 데 실패했습니다.\n오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`)
    } finally {
      setIsPdfGenerating(false)
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

  // Calculate weekly work hours
  const calculateWorkHours = () => {
    if (!data.weekly_work_hours) {
      return {
        totalHours: 40,
        workDays: data.work_days_per_week || 5,
        avgHoursPerDay: 8
      }
    }

    let totalMinutes = 0
    let workDays = 0

    Object.values(data.weekly_work_hours).forEach(day => {
      if (day.is_open && day.open_time && day.close_time) {
        workDays++
        const start = new Date(`1970-01-01T${day.open_time}Z`)
        const end = new Date(`1970-01-01T${day.close_time}Z`)
        let diff = end.getTime() - start.getTime()

        if (day.break_start && day.break_end) {
          const breakStart = new Date(`1970-01-01T${day.break_start}Z`)
          const breakEnd = new Date(`1970-01-01T${day.break_end}Z`)
          diff -= (breakEnd.getTime() - breakStart.getTime())
        }

        totalMinutes += diff / (1000 * 60)
      }
    })

    const totalHours = totalMinutes / 60
    const avgHoursPerDay = workDays > 0 ? totalHours / workDays : 0

    return {
      totalHours: Math.round(totalHours * 10) / 10,
      workDays,
      avgHoursPerDay: Math.round(avgHoursPerDay * 10) / 10
    }
  }

  const workHoursInfo = calculateWorkHours()
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
            onClick={handleDownloadPdf}
            disabled={isPdfGenerating}
            className={`px-4 py-2 rounded-lg transition-colors ${
              isPdfGenerating
                ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {isPdfGenerating ? '생성 중...' : 'PDF 다운로드'}
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            프린트
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
      <div ref={contractContentRef} className="contract-print-content bg-white p-8 md:p-12 rounded-lg shadow-lg border border-gray-200">
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
          {/* Introduction */}
          <section className="text-center pb-4 border-b">
            <p className="mb-4">
              &ldquo;{data.clinic_name || '하얀치과'}&rdquo; (이하 &ldquo;갑&rdquo;이라 한다)와 &ldquo;{data.employee_name}&rdquo; (이하 &ldquo;을&rdquo;이라 한다)은 고용 및 근로계약을 체결함에 있어 다음과 같이 서로 합의하고 상호신의의 원칙하에 성실히 이행, 준수할 것을 약속하고 각각 서명 날인한다.
            </p>
          </section>

          {/* Article 1 - 계약당사자 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제1조 (계약당사자)</h2>
            <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded">
              <div>
                <p className="font-semibold mb-2">갑 (사용자)</p>
                <p className="text-xs">사업체명: {data.clinic_name || '하얀치과'}</p>
                <p className="text-xs">대표자: {data.employer_name}</p>
                <p className="text-xs">소재지: {data.clinic_address}</p>
              </div>
              <div>
                <p className="font-semibold mb-2">을 (근로자)</p>
                <p className="text-xs">성명: {data.employee_name}</p>
                <p className="text-xs">주민번호: {displayResidentNumber}</p>
                <p className="text-xs">주소: {data.employee_address}</p>
                <p className="text-xs">전화: {data.employee_phone}</p>
              </div>
            </div>
          </section>

          {/* Article 2 - 계약기간 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제2조 (계약기간)</h2>
            <div className="space-y-2">
              <p>1. 계약기간: {formatDate(data.employment_period_start)}부터 {data.is_permanent ? '무기한' : data.employment_period_end && formatDate(data.employment_period_end)}</p>
              <p>2. 계약기간은 제1항에 명시된 날로부터 효력을 발휘한다.</p>
              <p>3. 수습기간은 입사 후 3개월 이내로 하며, 수습기간 중에는 정식사원 급여의 80% 이상 지급 가능하다. 단 최저임금은 지급하여야 한다. 수습기간 중에는 상호 각자의 의사에 의하여 근로관계를 해고예고절차나 해고절차 등 없이 바로 종료할 수 있으며, 상대방은 이에 대하여 이의를 제기하지 아니한다.</p>
            </div>
          </section>

          {/* Article 3 - 근로조건 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제3조 (근로조건)</h2>
            <div className="space-y-2">
              <p className="font-semibold">1. 요일별 근로시간</p>
              {data.weekly_work_hours ? (
                <div className="ml-4 space-y-1">
                  {[1, 2, 3, 4, 5, 6, 0].map((dayOfWeek) => {
                    const dayNames = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
                    const hours = data.weekly_work_hours?.[dayOfWeek]

                    if (!hours) return null

                    return (
                      <div key={dayOfWeek} className="text-sm">
                        <span className="inline-block w-16 font-medium">{dayNames[dayOfWeek]}:</span>
                        {hours.is_open ? (
                          <span>
                            {hours.open_time} ~ {hours.close_time}
                            {hours.break_start && hours.break_end && (
                              <span className="text-gray-600 ml-2">
                                (휴게: {hours.break_start} ~ {hours.break_end})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-500">휴무</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="ml-4">근로시간: {data.work_start_time || '10:00'}부터 {data.work_end_time || '19:00'}까지</p>
              )}
              <p className="ml-4 text-xs text-gray-600">* 담당직무: 진료</p>
              <p>2. 휴게시간: 점심시간 포함 (1일 평균 1시간)</p>
              <p>3. 주휴일: 주 1회</p>
              <p>4. 근로시간은 휴게시간을 제하고 1일 평균 {workHoursInfo.avgHoursPerDay}시간, 주 {workHoursInfo.workDays}일(총 {workHoursInfo.totalHours}시간) 근무를 원칙으로 한다.</p>
            </div>
          </section>

          {/* Article 4 - 계약기간 월급여액 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제4조 (계약기간 월급여액) (세후)</h2>
            <p className="font-bold">월급여액: {formatSalary(data.salary_base)}</p>
          </section>

          {/* Article 5 - 월지급액의 구성 및 지급 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제5조 (월지급액의 구성 및 지급)</h2>
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2 p-2 bg-gray-100 rounded text-xs text-center font-semibold">
                <div>기본급</div>
                <div>주휴수당</div>
                <div>연장근로수당</div>
                <div>월 총급여액</div>
              </div>
              <div className="grid grid-cols-4 gap-2 p-2 text-xs text-center">
                <div>{formatSalary(data.salary_base)}</div>
                <div>포함</div>
                <div>별도</div>
                <div className="font-bold">{formatSalary(data.salary_base)}</div>
              </div>
              <p>1. 월급여는 위와 같이 기본급, 주휴수당, 기본연장근로수당으로 구성되며 매월 급여지급일에 지급한다.</p>
              <p>2. 위 연장근로수당은 월 기본으로 근무하는 연장근로시의 1.5배 가산하여 지급한 것이다. (야간근무시간에는 야간할증시간: 22시~오전6시 0.5배 가산하여 근무시간을 계산한다.)</p>
              <p>3. 기존 근무자는 위 급여체계개정에 동의한 것으로 본다.</p>
            </div>
          </section>

          {/* Article 6 - 지급방법 및 시기 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제6조 (지급방법 및 시기)</h2>
            <p>임금지급은 매월 {data.salary_payment_day || '25'}일에 지급한다. 다만, 그 지급일이 휴일이나 토요일인 때에는 그 전일에 지급한다.</p>
          </section>

          {/* Article 7 - 퇴직금 및 중간정산 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제7조 (퇴직금 및 중간정산)</h2>
            <div className="space-y-2">
              <p>1. 퇴직금은 1년 이상 계속 근무한 자에 대하여 지급한다. 퇴직금은 상기 월급여액에 포함되어 있지 아니하며 별도로 지급한다.</p>
              <p>2. 1년 이상 재직 중인 근로자의 신청이 있더라도 기왕에 근로한 기간의 퇴직금을 중간정산할 수 없다. (다만 법이 정하는 사유가 있으면 법이 정한 요건에 따라 예외적으로 중간정산 가능하다.)</p>
              <p>3. 법이 정한 절차에 따라 퇴직연금제도로 전환도 가능하다. (DB형, DC형 기타)</p>
              <p>4. &ldquo;을&rdquo;은 퇴직하고자 하는 경우 한 달 이전에 퇴직사실을 &ldquo;갑&rdquo;에 통보하여야 한다. 그러하지 아니하면 갑은 을의 무단결근한 날로부터 30일이 지난 날까지 무단결근한 것으로 하여 퇴사처리할 수 있다.</p>
              <p>5. 퇴사 시 &ldquo;을&rdquo;은 &ldquo;갑&rdquo;으로부터 지급받은 유니폼 등 업무에 소요되었던 일체의 작업용 물건을 반환한다.</p>
            </div>
          </section>

          {/* Article 8 - 유급휴일 및 임금차감 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제8조 (유급휴일 및 임금차감)</h2>
            <div className="space-y-2">
              <p>1. 회사는 다음 각 호의 유급휴일을 준다.</p>
              <p className="ml-4">1. 근로자의 날(5월 1일), 2. 주휴일</p>
              <p>2. 휴일근로가산수당 50%가 지급되는 휴일은 1항의 휴일로 한다.</p>
              <p>3. 주휴일과 상기휴일이 중복될 경우에는 그 휴일의 사용으로 주휴일과 상기휴일 모두를 사용한 것으로 본다.</p>
              <p>4. &ldquo;갑&rdquo;이 경영상 필요한 경우 &ldquo;을&rdquo;과 협의 하에 휴일/휴가일을 변경할 수 있다. 결근 1일에 대해서는 통상임금으로 공제하고, 주휴 및 지각, 조퇴의 경우 통상시급으로 차감한다.</p>
            </div>
          </section>

          {/* Article 9 - 경조사휴가, 병가휴가 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제9조 (경조사휴가, 병가휴가)</h2>
            <div className="space-y-2">
              <p>1. 회사는 다음 각 호의 어느 하나에 해당하는 범위에서 사원의 신청에 따라 유급의 경조사휴가를 부여한다 (휴가 중의 휴일, 휴무일 포함하여 아래의 기간 계산).</p>
              <p className="ml-4">1. 본인의 결혼: 5일</p>
              <p className="ml-4">2. 본인·배우자의 부모 또는 배우자의 사망: 5일</p>
              <p className="ml-4">3. 본인·배우자의 조부모 또는 외조부모의 사망: 3일</p>
              <p className="ml-4">4. 자녀 또는 그 자녀의 배우자의 사망: 3일</p>
              <p>2. 병가는 무노동 무임금 원칙의 적용을 받는다.</p>
            </div>
          </section>

          {/* Article 10 - 연차유급휴가 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제10조 (연차유급휴가)</h2>
            <div className="space-y-2">
              <p>1. 회사는 1년간 8할 이상 출근한 근로자에 대하여는 {data.annual_leave_days || 15}일의 유급휴가를 주어야 한다.</p>
              <p>2. 회사는 계속근로연수가 1년 미만인 근로자에 대하여는 1월간 개근시 1일의 유급휴가를 주어야 한다.</p>
              <p>3. 회사는 근로자의 최초 1년간의 근로에 대하여 유급휴가를 주는 경우에는 제2항의 규정에 의한 휴가를 포함하여 15일로 하고, 근로자가 제2항의 규정에 의한 휴가를 이미 사용한 경우에는 그 사용한 휴가일수를 15일에서 공제한다.</p>
              <p>4. 제1항에 대하여 회사와 근로자와의 서면합의에 의하여 휴가를 대체할 수 있다.</p>
            </div>
          </section>

          {/* Article 11 - 연차유급휴가대체 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제11조 (연차유급휴가대체)</h2>
            <p>회사와 사원은 주중에 놓인 법정공휴일 및 여름하계 휴무를 하게 될 때 연차휴가로 사용하는 것에 서로 합의한다.</p>
          </section>

          {/* Article 12 - 기밀유지 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제12조 (기밀유지)</h2>
            <p>을은 급여 및 회사의 규정에 대하여 비밀을 유지할 의무를 지며, 을의 급여를 타인에게 누설하거나 타인의 급여를 알려고 하여서는 안 되며, 위반 시 불이익을 감수해야 한다.</p>
          </section>

          {/* Article 13 - 계약위반에 대한 책임 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제13조 (계약위반에 대한 책임)</h2>
            <p>계약기간 중 &ldquo;을&rdquo;의 계약위반 및 복무규정위반으로 &ldquo;갑&rdquo;의 업무에 지장이나 손해를 초래하였을 경우 &ldquo;을&rdquo;은 그에 상당한 손해배상책임을 진다.</p>
          </section>

          {/* Article 14 - 업무상 징계사유 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제14조 (업무상 징계사유)</h2>
            <p className="mb-2">갑은 다음 각 호의 경우에 을을 징계할 수 있다.</p>
            <div className="ml-4 space-y-1 text-xs">
              <p>1. 업무를 태만히 하거나 업무수행능력이 부족한 때</p>
              <p>2. 규정 또는 정당한 업무명령을 위반한 때</p>
              <p>3. 정당한 이유 없이 무단결근, 무단지각한 때</p>
              <p>4. 장비파손, 장비분실로 회사에 손실을 끼쳤을 때</p>
              <p>5. 도박, 음주, 폭행, 파괴, 풍기문란 등으로 직장규율을 위반하였을 때</p>
              <p>6. 취업 장소 및 취업직종에 대하여 불복할 경우</p>
              <p>7. 급여명세서 및 회사의 제반규정을 누설한 경우</p>
              <p>8. 고의 또는 과실로 업무상 회사에 손실을 끼쳤을 때</p>
              <p>9. 업무상 태만에 의하여 재해 기타 사고를 발생케 하였을 때</p>
              <p>10. 회사의 정당한 지휘명령이나 직무명령·출장명령을 위반하였을 때</p>
              <p>11. 장(근무지)를 무단으로 이탈하였을 때</p>
              <p>12. 무상 부정, 배임, 횡령 등의 범죄행위를 하였을 때</p>
              <p>13. 기타 사회 통념상 징계함이 타당하거나 근로관계를 지속할 수 없는 경우</p>
            </div>
          </section>

          {/* Article 15 - 근로계약 관련 적용준칙 */}
          <section className="border-b pb-4">
            <h2 className="text-lg font-bold mb-3">제15조 (근로계약 관련 적용준칙)</h2>
            <p>본 계약서에 없는 사항은 당사 취업규칙, 노동관계법령 및 근로기준법에 따르기로 한다.</p>
          </section>

          {/* Additional Agreements */}
          <section className="mt-8 pt-6 border-t-2 border-gray-300">
            <h2 className="text-xl font-bold text-center mb-6">연차 휴가 대체 합의서</h2>
            <div className="space-y-3 text-sm">
              <p>1. 근로기준법에 근거하여 법정 연차 휴가를 법정공휴일과 여름철에 휴무하는 것으로 연차휴가와 대체하는 것에 대하여 자유로운 의사로 합의하고, 이 합의서를 작성하여 그 말미에 근로자와 사용자가 함께 서명한다.</p>
              <p>2. 상기 휴무가 법정연차휴가일수에 미치지 아니하는 경우 추가로 연차휴가를 부여한다.</p>
            </div>
          </section>

          <section className="mt-8 pt-6 border-t-2 border-gray-300">
            <h2 className="text-xl font-bold text-center mb-6">연장·야간·휴일근로 동의서</h2>
            <div className="text-sm text-center space-y-3">
              <p>본인은 {data.clinic_name || '하얀치과'}에 채용되어 업무를 수행함에 있어 근로기준법 규정에 의한 연장근로 / 야간근로 / 휴일근로에 동의합니다.</p>
            </div>
          </section>

          <section className="mt-8 pt-6 border-t-2 border-gray-300">
            <h2 className="text-xl font-bold text-center mb-6">비밀 유지 각서</h2>
            <div className="text-sm text-center space-y-3">
              <p>본인은 {data.clinic_name || '하얀치과'}에서 보고 들은 모든 것에 대하여 병원 직원 이외의 타인에게 함부로 발설하지 않고 비밀로 유지할 것을 약속하며, 이를 지키지 아니할 경우에는 그로 인해 병원이 입게 되는 손실에 대하여 공동 책임을 질 것을 서약함.</p>
            </div>
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
                  {(() => {
                    const employerSignature = signatureStatus.signatures.find(s => s.signer_type === 'employer')
                    return employerSignature ? (
                      <>
                        <div className="bg-white border border-gray-300 rounded p-4 mb-2 flex justify-center items-center min-h-[120px]">
                          <img
                            src={employerSignature.signature_data}
                            alt="원장 서명"
                            className="max-h-24 w-auto"
                          />
                        </div>
                        <p className="text-xs text-gray-600">
                          서명일: {contract.updated_at && formatDate(contract.updated_at)}
                        </p>
                      </>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded p-4 mb-2">
                        <p className="text-green-800 font-semibold">✓ 서명 완료</p>
                      </div>
                    )
                  })()}
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
                  {(() => {
                    const employeeSignature = signatureStatus.signatures.find(s => s.signer_type === 'employee')
                    return employeeSignature ? (
                      <>
                        <div className="bg-white border border-gray-300 rounded p-4 mb-2 flex justify-center items-center min-h-[120px]">
                          <img
                            src={employeeSignature.signature_data}
                            alt="직원 서명"
                            className="max-h-24 w-auto"
                          />
                        </div>
                        <p className="text-xs text-gray-600">
                          서명일: {contract.updated_at && formatDate(contract.updated_at)}
                        </p>
                      </>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded p-4 mb-2">
                        <p className="text-green-800 font-semibold">✓ 서명 완료</p>
                      </div>
                    )
                  })()}
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

          {/* 전자서명 법적 효력 고지 */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className="bg-gray-50 p-4 rounded-lg text-xs text-gray-600">
              <p className="font-medium mb-2">※ 전자 근로계약서 법적 효력 안내</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>본 전자 근로계약서는 근로기준법 제17조에 따른 근로조건 명시의무를 충족합니다.</li>
                <li>전자서명법 제3조에 따라 양 당사자의 전자서명으로 체결되며, 서면 계약과 동일한 법적 효력을 가집니다.</li>
                <li>계약 체결 시점의 문서 해시값(SHA-256)이 기록되어 무결성이 보장됩니다.</li>
                <li>본 계약서는 전자문서 및 전자거래 기본법에 따라 보존됩니다.</li>
              </ul>
            </div>
          </div>
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
