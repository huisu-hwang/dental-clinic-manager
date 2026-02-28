'use client'

/**
 * DocumentTemplates Component
 * 사직서, 재직증명서 등 문서 양식 생성 및 출력 기능
 */

import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { useAuth } from '@/contexts/AuthContext'
import { dataService } from '@/lib/dataService'
import {
  DocumentType,
  DocumentTypeLabels,
  OwnerOnlyDocumentTypes,
  ResignationData,
  EmploymentCertificateData,
  RecommendedResignationData,
  TerminationNoticeData,
  WelfarePaymentData,
  ResignationReasons,
  RecommendedResignationReasons,
  TerminationReasons,
  CertificatePurposes,
  getDefaultResignationData,
  getDefaultEmploymentCertificateData,
  getDefaultRecommendedResignationData,
  getDefaultTerminationNoticeData,
  getDefaultWelfarePaymentData
} from '@/types/document'
import { FileText, Printer, Download, ChevronLeft, ChevronRight, Users, PenTool, Send, CheckCircle, Clock, XCircle, List } from 'lucide-react'
import SignaturePad from '@/components/Contract/SignaturePad'
import { decryptResidentNumber } from '@/utils/encryptionUtils'
import { getBirthDateFromResidentNumber } from '@/utils/residentNumberUtils'
import { collectSignatureMetadata, ELECTRONIC_SIGNATURE_CONSENT } from '@/utils/documentLegalUtils'

// 문서 제출 상태 타입
interface DocumentSubmission {
  id: string
  document_type: string
  document_data: any
  employee_signature?: string
  owner_signature?: string
  status: 'pending' | 'approved' | 'rejected'
  reject_reason?: string
  created_at: string
  submitted_by?: string
  target_employee_id?: string
  submitter?: { id: string; name: string; role: string }
  approver?: { id: string; name: string; role: string }
  target_employee?: { id: string; name: string; role: string }
}

// 직급 영문 -> 한글 변환 (StaffManagement의 getRoleLabel과 동일)
const translateRole = (role: string | undefined): string => {
  if (!role) return ''
  const roleMap: Record<string, string> = {
    'owner': '원장',
    'vice_director': '부원장',
    'manager': '실장',
    'team_leader': '진료팀장',
    'staff': '직원'
  }
  return roleMap[role?.toLowerCase()] || role || ''
}

interface StaffMember {
  id: string
  name: string
  role: string
  position?: string
  phone?: string
  hire_date?: string
  address?: string
  birth_date?: string
  resident_registration_number?: string
}

export default function DocumentTemplates() {
  const { user } = useAuth()
  const searchParams = useSearchParams()
  const [documentType, setDocumentType] = useState<DocumentType>('resignation')
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const [showOwnerSignatureModal, setShowOwnerSignatureModal] = useState(false)
  const [showOwnerDocumentSignatureModal, setShowOwnerDocumentSignatureModal] = useState(false) // 권고사직서/해고통보서용
  const [showEmployeeSignatureModal, setShowEmployeeSignatureModal] = useState(false) // 직원 권고사직서 서명용
  const [employeeSigningDoc, setEmployeeSigningDoc] = useState<DocumentSubmission | null>(null) // 직원이 서명할 문서
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [sentDocuments, setSentDocuments] = useState<DocumentSubmission[]>([]) // 보낸 문서
  const [receivedDocuments, setReceivedDocuments] = useState<DocumentSubmission[]>([]) // 받은 문서
  const [activeTab, setActiveTab] = useState<'form' | 'sent' | 'received'>('form') // 현재 탭
  const [selectedDocument, setSelectedDocument] = useState<DocumentSubmission | null>(null) // 선택된 문서
  const documentRef = useRef<HTMLDivElement>(null)

  // 원장인지 확인
  const isOwner = user?.role === 'owner'

  // URL 파라미터에서 view 값을 확인하여 탭 전환 (알림 클릭 시 결재 화면으로 이동)
  useEffect(() => {
    const view = searchParams.get('view')
    if (view === 'received') {
      setActiveTab('received')
    } else if (view === 'sent') {
      setActiveTab('sent')
    }
  }, [searchParams])

  // 사직서 데이터
  const [resignationData, setResignationData] = useState<ResignationData>(
    getDefaultResignationData(user?.clinic?.name, user?.clinic?.owner_name)
  )

  // 재직증명서 데이터
  const [certificateData, setCertificateData] = useState<EmploymentCertificateData>(
    getDefaultEmploymentCertificateData(user?.clinic?.name, user?.clinic?.owner_name)
  )

  // 권고사직서 데이터
  const [recommendedResignationData, setRecommendedResignationData] = useState<RecommendedResignationData>(
    getDefaultRecommendedResignationData(user?.clinic?.name, user?.clinic?.owner_name)
  )

  // 해고통보서 데이터
  const [terminationNoticeData, setTerminationNoticeData] = useState<TerminationNoticeData>(
    getDefaultTerminationNoticeData(user?.clinic?.name, user?.clinic?.owner_name)
  )

  // 복지비 지급 확인서 데이터
  const [welfarePaymentData, setWelfarePaymentData] = useState<WelfarePaymentData>(
    getDefaultWelfarePaymentData(user?.clinic?.name)
  )

  // 직원 목록 로드
  useEffect(() => {
    const loadStaff = async () => {
      if (!user?.clinic_id) return
      setLoadingStaff(true)
      try {
        const result = await dataService.getUsersByClinic(user.clinic_id)
        if (result.data && !result.error) {
          // 활성 상태 직원만 필터링
          const activeStaff = result.data.filter((s: any) => s.status === 'active')
          setStaffList(activeStaff.map((s: any) => ({
            id: s.id,
            name: s.name || '',
            role: s.role || '',
            position: s.position || translateRole(s.role) || '',
            phone: s.phone || '',
            hire_date: s.hire_date || '',
            address: s.address || '',
            birth_date: s.birth_date || '',
            resident_registration_number: s.resident_registration_number || ''
          })))
        }
      } catch (error) {
        console.error('Failed to load staff:', error)
      } finally {
        setLoadingStaff(false)
      }
    }
    loadStaff()
  }, [user?.clinic_id])

  // 사용자 정보 변경 시 기본값 업데이트 (회사 정보 + 본인 정보 자동 입력)
  useEffect(() => {
    const updateUserInfo = async () => {
      if (!user) return

      // 회사 정보 업데이트
      const clinicInfo = {
        clinicName: user.clinic?.name || '',
        representativeName: user.clinic?.owner_name || '',
        clinicAddress: user.clinic?.address || ''
      }

      // 주민번호에서 생년월일 계산
      let birthDateFromRrn = ''
      if (user.resident_registration_number) {
        try {
          const decrypted = await decryptResidentNumber(user.resident_registration_number)
          if (decrypted) {
            birthDateFromRrn = getBirthDateFromResidentNumber(decrypted)
          }
        } catch (error) {
          console.error('Failed to decrypt resident number:', error)
        }
      }

      // 본인 정보 자동 입력 (직원 선택 없이 본인이 작성하는 경우)
      setResignationData(prev => ({
        ...prev,
        ...clinicInfo,
        employeeName: prev.employeeName || user.name || '',
        employeePosition: prev.employeePosition || user.position || translateRole(user.role) || '',
        hireDate: prev.hireDate || user.hire_date || ''
      }))

      setCertificateData(prev => ({
        ...prev,
        ...clinicInfo,
        businessNumber: user.clinic?.business_number || '',
        clinicPhone: user.clinic?.phone || '',
        employeeName: prev.employeeName || user.name || '',
        position: prev.position || user.position || translateRole(user.role) || '',
        employeePhone: prev.employeePhone || user.phone || '',
        hireDate: prev.hireDate || user.hire_date || '',
        employeeAddress: prev.employeeAddress || user.address || '',
        employeeBirthDate: prev.employeeBirthDate || birthDateFromRrn || user.birth_date || ''
      }))

      // 권고사직서/해고통보서 회사 정보 업데이트 (원장 전용)
      setRecommendedResignationData(prev => ({
        ...prev,
        ...clinicInfo
      }))

      setTerminationNoticeData(prev => ({
        ...prev,
        ...clinicInfo,
        businessNumber: user.clinic?.business_number || '',
        clinicPhone: user.clinic?.phone || ''
      }))

      // 복지비 지급 확인서 업데이트
      setWelfarePaymentData(prev => ({
        ...prev,
        clinicName: user.clinic?.name || '',
        employeeName: prev.employeeName || user.name || '',
        phone: prev.phone || user.phone || '',
        birthDate: prev.birthDate || birthDateFromRrn || user.birth_date || ''
      }))
    }

    updateUserInfo()
  }, [user])

  // 보낸 문서 목록 로드
  const loadSentDocuments = async () => {
    if (!user?.clinic_id || !user?.id) return
    try {
      const response = await fetch(
        `/api/document-submissions?clinicId=${user.clinic_id}&userId=${user.id}&filter=sent`
      )
      const result = await response.json()
      if (result.data) {
        setSentDocuments(result.data)
      }
    } catch (error) {
      console.error('Failed to load sent documents:', error)
    }
  }

  // 받은 문서 목록 로드
  const loadReceivedDocuments = async () => {
    if (!user?.clinic_id || !user?.id) return
    try {
      const response = await fetch(
        `/api/document-submissions?clinicId=${user.clinic_id}&userId=${user.id}&filter=received&isOwner=${isOwner}`
      )
      const result = await response.json()
      if (result.data) {
        setReceivedDocuments(result.data)
      }
    } catch (error) {
      console.error('Failed to load received documents:', error)
    }
  }

  // 문서 목록 로드
  useEffect(() => {
    loadSentDocuments()
    loadReceivedDocuments()
  }, [user?.clinic_id, user?.id])

  // 문서 제출 핸들러 (법적 효력 요건 포함)
  const handleSubmitDocument = async () => {
    if (!user?.clinic_id || !user?.id) return

    // 사직서는 서명 필수
    if (documentType === 'resignation' && !resignationData.employeeSignature) {
      alert('사직서 제출을 위해 서명이 필요합니다.')
      return
    }

    setIsSubmitting(true)
    try {
      const documentData = documentType === 'resignation' ? resignationData : certificateData
      const signature = documentType === 'resignation' ? resignationData.employeeSignature : undefined

      // 서명 메타데이터 수집 (법적 효력 요건 - 전자서명법 준수)
      const signatureMetadata = signature ? collectSignatureMetadata() : undefined

      const response = await fetch('/api/document-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: user.clinic_id,
          userId: user.id,
          documentType,
          documentData,
          signature,
          // 법적 효력 요건 필드
          signatureMetadata,
          legalConsentAgreed: true // 서명 시 동의한 것으로 간주
        })
      })

      const result = await response.json()
      if (result.success) {
        alert(`${DocumentTypeLabels[documentType]}가 제출되었습니다. 원장님의 확인을 기다려주세요.`)
        // 보낸 문서 목록 새로고침
        loadSentDocuments()
      } else {
        alert(`제출 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('Submit error:', error)
      alert('문서 제출 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 문서 승인/반려 핸들러 (원장 전용)
  const handleApproveReject = async (submissionId: string, action: 'approve' | 'reject', ownerSignature?: string, rejectReason?: string) => {
    if (!user?.clinic_id || !user?.id || !isOwner) return

    try {
      const response = await fetch('/api/document-submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: user.clinic_id,
          userId: user.id,
          submissionId,
          action,
          ownerSignature,
          rejectReason
        })
      })

      const result = await response.json()
      if (result.success) {
        alert(action === 'approve' ? '승인되었습니다.' : '반려되었습니다.')
        // 받은 문서 목록 새로고침
        loadReceivedDocuments()
        setSelectedDocument(null)
        setShowOwnerSignatureModal(false)
      } else {
        alert(`처리 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('Approve/Reject error:', error)
      alert('처리 중 오류가 발생했습니다.')
    }
  }

  // 원장 서명 후 승인
  const handleOwnerSignAndApprove = (signatureData: string) => {
    if (selectedDocument) {
      handleApproveReject(selectedDocument.id, 'approve', signatureData)
    }
  }

  // 직원이 권고사직서에 서명 (확인 및 동의)
  const handleEmployeeSign = async (signatureData: string) => {
    if (!user?.clinic_id || !user?.id || !employeeSigningDoc) return

    setShowEmployeeSignatureModal(false)
    setIsSubmitting(true)
    try {
      const signatureMetadata = collectSignatureMetadata()

      const response = await fetch('/api/document-submissions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: user.clinic_id,
          userId: user.id,
          submissionId: employeeSigningDoc.id,
          action: 'employee_sign',
          employeeSignature: signatureData,
          signatureMetadata
        })
      })

      const result = await response.json()
      if (result.success) {
        alert('권고사직서에 서명이 완료되었습니다.')
        loadReceivedDocuments()
        loadSentDocuments()
        setEmployeeSigningDoc(null)
        setSelectedDocument(null)
      } else {
        alert(`서명 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('Employee sign error:', error)
      alert('서명 처리 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 직원 선택 시 데이터 자동 입력
  const handleStaffSelect = async (staffId: string) => {
    setSelectedStaff(staffId)
    const staff = staffList.find(s => s.id === staffId)
    if (!staff) return

    // 주민번호에서 생년월일 계산
    let birthDateFromRrn = ''
    if (staff.resident_registration_number) {
      try {
        const decrypted = await decryptResidentNumber(staff.resident_registration_number)
        if (decrypted) {
          birthDateFromRrn = getBirthDateFromResidentNumber(decrypted)
        }
      } catch (error) {
        console.error('Failed to decrypt resident number:', error)
      }
    }

    if (documentType === 'resignation') {
      setResignationData(prev => ({
        ...prev,
        employeeName: staff.name || '',
        employeePosition: staff.position || translateRole(staff.role) || '',
        hireDate: staff.hire_date || ''
      }))
    } else if (documentType === 'employment_certificate') {
      setCertificateData(prev => ({
        ...prev,
        employeeName: staff.name || '',
        position: staff.position || translateRole(staff.role) || '',
        employeePhone: staff.phone || '',
        hireDate: staff.hire_date || '',
        employeeAddress: staff.address || '',
        employeeBirthDate: birthDateFromRrn || staff.birth_date || ''
      }))
    } else if (documentType === 'recommended_resignation') {
      setRecommendedResignationData(prev => ({
        ...prev,
        employeeName: staff.name || '',
        employeePosition: staff.position || translateRole(staff.role) || '',
        hireDate: staff.hire_date || ''
      }))
    } else if (documentType === 'termination_notice') {
      setTerminationNoticeData(prev => ({
        ...prev,
        employeeName: staff.name || '',
        employeePosition: staff.position || translateRole(staff.role) || '',
        hireDate: staff.hire_date || ''
      }))
    } else if (documentType === 'welfare_payment') {
      setWelfarePaymentData(prev => ({
        ...prev,
        employeeName: staff.name || '',
        phone: staff.phone || '',
        birthDate: birthDateFromRrn || staff.birth_date || ''
      }))
    }
  }

  // PDF 다운로드 - 한 페이지에 맞게 출력
  const handleDownloadPdf = async () => {
    if (!documentRef.current || isPdfGenerating) return

    setIsPdfGenerating(true)
    try {
      const imgData = await toPng(documentRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      })

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const margin = 10 // 여백 10mm

      const img = new Image()
      img.src = imgData
      await new Promise((resolve) => { img.onload = resolve })

      const imgWidth = img.width
      const imgHeight = img.height

      // 사용 가능한 영역 계산
      const availableWidth = pdfWidth - (margin * 2)
      const availableHeight = pdfHeight - (margin * 2)

      // 이미지를 한 페이지에 맞게 스케일링
      const widthRatio = availableWidth / imgWidth
      const heightRatio = availableHeight / imgHeight
      const scale = Math.min(widthRatio, heightRatio)

      const scaledWidth = imgWidth * scale
      const scaledHeight = imgHeight * scale

      // 이미지를 페이지 중앙에 배치
      const xOffset = margin + (availableWidth - scaledWidth) / 2
      const yOffset = margin

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, scaledWidth, scaledHeight)

      const getFileName = () => {
        switch (documentType) {
          case 'resignation':
            return `사직서_${resignationData.employeeName || '문서'}.pdf`
          case 'employment_certificate':
            return `재직증명서_${certificateData.employeeName || '문서'}.pdf`
          case 'recommended_resignation':
            return `권고사직서_${recommendedResignationData.employeeName || '문서'}.pdf`
          case 'termination_notice':
            return `해고통보서_${terminationNoticeData.employeeName || '문서'}.pdf`
          case 'welfare_payment':
            return `복지비지급확인서_${welfarePaymentData.employeeName || '문서'}.pdf`
          default:
            return '문서.pdf'
        }
      }
      const fileName = getFileName()

      pdf.save(fileName)
    } catch (error) {
      console.error('PDF 생성 중 오류 발생:', error)
      alert('PDF를 생성하는 데 실패했습니다.')
    } finally {
      setIsPdfGenerating(false)
    }
  }

  // 프린트 - PDF 생성 후 인쇄 (PDF와 동일한 모양으로 출력)
  const handlePrint = async () => {
    if (!documentRef.current || isPdfGenerating) return

    setIsPdfGenerating(true)
    try {
      const imgData = await toPng(documentRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        backgroundColor: '#ffffff'
      })

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
      })

      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const margin = 10

      const img = new Image()
      img.src = imgData
      await new Promise((resolve) => { img.onload = resolve })

      const imgWidth = img.width
      const imgHeight = img.height

      const availableWidth = pdfWidth - (margin * 2)
      const availableHeight = pdfHeight - (margin * 2)

      const widthRatio = availableWidth / imgWidth
      const heightRatio = availableHeight / imgHeight
      const scale = Math.min(widthRatio, heightRatio)

      const scaledWidth = imgWidth * scale
      const scaledHeight = imgHeight * scale

      const xOffset = margin + (availableWidth - scaledWidth) / 2
      const yOffset = margin

      pdf.addImage(imgData, 'PNG', xOffset, yOffset, scaledWidth, scaledHeight)

      // PDF를 Blob URL로 변환하여 새 창에서 인쇄
      const pdfBlob = pdf.output('blob')
      const pdfUrl = URL.createObjectURL(pdfBlob)
      const printWindow = window.open(pdfUrl, '_blank')

      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print()
        }
      }
    } catch (error) {
      console.error('인쇄 준비 중 오류 발생:', error)
      alert('인쇄를 준비하는 데 실패했습니다.')
    } finally {
      setIsPdfGenerating(false)
    }
  }

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  // 문서 타입 변경
  const handleDocumentTypeChange = (type: DocumentType) => {
    setDocumentType(type)
    setShowPreview(false)
    setSelectedStaff('')
    // 서명 초기화
    if (type === 'resignation') {
      setResignationData(prev => ({ ...prev, employeeSignature: undefined }))
    }
  }

  // 서명 저장 핸들러
  const handleSignatureSave = (signatureData: string) => {
    setResignationData(prev => ({ ...prev, employeeSignature: signatureData }))
    setShowSignatureModal(false)
  }

  // 서명 삭제 핸들러
  const handleSignatureDelete = () => {
    if (confirm('서명을 삭제하시겠습니까?')) {
      setResignationData(prev => ({ ...prev, employeeSignature: undefined }))
    }
  }

  // 권고사직서 원장 서명 저장 핸들러
  const handleRecommendedResignationSignature = (signatureData: string) => {
    setRecommendedResignationData(prev => ({ ...prev, ownerSignature: signatureData }))
    setShowOwnerDocumentSignatureModal(false)
  }

  // 해고통보서 원장 서명 저장 핸들러
  const handleTerminationNoticeSignature = (signatureData: string) => {
    setTerminationNoticeData(prev => ({ ...prev, ownerSignature: signatureData }))
    setShowOwnerDocumentSignatureModal(false)
  }

  // 권고사직서/해고통보서 서명 삭제 핸들러
  const handleOwnerDocumentSignatureDelete = () => {
    if (confirm('서명을 삭제하시겠습니까?')) {
      if (documentType === 'recommended_resignation') {
        setRecommendedResignationData(prev => ({ ...prev, ownerSignature: undefined }))
      } else if (documentType === 'termination_notice') {
        setTerminationNoticeData(prev => ({ ...prev, ownerSignature: undefined }))
      }
    }
  }

  // 권고사직서/해고통보서 발송 핸들러
  const handleSendOwnerDocument = async () => {
    if (!user?.clinic_id || !user?.id || !selectedStaff) {
      alert('대상 직원을 선택해주세요.')
      return
    }

    // 서명 필수 확인
    if (documentType === 'recommended_resignation' && !recommendedResignationData.ownerSignature) {
      alert('서명이 필요합니다.')
      return
    }
    if (documentType === 'termination_notice' && !terminationNoticeData.ownerSignature) {
      alert('서명이 필요합니다.')
      return
    }

    // 해고통보서의 경우 상세 사유 필수
    if (documentType === 'termination_notice' && !terminationNoticeData.detailedReason.trim()) {
      alert('해고 상세 사유는 필수입니다. (근로기준법 제27조)')
      return
    }

    const targetStaff = staffList.find(s => s.id === selectedStaff)
    const documentTypeLabel = documentType === 'recommended_resignation' ? '권고사직서' : '해고통보서'

    if (!confirm(`${targetStaff?.name}님에게 ${documentTypeLabel}를 발송하시겠습니까?\n\n발송 후 해당 직원에게 알림이 전송됩니다.`)) {
      return
    }

    setIsSubmitting(true)
    try {
      const documentData = documentType === 'recommended_resignation'
        ? recommendedResignationData
        : terminationNoticeData
      const signature = documentType === 'recommended_resignation'
        ? recommendedResignationData.ownerSignature
        : terminationNoticeData.ownerSignature

      // 서명 메타데이터 수집 (법적 효력 요건 - 전자서명법 준수)
      const signatureMetadata = signature ? collectSignatureMetadata() : undefined

      const response = await fetch('/api/document-submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: user.clinic_id,
          userId: user.id,
          documentType,
          documentData,
          signature,
          targetEmployeeId: selectedStaff,
          // 법적 효력 요건 필드
          signatureMetadata,
          legalConsentAgreed: true
        })
      })

      const result = await response.json()
      if (result.success) {
        const actionMessage = documentType === 'recommended_resignation'
          ? '권고사직서가 발송되었습니다. 해당 직원에게 확인 및 서명 요청 알림이 전송되었습니다.'
          : '해고통보서가 발송되었습니다. 해당 직원에게 해고 통보 알림이 전송되었습니다.'
        alert(actionMessage)

        // 보낸 문서 목록 새로고침
        loadSentDocuments()

        // 폼 초기화
        if (documentType === 'recommended_resignation') {
          setRecommendedResignationData(getDefaultRecommendedResignationData(user.clinic?.name, user.clinic?.owner_name))
        } else {
          setTerminationNoticeData(getDefaultTerminationNoticeData(user.clinic?.name, user.clinic?.owner_name))
        }
        setSelectedStaff('')
      } else {
        alert(`발송 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('Send error:', error)
      alert('문서 발송 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 문서 타입 라벨 반환
  const getDocumentTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'resignation': '사직서',
      'employment_certificate': '재직증명서',
      'recommended_resignation': '권고사직서',
      'termination_notice': '해고통보서',
      'welfare_payment': '복지비 지급 확인서'
    }
    return labels[type] || type
  }

  // 문서 상세 보기 (프리뷰 모드로 전환)
  const handleViewDocument = (doc: DocumentSubmission) => {
    setSelectedDocument(doc)

    // 문서 타입에 따라 데이터 설정
    if (doc.document_type === 'resignation') {
      setResignationData({
        ...doc.document_data,
        employeeSignature: doc.employee_signature
      })
      setDocumentType('resignation')
    } else if (doc.document_type === 'employment_certificate') {
      setCertificateData({
        ...doc.document_data,
        ownerSignature: doc.owner_signature
      })
      setDocumentType('employment_certificate')
    } else if (doc.document_type === 'recommended_resignation') {
      setRecommendedResignationData({
        ...doc.document_data,
        ownerSignature: doc.owner_signature,
        employeeSignature: doc.employee_signature
      })
      setDocumentType('recommended_resignation')
    } else if (doc.document_type === 'termination_notice') {
      setTerminationNoticeData({
        ...doc.document_data,
        ownerSignature: doc.owner_signature
      })
      setDocumentType('termination_notice')
    } else if (doc.document_type === 'welfare_payment') {
      setWelfarePaymentData({
        ...doc.document_data,
        applicantSignature: doc.employee_signature
      })
      setDocumentType('welfare_payment')
    }

    setShowPreview(true)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="print:hidden">
        <h2 className="text-2xl font-bold text-slate-800">문서 양식</h2>
        <p className="text-slate-500 mt-1">사직서, 재직증명서 등 문서 양식을 작성하고 출력하세요</p>
      </div>

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 border-b border-slate-200 print:hidden">
        <button
          onClick={() => setActiveTab('form')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'form'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4 inline-block mr-2" />
          문서 작성
        </button>
        <button
          onClick={() => setActiveTab('sent')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'sent'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <Send className="w-4 h-4 inline-block mr-2" />
          보낸 문서
          {sentDocuments.length > 0 && (
            <span className="ml-2 bg-slate-200 text-slate-600 text-xs px-2 py-0.5 rounded-full">
              {sentDocuments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('received')}
          className={`px-4 py-2 font-medium transition-colors border-b-2 -mb-px ${
            activeTab === 'received'
              ? 'text-blue-600 border-blue-600'
              : 'text-slate-500 border-transparent hover:text-slate-700'
          }`}
        >
          <FileText className="w-4 h-4 inline-block mr-2" />
          받은 문서
          {receivedDocuments.filter(d => d.status === 'pending').length > 0 && (
            <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {receivedDocuments.filter(d => d.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {/* 보낸 문서 목록 */}
      {activeTab === 'sent' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:hidden">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">보낸 문서 목록</h3>
          {sentDocuments.length === 0 ? (
            <p className="text-slate-500 text-center py-8">보낸 문서가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {sentDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${
                      doc.status === 'pending' ? 'bg-yellow-100' :
                      doc.status === 'approved' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {doc.status === 'pending' ? (
                        <Clock className="w-5 h-5 text-yellow-600" />
                      ) : doc.status === 'approved' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        {getDocumentTypeLabel(doc.document_type)}
                        {doc.target_employee && (
                          <span className="text-slate-500 ml-2">→ {doc.target_employee.name}</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500">
                        {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                          doc.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          doc.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {doc.status === 'pending' ? '대기중' :
                           doc.status === 'approved' ? '처리완료' : '반려됨'}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewDocument(doc)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      상세보기
                    </button>
                    {doc.reject_reason && (
                      <span className="text-sm text-red-600">
                        사유: {doc.reject_reason}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 받은 문서 목록 */}
      {activeTab === 'received' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:hidden">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">받은 문서 목록</h3>
          {receivedDocuments.length === 0 ? (
            <p className="text-slate-500 text-center py-8">받은 문서가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {receivedDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center justify-between p-4 rounded-lg border ${
                    doc.status === 'pending'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-full ${
                      doc.status === 'pending' ? 'bg-yellow-100' :
                      doc.status === 'approved' ? 'bg-green-100' : 'bg-red-100'
                    }`}>
                      {doc.status === 'pending' ? (
                        <Clock className="w-5 h-5 text-yellow-600" />
                      ) : doc.status === 'approved' ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">
                        {getDocumentTypeLabel(doc.document_type)}
                        {doc.submitter && (
                          <span className="text-slate-500 ml-2">- {doc.submitter.name}님으로부터</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500">
                        {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                        <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                          doc.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          doc.status === 'approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {doc.status === 'pending' ? '확인 필요' :
                           doc.status === 'approved' ? '처리완료' : '반려됨'}
                        </span>
                      </p>
                      {/* 권고사직서/해고통보서 안내 메시지 */}
                      {!isOwner && doc.document_type === 'recommended_resignation' && doc.status === 'pending' && (
                        <p className="text-sm mt-1">
                          <span className="text-orange-600 font-medium">※ 권고사직서를 확인하고 서명해 주세요.</span>
                        </p>
                      )}
                      {!isOwner && doc.document_type === 'recommended_resignation' && doc.status === 'approved' && (
                        <p className="text-sm mt-1">
                          <span className="text-green-600">※ 서명이 완료된 권고사직서입니다.</span>
                        </p>
                      )}
                      {!isOwner && doc.document_type === 'termination_notice' && doc.status === 'approved' && (
                        <p className="text-sm mt-1">
                          <span className="text-red-600">※ 해고통보서입니다. 내용을 확인해 주세요.</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleViewDocument(doc)}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      상세보기
                    </button>
                    {/* 직원의 권고사직서 서명 버튼 */}
                    {!isOwner && doc.document_type === 'recommended_resignation' && doc.status === 'pending' && (
                      <button
                        onClick={() => {
                          setEmployeeSigningDoc(doc)
                          handleViewDocument(doc)
                          setShowEmployeeSignatureModal(true)
                        }}
                        disabled={isSubmitting}
                        className="px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm disabled:opacity-50"
                      >
                        <PenTool className="w-3.5 h-3.5 inline-block mr-1" />
                        서명하기
                      </button>
                    )}
                    {/* 원장의 승인/반려 버튼 */}
                    {isOwner && doc.status === 'pending' && (
                      <>
                        {doc.document_type === 'employment_certificate' ? (
                          <button
                            onClick={() => {
                              setSelectedDocument(doc)
                              setShowOwnerSignatureModal(true)
                            }}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                          >
                            서명 후 승인
                          </button>
                        ) : (
                          <button
                            onClick={() => handleApproveReject(doc.id, 'approve')}
                            className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
                          >
                            승인
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const reason = prompt('반려 사유를 입력하세요:')
                            if (reason) {
                              handleApproveReject(doc.id, 'reject', undefined, reason)
                            }
                          }}
                          className="px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                        >
                          반려
                        </button>
                      </>
                    )}
                    {doc.reject_reason && (
                      <span className="text-sm text-red-600">
                        사유: {doc.reject_reason}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 문서 타입 선택 */}
      {activeTab === 'form' && (
      <div className="flex flex-wrap gap-3 print:hidden">
        {(Object.keys(DocumentTypeLabels) as DocumentType[])
          .filter(type => {
            // 원장이 아닌 경우 권고사직서/해고통보서는 표시하지 않음
            if (!isOwner && OwnerOnlyDocumentTypes.includes(type)) {
              return false
            }
            return true
          })
          .map((type) => (
          <button
            key={type}
            onClick={() => handleDocumentTypeChange(type)}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              documentType === type
                ? OwnerOnlyDocumentTypes.includes(type)
                  ? 'bg-red-600 text-white shadow-md'
                  : 'bg-blue-600 text-white shadow-md'
                : OwnerOnlyDocumentTypes.includes(type)
                  ? 'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 inline-block mr-2" />
            {DocumentTypeLabels[type]}
          </button>
        ))}
      </div>
      )}

      {(activeTab === 'form' || showPreview) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:block">
        {/* 입력 폼 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:hidden">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            {DocumentTypeLabels[documentType]} 정보 입력
          </h3>

          {/* 직원 선택 - 원장만 다른 직원 선택 가능 (사직서는 본인 작성이므로 제외) */}
          {isOwner && staffList.length > 0 && documentType !== 'resignation' && (
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <label className="block text-sm font-medium text-blue-800 mb-2">
                <Users className="w-4 h-4 inline-block mr-1" />
                직원 선택 (자동 입력)
              </label>
              <select
                value={selectedStaff}
                onChange={(e) => handleStaffSelect(e.target.value)}
                className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
              >
                <option value="">직원을 선택하세요</option>
                {staffList.map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.name} ({staff.position || translateRole(staff.role)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {documentType === 'resignation' && (
            <ResignationForm data={resignationData} onChange={setResignationData} />
          )}
          {documentType === 'employment_certificate' && (
            <EmploymentCertificateForm data={certificateData} onChange={setCertificateData} />
          )}
          {documentType === 'recommended_resignation' && (
            <RecommendedResignationForm data={recommendedResignationData} onChange={setRecommendedResignationData} />
          )}
          {documentType === 'termination_notice' && (
            <TerminationNoticeForm data={terminationNoticeData} onChange={setTerminationNoticeData} />
          )}
          {documentType === 'welfare_payment' && (
            <WelfarePaymentForm data={welfarePaymentData} onChange={setWelfarePaymentData} />
          )}

          {/* 서명 섹션 (사직서만) */}
          {documentType === 'resignation' && (
            <div className="mt-6 pt-4 border-t">
              <label className="block text-sm font-medium text-slate-700 mb-3">
                <PenTool className="w-4 h-4 inline-block mr-1" />
                본인 서명
              </label>
              {resignationData.employeeSignature ? (
                <div className="flex items-center gap-4">
                  <div className="flex-1 p-4 bg-slate-50 rounded-lg border border-slate-200">
                    <img
                      src={resignationData.employeeSignature}
                      alt="서명"
                      className="max-h-16 mx-auto"
                    />
                  </div>
                  <button
                    onClick={handleSignatureDelete}
                    className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    삭제
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowSignatureModal(true)}
                  className="w-full px-4 py-3 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                >
                  <PenTool className="w-4 h-4 inline-block mr-2" />
                  서명하기
                </button>
              )}
            </div>
          )}

          {/* 원장 서명 및 발송 섹션 (권고사직서/해고통보서) */}
          {(documentType === 'recommended_resignation' || documentType === 'termination_notice') && (
            <div className="mt-6 pt-4 border-t space-y-4">
              {/* 발송 안내 */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <h4 className="font-semibold text-blue-800 mb-2">
                  {documentType === 'recommended_resignation' ? '📋 권고사직서 발송 안내' : '📋 해고통보서 발송 안내'}
                </h4>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li>서명 후 발송하면 선택한 직원에게 <strong>알림이 전송</strong>됩니다</li>
                  {documentType === 'recommended_resignation' ? (
                    <li>해당 직원은 알림을 통해 <strong>권고사직서 확인 및 서명 요청</strong>을 받게 됩니다</li>
                  ) : (
                    <li>해당 직원은 알림을 통해 <strong>해고 통보</strong>를 받게 됩니다</li>
                  )}
                  <li>발송된 문서는 제출 목록에서 확인할 수 있습니다</li>
                </ul>
              </div>

              {/* 대상 직원 선택 확인 */}
              {!selectedStaff && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-700">
                    ⚠️ 대상 직원을 선택해주세요 (상단 직원 선택)
                  </p>
                </div>
              )}

              {/* 원장 서명 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  <PenTool className="w-4 h-4 inline-block mr-1" />
                  원장 서명
                </label>
                {(documentType === 'recommended_resignation' ? recommendedResignationData.ownerSignature : terminationNoticeData.ownerSignature) ? (
                  <div className="flex items-center gap-4">
                    <div className="flex-1 p-4 bg-slate-50 rounded-lg border border-slate-200">
                      <img
                        src={documentType === 'recommended_resignation' ? recommendedResignationData.ownerSignature : terminationNoticeData.ownerSignature}
                        alt="원장 서명"
                        className="max-h-16 mx-auto"
                      />
                    </div>
                    <button
                      onClick={handleOwnerDocumentSignatureDelete}
                      className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowOwnerDocumentSignatureModal(true)}
                    className="w-full px-4 py-3 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <PenTool className="w-4 h-4 inline-block mr-2" />
                    서명하기
                  </button>
                )}
              </div>

              {/* 발송 버튼 */}
              <button
                onClick={handleSendOwnerDocument}
                disabled={isSubmitting || !selectedStaff || !(documentType === 'recommended_resignation' ? recommendedResignationData.ownerSignature : terminationNoticeData.ownerSignature)}
                className={`w-full px-4 py-3 rounded-lg font-medium transition-colors ${
                  isSubmitting || !selectedStaff || !(documentType === 'recommended_resignation' ? recommendedResignationData.ownerSignature : terminationNoticeData.ownerSignature)
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : documentType === 'recommended_resignation'
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                <Send className="w-4 h-4 inline-block mr-2" />
                {isSubmitting ? '발송 중...' : (documentType === 'recommended_resignation' ? '권고사직서 발송' : '해고통보서 발송')}
              </button>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex-1 min-w-[100px] px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
            >
              {showPreview ? (
                <>
                  <ChevronLeft className="w-4 h-4 inline-block mr-1" />
                  입력으로
                </>
              ) : (
                <>
                  미리보기
                  <ChevronRight className="w-4 h-4 inline-block ml-1" />
                </>
              )}
            </button>
            {/* 직원이 사직서/재직증명서 작성 시에만 제출 버튼 표시 */}
            {!isOwner && !OwnerOnlyDocumentTypes.includes(documentType) && (() => {
              // 현재 문서 타입에 대해 제출된 내역이 있는지 확인
              const hasSubmitted = sentDocuments.some(
                s => s.document_type === documentType && (s.status === 'pending' || s.status === 'approved')
              )
              return hasSubmitted ? (
                <button
                  disabled
                  className="flex-1 min-w-[100px] px-4 py-2 rounded-lg bg-green-100 text-green-700 border border-green-300 cursor-default"
                >
                  <CheckCircle className="w-4 h-4 inline-block mr-1" />
                  제출 완료
                </button>
              ) : (
                <button
                  onClick={handleSubmitDocument}
                  disabled={isSubmitting}
                  className={`flex-1 min-w-[100px] px-4 py-2 rounded-lg transition-colors ${
                    isSubmitting
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  <Send className="w-4 h-4 inline-block mr-1" />
                  {isSubmitting ? '제출 중...' : '제출'}
                </button>
              )
            })()}
            <button
              onClick={handlePrint}
              className="flex-1 min-w-[100px] px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Printer className="w-4 h-4 inline-block mr-1" />
              인쇄
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isPdfGenerating}
              className={`flex-1 min-w-[100px] px-4 py-2 rounded-lg transition-colors ${
                isPdfGenerating
                  ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              <Download className="w-4 h-4 inline-block mr-1" />
              {isPdfGenerating ? '생성 중...' : 'PDF'}
            </button>
          </div>
        </div>

        {/* 미리보기 / 프린트 영역 */}
        <div className={`${showPreview ? 'block' : 'hidden lg:block'} print:block`}>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:shadow-none print:border-none print:p-0">
            <h3 className="text-lg font-semibold text-slate-800 mb-4 print:hidden">미리보기</h3>
            <div
              ref={documentRef}
              className="bg-white p-8 border border-slate-200 rounded-lg print:border-none print:p-0 document-print-area mx-auto"
              style={{
                width: '100%',
                maxWidth: '595px', /* A4 width at 72dpi */
                aspectRatio: '210 / 297' /* A4 ratio */
              }}
            >
              {documentType === 'resignation' && (
                <ResignationPreview data={resignationData} formatDate={formatDate} />
              )}
              {documentType === 'employment_certificate' && (
                <EmploymentCertificatePreview data={certificateData} formatDate={formatDate} />
              )}
              {documentType === 'recommended_resignation' && (
                <RecommendedResignationPreview data={recommendedResignationData} formatDate={formatDate} />
              )}
              {documentType === 'termination_notice' && (
                <TerminationNoticePreview data={terminationNoticeData} formatDate={formatDate} />
              )}
              {documentType === 'welfare_payment' && (
                <WelfarePaymentPreview data={welfarePaymentData} formatDate={formatDate} />
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* 서명 모달 */}
      {showSignatureModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowSignatureModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <SignaturePad
              onSave={handleSignatureSave}
              onCancel={() => setShowSignatureModal(false)}
              width={450}
              height={180}
            />
          </div>
        </div>
      )}

      {/* 원장 서명 모달 (재직증명서 승인용) */}
      {showOwnerSignatureModal && selectedDocument && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowOwnerSignatureModal(false)
            setSelectedDocument(null)
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-4">원장 서명</h3>
            <p className="text-sm text-slate-600 mb-4">
              재직증명서 발급을 위해 서명해주세요.
            </p>
            <SignaturePad
              onSave={handleOwnerSignAndApprove}
              onCancel={() => {
                setShowOwnerSignatureModal(false)
                setSelectedDocument(null)
              }}
              width={450}
              height={180}
            />
          </div>
        </div>
      )}

      {/* 원장 서명 모달 (권고사직서/해고통보서용) */}
      {showOwnerDocumentSignatureModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowOwnerDocumentSignatureModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              {documentType === 'recommended_resignation' ? '권고사직서 서명' : '해고통보서 서명'}
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              {documentType === 'recommended_resignation'
                ? '권고사직서 발송을 위해 원장님의 서명이 필요합니다.'
                : '해고통보서 발송을 위해 원장님의 서명이 필요합니다. (근로기준법 제27조)'}
            </p>
            <SignaturePad
              onSave={documentType === 'recommended_resignation'
                ? handleRecommendedResignationSignature
                : handleTerminationNoticeSignature
              }
              onCancel={() => setShowOwnerDocumentSignatureModal(false)}
              width={450}
              height={180}
            />
          </div>
        </div>
      )}

      {/* 직원 서명 모달 (권고사직서 확인용) */}
      {showEmployeeSignatureModal && employeeSigningDoc && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setShowEmployeeSignatureModal(false)
            setEmployeeSigningDoc(null)
          }}
        >
          <div
            className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-slate-800 mb-4">권고사직서 확인 서명</h3>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
              <p className="text-sm text-amber-800">
                권고사직서의 내용을 확인하셨다면, 아래에 서명해 주세요.<br />
                서명 후 문서가 최종 완성됩니다.
              </p>
            </div>
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg mb-4 text-xs text-slate-600">
              <p className="font-medium mb-1">※ 전자서명 법적 효력 안내</p>
              <ul className="space-y-0.5 list-disc list-inside">
                <li>본 전자서명은 전자서명법 제3조에 따라 자필 서명과 동일한 법적 효력을 가집니다.</li>
                <li>서명 시 IP 주소, 서명 시간 등이 기록됩니다.</li>
              </ul>
            </div>
            <SignaturePad
              onSave={handleEmployeeSign}
              onCancel={() => {
                setShowEmployeeSignatureModal(false)
                setEmployeeSigningDoc(null)
              }}
              width={450}
              height={180}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// 사직서 입력 폼 (본인 정보는 자동 입력되고 읽기 전용)
function ResignationForm({
  data,
  onChange
}: {
  data: ResignationData
  onChange: (data: ResignationData) => void
}) {
  const handleChange = (field: keyof ResignationData, value: string) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className="space-y-4">
      {/* 본인 정보 안내 */}
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-700">
          본인의 정보가 자동으로 입력되었습니다. 수정이 필요한 경우 인사담당자에게 문의하세요.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">성명</label>
          <input
            type="text"
            value={data.employeeName}
            disabled
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">직급</label>
          <input
            type="text"
            value={data.employeePosition}
            disabled
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">부서</label>
        <input
          type="text"
          value={data.department}
          disabled
          className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">입사일</label>
          <input
            type="date"
            value={data.hireDate}
            disabled
            className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">퇴사 희망일</label>
          <input
            type="date"
            value={data.resignationDate}
            onChange={(e) => handleChange('resignationDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">사직 사유</label>
        <select
          value={data.resignationReason}
          onChange={(e) => handleChange('resignationReason', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {ResignationReasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">상세 사유 (선택)</label>
        <textarea
          value={data.detailedReason || ''}
          onChange={(e) => handleChange('detailedReason', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          placeholder="상세 사유를 입력하세요 (선택사항)"
        />
      </div>

      <hr className="my-4" />

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">회사명</label>
        <input
          type="text"
          value={data.clinicName}
          onChange={(e) => handleChange('clinicName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">대표자</label>
        <input
          type="text"
          value={data.representativeName}
          onChange={(e) => handleChange('representativeName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">작성일</label>
        <input
          type="date"
          value={data.submissionDate}
          onChange={(e) => handleChange('submissionDate', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  )
}

// 재직증명서 입력 폼
function EmploymentCertificateForm({
  data,
  onChange
}: {
  data: EmploymentCertificateData
  onChange: (data: EmploymentCertificateData) => void
}) {
  const handleChange = (field: keyof EmploymentCertificateData, value: string | boolean) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">문서 번호</label>
          <input
            type="text"
            value={data.certificateNumber || ''}
            onChange={(e) => handleChange('certificateNumber', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="제 2024-001 호"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">발급일</label>
          <input
            type="date"
            value={data.issueDate}
            onChange={(e) => handleChange('issueDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">직원 정보</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">성명</label>
          <input
            type="text"
            value={data.employeeName}
            onChange={(e) => handleChange('employeeName', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">생년월일</label>
          <input
            type="date"
            value={data.employeeBirthDate || ''}
            onChange={(e) => handleChange('employeeBirthDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">주소</label>
        <input
          type="text"
          value={data.employeeAddress || ''}
          onChange={(e) => handleChange('employeeAddress', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="서울시 강남구..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">직급</label>
          <input
            type="text"
            value={data.position}
            onChange={(e) => handleChange('position', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="치위생사"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">부서</label>
          <input
            type="text"
            value={data.department}
            onChange={(e) => handleChange('department', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="진료실"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">입사일</label>
          <input
            type="date"
            value={data.hireDate}
            onChange={(e) => handleChange('hireDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">재직 상태</label>
          <select
            value={data.currentlyEmployed ? 'employed' : 'resigned'}
            onChange={(e) => handleChange('currentlyEmployed', e.target.value === 'employed')}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="employed">재직중</option>
            <option value="resigned">퇴사</option>
          </select>
        </div>
      </div>

      {!data.currentlyEmployed && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">퇴사일</label>
          <input
            type="date"
            value={data.resignationDate || ''}
            onChange={(e) => handleChange('resignationDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      )}

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">회사 정보</p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">회사명</label>
        <input
          type="text"
          value={data.clinicName}
          onChange={(e) => handleChange('clinicName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">대표자</label>
          <input
            type="text"
            value={data.representativeName}
            onChange={(e) => handleChange('representativeName', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">사업자번호</label>
          <input
            type="text"
            value={data.businessNumber || ''}
            onChange={(e) => handleChange('businessNumber', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="123-45-67890"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">회사 주소</label>
        <input
          type="text"
          value={data.clinicAddress || ''}
          onChange={(e) => handleChange('clinicAddress', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">회사 전화번호</label>
        <input
          type="text"
          value={data.clinicPhone || ''}
          onChange={(e) => handleChange('clinicPhone', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="02-1234-5678"
        />
      </div>

      <hr className="my-4" />

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">발급 목적</label>
        <select
          value={data.purpose}
          onChange={(e) => handleChange('purpose', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {CertificatePurposes.map((purpose) => (
            <option key={purpose} value={purpose}>
              {purpose}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

// 사직서 미리보기
function ResignationPreview({
  data,
  formatDate
}: {
  data: ResignationData
  formatDate: (date: string) => string
}) {
  return (
    <div className="font-['Noto_Sans_KR'] text-slate-800 h-full flex flex-col justify-between text-sm overflow-hidden">
      {/* 제목 */}
      <h1 className="text-2xl font-bold text-center mb-6">사 직 서</h1>

      {/* 본문 */}
      <div className="flex-1 flex flex-col justify-between">
        {/* 인적사항 */}
        <section>
          <table className="w-full table-fixed border-collapse text-sm">
            <tbody>
              <tr className="border-t border-b border-slate-300">
                <td className="py-2 px-2 bg-slate-50 font-medium w-[18%]">성 명</td>
                <td className="py-2 px-2 w-[32%]">{data.employeeName || '　'}</td>
                <td className="py-2 px-2 bg-slate-50 font-medium w-[18%]">직 급</td>
                <td className="py-2 px-2 w-[32%]">{translateRole(data.employeePosition) || data.employeePosition || '　'}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="py-2 px-2 bg-slate-50 font-medium">부 서</td>
                <td className="py-2 px-2" colSpan={3}>{data.department || '　'}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="py-2 px-2 bg-slate-50 font-medium">입사일</td>
                <td className="py-2 px-2">{formatDate(data.hireDate) || '　'}</td>
                <td className="py-2 px-2 bg-slate-50 font-medium">퇴사 희망일</td>
                <td className="py-2 px-2">{formatDate(data.resignationDate) || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 사직 사유 */}
        <section className="my-4">
          <h3 className="text-base font-semibold mb-2 border-b-2 border-slate-800 pb-1">사직 사유</h3>
          <p className="mt-2 text-sm leading-6">
            상기 본인은 <span className="font-semibold">{data.resignationReason || '개인 사정'}</span>
            {data.resignationReason === '기타' && data.detailedReason && (
              <span> ({data.detailedReason})</span>
            )}
            (으)로 인하여{' '}
            <span className="font-semibold">{formatDate(data.resignationDate) || '____년 __월 __일'}</span>
            부로 사직하고자 하오니 허락하여 주시기 바랍니다.
          </p>
          {data.detailedReason && data.resignationReason !== '기타' && (
            <div className="mt-2 p-2 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-600 font-medium mb-1">상세 사유:</p>
              <p className="text-sm">{data.detailedReason}</p>
            </div>
          )}
        </section>

        {/* 작성일 */}
        <section className="text-center my-4">
          <p className="text-base">{formatDate(data.submissionDate) || '____년 __월 __일'}</p>
        </section>

        {/* 서명란 */}
        <section className="my-4">
          <div className="flex justify-end items-center gap-3">
            <span className="font-medium text-sm">작성자:</span>
            <span className="text-base">{data.employeeName || '　　　　　'}</span>
            {data.employeeSignature ? (
              <img
                src={data.employeeSignature}
                alt="서명"
                className="h-10 ml-2"
              />
            ) : (
              <span className="text-slate-400">(인)</span>
            )}
          </div>
        </section>

        {/* 수신자 */}
        <section className="my-4 pt-4 border-t-2 border-slate-300">
          <p className="text-center text-base">
            <span className="font-semibold">{data.clinicName || '○○○○'}</span>
            <span className="mx-2">대표이사</span>
            <span className="font-semibold">{data.representativeName || '○○○'}</span>
            <span className="ml-2">귀하</span>
          </p>
        </section>

        {/* 전자서명 법적 효력 고지 */}
        <section className="mt-auto pt-3 border-t border-slate-200">
          <div className="bg-slate-50 p-2 rounded-lg text-xs text-slate-600">
            <p className="font-medium mb-1">※ 전자문서 법적 효력 안내</p>
            <ul className="space-y-0.5 list-disc list-inside text-xs">
              <li>본 전자 사직서는 전자서명법 제3조에 따라 자필 서명과 동일한 법적 효력을 가집니다.</li>
              <li>본인의 자유로운 의사에 의해 작성되었음을 확인합니다.</li>
              <li>전자서명 후 문서의 무결성이 보장됩니다 (SHA-256 해시).</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  )
}

// 재직증명서 미리보기
function EmploymentCertificatePreview({
  data,
  formatDate
}: {
  data: EmploymentCertificateData
  formatDate: (date: string) => string
}) {
  return (
    <div className="font-['Noto_Sans_KR'] text-slate-800 h-full flex flex-col justify-between text-xs overflow-hidden">
      {/* 문서 번호 */}
      {data.certificateNumber && (
        <p className="text-right text-[10px] text-slate-500 mb-1">{data.certificateNumber}</p>
      )}

      {/* 제목 */}
      <h1 className="text-xl font-bold text-center mb-2">재 직 증 명 서</h1>

      {/* 본문 */}
      <div className="flex-1 flex flex-col justify-between">
        {/* 직원 정보 */}
        <section className="mb-2">
          <h3 className="text-xs font-semibold mb-1 text-slate-600">인 적 사 항</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">성 명</td>
                <td className="py-1 px-1.5 border border-slate-300 w-[32%]">{data.employeeName || '　'}</td>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">생년월일</td>
                <td className="py-1 px-1.5 border border-slate-300 w-[32%]">{formatDate(data.employeeBirthDate || '') || '　'}</td>
              </tr>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300">주 소</td>
                <td className="py-1 px-1.5 border border-slate-300 break-words" colSpan={3}>{data.employeeAddress || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 재직 정보 */}
        <section className="mb-2">
          <h3 className="text-xs font-semibold mb-1 text-slate-600">재 직 사 항</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">소 속</td>
                <td className="py-1 px-1.5 border border-slate-300 w-[32%]">{data.department || '　'}</td>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">직 급</td>
                <td className="py-1 px-1.5 border border-slate-300 w-[32%]">{translateRole(data.position) || data.position || '　'}</td>
              </tr>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300">재직기간</td>
                <td className="py-1 px-1.5 border border-slate-300" colSpan={3}>
                  {formatDate(data.hireDate) || '____년 __월 __일'} ~{' '}
                  {data.currentlyEmployed
                    ? '현재'
                    : formatDate(data.resignationDate || '') || '____년 __월 __일'}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 회사 정보 */}
        <section className="mb-2">
          <h3 className="text-xs font-semibold mb-1 text-slate-600">회 사 정 보</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">회사명</td>
                <td className="py-1 px-1.5 border border-slate-300 w-[32%]">{data.clinicName || '　'}</td>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">대표자</td>
                <td className="py-1 px-1.5 border border-slate-300 w-[32%]">{data.representativeName || '　'}</td>
              </tr>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300">사업자번호</td>
                <td className="py-1 px-1.5 border border-slate-300">{data.businessNumber || '　'}</td>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300">전화번호</td>
                <td className="py-1 px-1.5 border border-slate-300">{data.clinicPhone || '　'}</td>
              </tr>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300">소재지</td>
                <td className="py-1 px-1.5 border border-slate-300 break-words" colSpan={3}>{data.clinicAddress || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 발급 목적 */}
        <section className="mb-2">
          <table className="w-full table-fixed border-collapse border border-slate-300 text-xs">
            <tbody>
              <tr>
                <td className="py-1 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">용 도</td>
                <td className="py-1 px-1.5 border border-slate-300">{data.purpose || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 증명 문구 */}
        <section className="my-2 text-center">
          <p className="text-sm">
            위 사실을 증명합니다.
          </p>
        </section>

        {/* 발급일 */}
        <section className="text-center my-2">
          <p className="text-sm">{formatDate(data.issueDate) || '____년 __월 __일'}</p>
        </section>

        {/* 회사 직인란 */}
        <section className="mt-auto text-center">
          <div className="inline-block text-left text-xs">
            <p className="mb-0.5">
              <span className="inline-block w-16">회 사 명:</span>
              <span className="font-semibold">{data.clinicName || '　　　　　'}</span>
            </p>
            <p className="mb-0.5">
              <span className="inline-block w-16">대 표 자:</span>
              <span className="font-semibold">{data.representativeName || '　　　　　'}</span>
              <span className="ml-2 text-slate-400">(직인)</span>
            </p>
            <p>
              <span className="inline-block w-16">주 소:</span>
              <span>{data.clinicAddress || '　　　　　'}</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

// 권고사직서 입력 폼
function RecommendedResignationForm({
  data,
  onChange
}: {
  data: RecommendedResignationData
  onChange: (data: RecommendedResignationData) => void
}) {
  const handleChange = (field: keyof RecommendedResignationData, value: string) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className="space-y-4">
      {/* 법적 유의사항 안내 */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <h4 className="font-semibold text-amber-800 mb-2">⚠️ 권고사직 시 유의사항</h4>
        <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
          <li>권고사직은 해고가 아닌 <strong>합의 퇴직</strong>으로, 근로자의 <strong>자발적 동의</strong>가 필수입니다</li>
          <li>강압적 사직 권유는 <strong>부당해고</strong>로 판정될 수 있습니다 (대법 1991.7.12, 90다11554)</li>
          <li>면담 시 "함께 일하기 어렵다" 등의 표현도 해고로 간주될 수 있으니 주의하세요</li>
          <li>권고사직 사유를 명확히 기재하면 근로자의 <strong>실업급여 수급</strong>에 도움이 됩니다</li>
          <li>고용유지 조건이 붙은 정부 지원사업 참여 중이라면 <strong>감원방지조항</strong>을 확인하세요</li>
        </ul>
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">대상 직원 정보</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">성명</label>
          <input
            type="text"
            value={data.employeeName}
            onChange={(e) => handleChange('employeeName', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">직급</label>
          <input
            type="text"
            value={data.employeePosition}
            onChange={(e) => handleChange('employeePosition', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="치위생사"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">부서</label>
          <input
            type="text"
            value={data.department}
            onChange={(e) => handleChange('department', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="진료실"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">입사일</label>
          <input
            type="date"
            value={data.hireDate}
            onChange={(e) => handleChange('hireDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">권고사직 정보</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">권고일</label>
          <input
            type="date"
            value={data.recommendedDate}
            onChange={(e) => handleChange('recommendedDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">예정 퇴직일</label>
          <input
            type="date"
            value={data.expectedResignationDate}
            onChange={(e) => handleChange('expectedResignationDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">권고사직 사유</label>
        <select
          value={data.reason}
          onChange={(e) => handleChange('reason', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {RecommendedResignationReasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">상세 사유</label>
        <textarea
          value={data.detailedReason || ''}
          onChange={(e) => handleChange('detailedReason', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          placeholder="권고사직의 구체적인 사유를 입력하세요"
        />
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">퇴직 조건 (선택)</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">퇴직금</label>
          <input
            type="text"
            value={data.severancePay || ''}
            onChange={(e) => handleChange('severancePay', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="법정 퇴직금"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">추가 위로금</label>
          <input
            type="text"
            value={data.additionalCompensation || ''}
            onChange={(e) => handleChange('additionalCompensation', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="없음"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">기타 조건</label>
        <textarea
          value={data.otherConditions || ''}
          onChange={(e) => handleChange('otherConditions', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={2}
          placeholder="기타 합의 조건 (예: 경력증명서 발급, 취업 지원 등)"
        />
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">회사 정보</p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">회사명</label>
        <input
          type="text"
          value={data.clinicName}
          onChange={(e) => handleChange('clinicName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">대표자</label>
        <input
          type="text"
          value={data.representativeName}
          onChange={(e) => handleChange('representativeName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">작성일</label>
        <input
          type="date"
          value={data.submissionDate}
          onChange={(e) => handleChange('submissionDate', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  )
}

// 해고통보서 입력 폼
function TerminationNoticeForm({
  data,
  onChange
}: {
  data: TerminationNoticeData
  onChange: (data: TerminationNoticeData) => void
}) {
  const handleChange = (field: keyof TerminationNoticeData, value: string | boolean | number) => {
    onChange({ ...data, [field]: value })
  }

  // 해고일까지 남은 일수 계산
  const calculateDaysUntilTermination = () => {
    if (!data.noticeDate || !data.terminationDate) return null
    const notice = new Date(data.noticeDate)
    const termination = new Date(data.terminationDate)
    const diffTime = termination.getTime() - notice.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const daysUntilTermination = calculateDaysUntilTermination()
  const needsSeverancePay = daysUntilTermination !== null && daysUntilTermination < 30

  return (
    <div className="space-y-4">
      {/* 법적 유의사항 안내 */}
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <h4 className="font-semibold text-red-800 mb-2">⚠️ 해고 시 필수 법적 요건 (근로기준법)</h4>
        <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
          <li><strong>정당한 사유</strong>가 있어야 합니다 (근로기준법 제23조)</li>
          <li>해고일 <strong>30일 전</strong>까지 예고하거나, 30일분 이상의 통상임금을 지급해야 합니다 (제26조)</li>
          <li><strong>해고 사유와 해고 시기를 서면으로</strong> 명시해야 합니다 (제27조)</li>
          <li>서면 통지 없는 해고는 사유의 정당성과 관계없이 <strong>무효</strong>입니다</li>
          <li>위반 시 <strong>2년 이하 징역 또는 2천만원 이하 벌금</strong>에 처해질 수 있습니다</li>
        </ul>
      </div>

      {/* 해고예고 위반 경고 */}
      {needsSeverancePay && (
        <div className="p-4 bg-orange-50 border border-orange-300 rounded-lg">
          <h4 className="font-semibold text-orange-800 mb-2">📢 해고예고수당 지급 필요</h4>
          <p className="text-sm text-orange-700">
            통보일로부터 해고일까지 <strong>{daysUntilTermination}일</strong>입니다.
            30일 전 예고가 아니므로 <strong>30일분 이상의 통상임금</strong>을 해고예고수당으로 지급해야 합니다.
          </p>
        </div>
      )}

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">대상 직원 정보</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">성명</label>
          <input
            type="text"
            value={data.employeeName}
            onChange={(e) => handleChange('employeeName', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">직급</label>
          <input
            type="text"
            value={data.employeePosition}
            onChange={(e) => handleChange('employeePosition', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="치위생사"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">부서</label>
          <input
            type="text"
            value={data.department}
            onChange={(e) => handleChange('department', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="진료실"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">입사일</label>
          <input
            type="date"
            value={data.hireDate}
            onChange={(e) => handleChange('hireDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">해고 정보</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">통보일</label>
          <input
            type="date"
            value={data.noticeDate}
            onChange={(e) => handleChange('noticeDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">해고일</label>
          <input
            type="date"
            value={data.terminationDate}
            onChange={(e) => handleChange('terminationDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">해고 사유</label>
        <select
          value={data.reason}
          onChange={(e) => handleChange('reason', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {TerminationReasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          상세 사유 <span className="text-red-500">*필수</span>
        </label>
        <textarea
          value={data.detailedReason}
          onChange={(e) => handleChange('detailedReason', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={4}
          placeholder="근로기준법 제27조에 따라 해고 사유를 구체적으로 명시해야 합니다. 단순히 취업규칙 조문만 나열하는 것으로는 부족합니다."
          required
        />
        <p className="text-xs text-slate-500 mt-1">
          ※ 해고 사유가 구체적으로 기재되지 않으면 부당해고로 판정될 수 있습니다
        </p>
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">해고예고 관련</p>

      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={data.advanceNotice}
            onChange={(e) => handleChange('advanceNotice', e.target.checked)}
            className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700">30일 전 해고예고 완료</span>
        </label>
      </div>

      {!data.advanceNotice && (
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            해고예고수당 (30일분 통상임금)
          </label>
          <input
            type="text"
            value={data.severancePayInLieu || ''}
            onChange={(e) => handleChange('severancePayInLieu', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="예: 3,000,000원"
          />
        </div>
      )}

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">회사 정보</p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">회사명</label>
        <input
          type="text"
          value={data.clinicName}
          onChange={(e) => handleChange('clinicName', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">대표자</label>
          <input
            type="text"
            value={data.representativeName}
            onChange={(e) => handleChange('representativeName', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">사업자번호</label>
          <input
            type="text"
            value={data.businessNumber || ''}
            onChange={(e) => handleChange('businessNumber', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="123-45-67890"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">회사 주소</label>
        <input
          type="text"
          value={data.clinicAddress || ''}
          onChange={(e) => handleChange('clinicAddress', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">작성일</label>
        <input
          type="date"
          value={data.submissionDate}
          onChange={(e) => handleChange('submissionDate', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  )
}

// 권고사직서 미리보기
function RecommendedResignationPreview({
  data,
  formatDate
}: {
  data: RecommendedResignationData
  formatDate: (date: string) => string
}) {
  return (
    <div className="font-['Noto_Sans_KR'] text-slate-800 h-full flex flex-col text-[11px] overflow-hidden">
      {/* 제목 */}
      <h1 className="text-lg font-bold text-center mb-2">권 고 사 직 서</h1>

      {/* 본문 */}
      <div className="flex-1 flex flex-col">
        {/* 대상자 정보 */}
        <section className="mb-1.5">
          <h3 className="text-[11px] font-semibold mb-0.5 text-slate-600">대 상 자</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-[11px]">
            <tbody>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[15%]">성 명</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[35%]">{data.employeeName || '　'}</td>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[15%]">직 급</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[35%]">{translateRole(data.employeePosition) || data.employeePosition || '　'}</td>
              </tr>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">부 서</td>
                <td className="py-0.5 px-1.5 border border-slate-300">{data.department || '　'}</td>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">입사일</td>
                <td className="py-0.5 px-1.5 border border-slate-300">{formatDate(data.hireDate) || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 권고사직 내용 */}
        <section className="mb-1.5">
          <h3 className="text-[11px] font-semibold mb-0.5 text-slate-600">권고사직 내용</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-[11px]">
            <tbody>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">권고일</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[32%]">{formatDate(data.recommendedDate) || '　'}</td>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">예정 퇴직일</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[32%]">{formatDate(data.expectedResignationDate) || '　'}</td>
              </tr>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">사 유</td>
                <td className="py-0.5 px-1.5 border border-slate-300" colSpan={3}>{data.reason || '　'}</td>
              </tr>
              {data.detailedReason && (
                <tr>
                  <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">상세 사유</td>
                  <td className="py-0.5 px-1.5 border border-slate-300 break-words" colSpan={3}>{data.detailedReason}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* 퇴직 조건 */}
        {(data.severancePay || data.additionalCompensation || data.otherConditions) && (
          <section className="mb-1.5">
            <h3 className="text-[11px] font-semibold mb-0.5 text-slate-600">퇴직 조건</h3>
            <table className="w-full table-fixed border-collapse border border-slate-300 text-[11px]">
              <tbody>
                {data.severancePay && (
                  <tr>
                    <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[18%]">퇴직금</td>
                    <td className="py-0.5 px-1.5 border border-slate-300">{data.severancePay}</td>
                  </tr>
                )}
                {data.additionalCompensation && (
                  <tr>
                    <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">추가 위로금</td>
                    <td className="py-0.5 px-1.5 border border-slate-300">{data.additionalCompensation}</td>
                  </tr>
                )}
                {data.otherConditions && (
                  <tr>
                    <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">기타 조건</td>
                    <td className="py-0.5 px-1.5 border border-slate-300 break-words">{data.otherConditions}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {/* 본문 */}
        <section className="my-2">
          <p className="text-[11px] leading-5 text-justify">
            회사는 위 대상자에게 상기 사유로 인하여 권고사직을 통보하오니,
            <span className="font-semibold">{formatDate(data.expectedResignationDate) || '____년 __월 __일'}</span>까지
            퇴직 절차를 진행하여 주시기 바랍니다.
          </p>
          <p className="text-[11px] leading-5 text-justify mt-1">
            본 권고사직에 동의하시는 경우 아래에 서명하여 주시고,
            퇴직 조건에 대해 협의가 필요하신 경우 인사담당자에게 문의하여 주시기 바랍니다.
          </p>
        </section>

        {/* 안내 문구 */}
        <section className="my-1.5 p-1.5 bg-slate-50 rounded">
          <p className="text-[10px] text-slate-600 leading-4">
            ※ 본 권고사직은 강제가 아닌 권고이며, 귀하의 의사에 따라 수락 여부를 결정하실 수 있습니다.<br />
            ※ 권고사직에 동의하여 퇴직하는 경우, 고용보험법에 따른 실업급여 수급 자격이 부여됩니다.
          </p>
        </section>

        {/* 작성일 */}
        <section className="text-center my-2">
          <p className="text-xs">{formatDate(data.submissionDate) || '____년 __월 __일'}</p>
        </section>

        {/* 회사 정보 및 원장 서명 */}
        <section className="text-center">
          <div className="inline-block text-left text-[11px]">
            <p className="mb-0.5">
              <span className="inline-block w-14">회사명:</span>
              <span className="font-semibold">{data.clinicName || '　　　　　'}</span>
            </p>
            <p className="mb-0.5">
              <span className="inline-block w-14">대표자:</span>
              <span className="font-semibold">{data.representativeName || '　　　　　'}</span>
              {data.ownerSignature ? (
                <img src={data.ownerSignature} alt="원장 서명" className="h-7 inline-block ml-2" />
              ) : (
                <span className="ml-2 text-slate-400">(직인)</span>
              )}
            </p>
            <p>
              <span className="inline-block w-14">주 소:</span>
              <span>{data.clinicAddress || '　　　　　'}</span>
            </p>
          </div>
        </section>

        {/* 직원 확인 서명란 */}
        <section className="mt-2 pt-2 border-t-2 border-slate-300">
          <h3 className="text-[11px] font-semibold mb-1.5 text-slate-600">대상자 확인</h3>
          <div className="flex justify-end items-center gap-2">
            <span className="text-[11px]">위 내용을 확인하였습니다.</span>
            <span className="font-medium text-[11px]">확인자:</span>
            <span className="text-xs">{data.employeeName || '　　　　　'}</span>
            {data.employeeSignature ? (
              <img src={data.employeeSignature} alt="직원 서명" className="h-7 ml-1" />
            ) : (
              <span className="text-slate-400 text-[11px]">(서명)</span>
            )}
          </div>
        </section>

        {/* 전자서명 법적 효력 고지 */}
        {(data.ownerSignature || data.employeeSignature) && (
          <section className="mt-1.5 pt-1.5 border-t border-slate-200">
            <div className="bg-slate-50 p-1.5 rounded text-[10px] text-slate-500 leading-3">
              <p>※ 본 전자문서는 전자서명법 제3조에 따라 자필 서명과 동일한 법적 효력을 가집니다.</p>
              <p>※ 전자서명 후 문서의 무결성이 보장됩니다 (SHA-256 해시).</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

// 해고통보서 미리보기
function TerminationNoticePreview({
  data,
  formatDate
}: {
  data: TerminationNoticeData
  formatDate: (date: string) => string
}) {
  return (
    <div className="font-['Noto_Sans_KR'] text-slate-800 h-full flex flex-col justify-between text-[11px] overflow-hidden">
      {/* 제목 */}
      <h1 className="text-lg font-bold text-center mb-0.5">해 고 통 보 서</h1>

      {/* 법적 근거 */}
      <p className="text-[9px] text-slate-500 text-center mb-1">
        (근로기준법 제23조, 제26조, 제27조에 따른 서면 통지)
      </p>

      {/* 본문 */}
      <div className="flex-1 flex flex-col justify-between">
        {/* 대상자 정보 */}
        <section className="mb-1">
          <h3 className="text-[11px] font-semibold mb-0.5 text-slate-600">해고 대상자</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-[11px]">
            <tbody>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[15%]">성 명</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[35%]">{data.employeeName || '　'}</td>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[15%]">직 급</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[35%]">{translateRole(data.employeePosition) || data.employeePosition || '　'}</td>
              </tr>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">부 서</td>
                <td className="py-0.5 px-1.5 border border-slate-300">{data.department || '　'}</td>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">입사일</td>
                <td className="py-0.5 px-1.5 border border-slate-300">{formatDate(data.hireDate) || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 해고 내용 */}
        <section className="mb-1">
          <h3 className="text-[11px] font-semibold mb-0.5 text-slate-600">해고 내용</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-[11px]">
            <tbody>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[15%]">통보일</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[35%]">{formatDate(data.noticeDate) || '　'}</td>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[15%]">해고일</td>
                <td className="py-0.5 px-1.5 border border-slate-300 w-[35%] font-semibold text-red-600">{formatDate(data.terminationDate) || '　'}</td>
              </tr>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300">해고 사유</td>
                <td className="py-0.5 px-1.5 border border-slate-300" colSpan={3}>{data.reason || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 상세 해고 사유 */}
        <section className="mb-1">
          <h3 className="text-[11px] font-semibold mb-0.5 text-slate-600">상세 해고 사유</h3>
          <div className="p-1 border border-slate-300 rounded bg-white min-h-[24px]">
            <p className="text-[11px] leading-4 whitespace-pre-wrap break-words">{data.detailedReason || '　'}</p>
          </div>
        </section>

        {/* 해고예고 관련 */}
        <section className="mb-1">
          <h3 className="text-[11px] font-semibold mb-0.5 text-slate-600">해고예고 관련</h3>
          <table className="w-full table-fixed border-collapse border border-slate-300 text-[11px]">
            <tbody>
              <tr>
                <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[20%]">해고예고 여부</td>
                <td className="py-0.5 px-1.5 border border-slate-300">
                  {data.advanceNotice ? '30일 전 예고 완료' : '30일 전 예고 미완료'}
                </td>
                {!data.advanceNotice && data.severancePayInLieu && (
                  <>
                    <td className="py-0.5 px-1.5 bg-slate-50 font-medium border border-slate-300 w-[20%]">해고예고수당</td>
                    <td className="py-0.5 px-1.5 border border-slate-300">{data.severancePayInLieu}</td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </section>

        {/* 본문 */}
        <section className="my-1">
          <p className="text-[11px] leading-4 text-justify">
            위 대상자는 상기 사유로 인하여 <span className="font-semibold text-red-600">{formatDate(data.terminationDate) || '____년 __월 __일'}</span>부로
            해고됨을 근로기준법 제27조에 따라 서면으로 통보합니다.
          </p>
        </section>

        {/* 구제신청 안내 */}
        <section className="my-1 p-1 bg-slate-50 rounded">
          <p className="text-[9px] text-slate-600 font-medium mb-0.5">[ 부당해고 구제신청 안내 ]</p>
          <p className="text-[9px] text-slate-600 leading-3">
            본 해고에 이의가 있는 경우, 근로기준법 제28조에 따라 해고일로부터 3개월 이내에
            관할 지방노동위원회에 부당해고 구제신청을 할 수 있습니다.
          </p>
        </section>

        {/* 작성일 */}
        <section className="text-center my-1">
          <p className="text-[11px]">{formatDate(data.submissionDate) || '____년 __월 __일'}</p>
        </section>

        {/* 회사 정보 */}
        <section className="text-center">
          <div className="inline-block text-left text-[11px]">
            <p className="mb-0.5">
              <span className="inline-block w-14">회 사 명:</span>
              <span className="font-semibold">{data.clinicName || '　　　　　'}</span>
              <span className="ml-2 inline-block w-14">사업자번호:</span>
              <span>{data.businessNumber || '　　　　　'}</span>
            </p>
            <p className="mb-0.5">
              <span className="inline-block w-14">대 표 자:</span>
              <span className="font-semibold">{data.representativeName || '　　　　　'}</span>
              <span className="ml-2 text-slate-400">(직인)</span>
            </p>
            <p>
              <span className="inline-block w-14">주 소:</span>
              <span>{data.clinicAddress || '　　　　　'}</span>
            </p>
          </div>
        </section>

        {/* 수령 확인란 */}
        <section className="mt-auto pt-1 border-t border-slate-300">
          <p className="text-center text-[9px] text-slate-500 mb-0.5">[ 수령 확인 ]</p>
          <p className="text-center text-[11px]">
            본인은 상기 해고통보서를 수령하였음을 확인합니다.
          </p>
          <div className="flex justify-center items-center gap-2 mt-0.5 text-[11px]">
            <span>수령일: ____년 __월 __일</span>
            <span>수령인: __________ (서명)</span>
          </div>
        </section>
      </div>
    </div>
  )
}

// 복지비 지급 확인서 입력 폼
function WelfarePaymentForm({
  data,
  onChange
}: {
  data: WelfarePaymentData
  onChange: (data: WelfarePaymentData) => void
}) {
  const handleChange = (field: keyof WelfarePaymentData, value: string) => {
    onChange({ ...data, [field]: value })
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-600">신청자 정보</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">성명</label>
          <input
            type="text"
            value={data.employeeName}
            onChange={(e) => handleChange('employeeName', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="홍길동"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">생년월일</label>
          <input
            type="date"
            value={data.birthDate}
            onChange={(e) => handleChange('birthDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">연락처</label>
          <input
            type="text"
            value={data.phone}
            onChange={(e) => handleChange('phone', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="010-1234-5678"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">상호명</label>
          <input
            type="text"
            value={data.clinicName}
            onChange={(e) => handleChange('clinicName', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <hr className="my-4" />
      <p className="text-sm font-semibold text-slate-600">지급 정보</p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">지급방법</label>
        <div className="flex gap-4">
          <label className="flex items-center">
            <input
              type="radio"
              name="paymentMethod"
              value="cash"
              checked={data.paymentMethod === 'cash'}
              onChange={(e) => handleChange('paymentMethod', e.target.value)}
              className="mr-2"
            />
            현금
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="paymentMethod"
              value="transfer"
              checked={data.paymentMethod === 'transfer'}
              onChange={(e) => handleChange('paymentMethod', e.target.value)}
              className="mr-2"
            />
            계좌이체
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              name="paymentMethod"
              value="hospital_card"
              checked={data.paymentMethod === 'hospital_card'}
              onChange={(e) => handleChange('paymentMethod', e.target.value)}
              className="mr-2"
            />
            병원카드
          </label>
        </div>
      </div>

      {data.paymentMethod === 'transfer' && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">계좌번호</label>
            <input
              type="text"
              value={data.accountNumber || ''}
              onChange={(e) => handleChange('accountNumber', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="123-456-789012"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">예금주</label>
              <input
                type="text"
                value={data.accountHolder || ''}
                onChange={(e) => handleChange('accountHolder', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="홍길동"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">은행명</label>
              <input
                type="text"
                value={data.bankName || ''}
                onChange={(e) => handleChange('bankName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="국민은행"
              />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">지급 일자</label>
          <input
            type="date"
            value={data.paymentDate}
            onChange={(e) => handleChange('paymentDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">지급요청일</label>
          <input
            type="date"
            value={data.requestDate}
            onChange={(e) => handleChange('requestDate', e.target.value)}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">지급 금액</label>
        <input
          type="text"
          value={data.paymentAmount}
          onChange={(e) => handleChange('paymentAmount', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="100,000"
        />
      </div>

      <hr className="my-4" />

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">복지비 지급 사유</label>
        <textarea
          value={data.paymentReason}
          onChange={(e) => handleChange('paymentReason', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          placeholder="해당 직원의 업무 기여도 및 향후 업무증진을 위해 운동비 등"
        />
      </div>
    </div>
  )
}

// 복지비 지급 확인서 미리보기
function WelfarePaymentPreview({
  data,
  formatDate
}: {
  data: WelfarePaymentData
  formatDate: (date: string) => string
}) {
  // 날짜를 년, 월, 일로 분리하는 함수
  const parseDateParts = (dateStr: string) => {
    if (!dateStr) return { year: '', month: '', day: '' }
    const date = new Date(dateStr)
    return {
      year: date.getFullYear().toString(),
      month: (date.getMonth() + 1).toString(),
      day: date.getDate().toString()
    }
  }

  const paymentDateParts = parseDateParts(data.paymentDate)
  const requestDateParts = parseDateParts(data.requestDate)

  return (
    <div className="font-['Noto_Sans_KR'] text-slate-800 h-full flex flex-col justify-between text-[11px] overflow-hidden">
      {/* 제목 */}
      <h1 className="text-lg font-bold text-center mb-2 tracking-[0.2em]">복 지 비 지 급 확 인 서</h1>

      <div className="flex-1 flex flex-col justify-between">
        {/* 신청자 정보 테이블 */}
        <table className="w-full table-fixed border-collapse border border-slate-400 mb-2 text-[10px]">
          <tbody>
            <tr>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 w-[16%] text-center">성명</td>
              <td className="py-1 px-1.5 border border-slate-400 w-[34%]">{data.employeeName || '　'}</td>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 w-[16%] text-center">생년월일</td>
              <td className="py-1 px-1.5 border border-slate-400 w-[34%]">{formatDate(data.birthDate) || '　'}</td>
            </tr>
            <tr>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">연락처</td>
              <td className="py-1 px-1.5 border border-slate-400">{data.phone || '　'}</td>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">상호명</td>
              <td className="py-1 px-1.5 border border-slate-400">{data.clinicName || '　'}</td>
            </tr>
            <tr>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">지급방법</td>
              <td className="py-1 px-1.5 border border-slate-400" colSpan={3}>
                <span className="mr-2">{data.paymentMethod === 'cash' ? '◉' : '○'} 현금</span>
                <span className="mr-2">{data.paymentMethod === 'transfer' ? '◉' : '○'} 계좌이체</span>
                <span>{data.paymentMethod === 'hospital_card' ? '◉' : '○'} 병원카드</span>
              </td>
            </tr>
            {data.paymentMethod === 'transfer' && (
              <tr>
                <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">예금주/은행</td>
                <td className="py-1 px-1.5 border border-slate-400">
                  {data.accountHolder || '　'} / {data.bankName || '　'}
                </td>
                <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">계좌번호</td>
                <td className="py-1 px-1.5 border border-slate-400">{data.accountNumber || '　'}</td>
              </tr>
            )}
            <tr>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">지급요청일</td>
              <td className="py-1 px-1.5 border border-slate-400">
                {requestDateParts.year || '____'}년 {requestDateParts.month || '__'}월 {requestDateParts.day || '__'}일
              </td>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">지급일자</td>
              <td className="py-1 px-1.5 border border-slate-400">
                20{paymentDateParts.year ? paymentDateParts.year.slice(-2) : '__'}년 {paymentDateParts.month || '__'}월 {paymentDateParts.day || '__'}일
              </td>
            </tr>
            <tr>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">지급금액</td>
              <td className="py-1 px-1.5 border border-slate-400" colSpan={3}>
                일금 {data.paymentAmount || '           '} 원정
              </td>
            </tr>
            <tr>
              <td className="py-1 px-1.5 bg-slate-100 font-medium border border-slate-400 text-center">
                지급사유
              </td>
              <td className="py-1 px-1.5 border border-slate-400 break-words" colSpan={3}>
                {data.paymentReason || '　'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* 복지비 지급 확인 문구 */}
        <div className="text-center my-1 text-[10px]">
          <p>복지비 지급을 확인합니다.</p>
        </div>

        {/* 복지비 지급 동의 */}
        <div className="border border-slate-400 p-1.5 mb-2">
          <p className="font-semibold mb-0.5 text-[10px]">복지비 지급 동의</p>
          <p className="text-[10px] leading-4">
            상기와 같은 사유로 복지비를 요청하며, 요청한 복지비 금액을 확인할 수 있도록
            업체로부터 발급받은 영수증을 회사에 제출함을 동의합니다.
          </p>
          <div className="flex justify-end items-center gap-2 mt-1 text-[10px]">
            <span>동의자</span>
            <span className="inline-block w-20 border-b border-slate-400 text-center">
              {data.employeeName || '　'}
            </span>
            {data.applicantSignature ? (
              <img
                src={data.applicantSignature}
                alt="동의자 서명"
                className="h-5"
              />
            ) : (
              <span>(인)</span>
            )}
          </div>
        </div>

        {/* 신청 문구 */}
        <div className="text-center my-1 text-[10px]">
          <p>상기 금액에 대해 위와 같은 사유로 복지비를 신청합니다.</p>
        </div>

        {/* 날짜 */}
        <div className="text-center my-1 text-[10px]">
          <p>{requestDateParts.year || '____'}년 {requestDateParts.month || '__'}월 {requestDateParts.day || '__'}일</p>
        </div>

        {/* 서명란 */}
        <div className="mt-auto space-y-1 text-[10px]">
          <div className="flex justify-center items-center gap-2">
            <span className="w-14 text-right">신청자 :</span>
            <span className="inline-block w-24 border-b border-slate-400 text-center">
              {data.employeeName || '　'}
            </span>
            {data.applicantSignature ? (
              <img
                src={data.applicantSignature}
                alt="신청자 서명"
                className="h-5"
              />
            ) : (
              <span>(인)</span>
            )}
          </div>
          <div className="flex justify-center items-center gap-2">
            <span className="w-14 text-right">확인자 :</span>
            <span className="inline-block w-24 border-b border-slate-400 text-center">

            </span>
            {data.confirmSignature ? (
              <img
                src={data.confirmSignature}
                alt="확인자 서명"
                className="h-5"
              />
            ) : (
              <span>(인)</span>
            )}
          </div>
        </div>

        {/* 전자서명 법적 효력 고지 */}
        <div className="mt-2 pt-1 border-t border-slate-200">
          <div className="bg-slate-50 p-1.5 rounded text-[9px] text-slate-600">
            <p className="font-medium mb-0.5">※ 전자문서 법적 효력 안내</p>
            <ul className="space-y-0 list-disc list-inside">
              <li>본 전자 확인서는 전자서명법에 따라 자필 서명과 동일한 법적 효력을 가집니다.</li>
              <li>복지비 수령 사실을 확인하는 증빙 서류로 사용됩니다.</li>
              <li>전자서명 후 문서의 무결성이 보장됩니다.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
