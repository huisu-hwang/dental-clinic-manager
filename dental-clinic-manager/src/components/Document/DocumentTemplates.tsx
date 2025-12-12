'use client'

/**
 * DocumentTemplates Component
 * 사직서, 재직증명서 등 문서 양식 생성 및 출력 기능
 */

import { useState, useRef, useEffect } from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { useAuth } from '@/contexts/AuthContext'
import { dataService } from '@/lib/dataService'
import {
  DocumentType,
  DocumentTypeLabels,
  ResignationData,
  EmploymentCertificateData,
  ResignationReasons,
  CertificatePurposes,
  getDefaultResignationData,
  getDefaultEmploymentCertificateData
} from '@/types/document'
import { FileText, Printer, Download, ChevronLeft, ChevronRight, Users, PenTool } from 'lucide-react'
import SignaturePad from '@/components/Contract/SignaturePad'

// 직급 영문 -> 한글 변환
const translateRole = (role: string | undefined): string => {
  if (!role) return ''
  const roleMap: Record<string, string> = {
    'owner': '대표',
    'manager': '관리자',
    'staff': '직원',
    'dentist': '치과의사',
    'hygienist': '치위생사',
    'assistant': '치과조무사',
    'receptionist': '데스크',
    'admin': '사무장',
    'intern': '인턴',
    'part-time': '파트타임'
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
}

export default function DocumentTemplates() {
  const { user } = useAuth()
  const [documentType, setDocumentType] = useState<DocumentType>('resignation')
  const [isPdfGenerating, setIsPdfGenerating] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [staffList, setStaffList] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [showSignatureModal, setShowSignatureModal] = useState(false)
  const documentRef = useRef<HTMLDivElement>(null)

  // 사직서 데이터
  const [resignationData, setResignationData] = useState<ResignationData>(
    getDefaultResignationData(user?.clinic?.name, user?.clinic?.owner_name)
  )

  // 재직증명서 데이터
  const [certificateData, setCertificateData] = useState<EmploymentCertificateData>(
    getDefaultEmploymentCertificateData(user?.clinic?.name, user?.clinic?.owner_name)
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
            birth_date: s.birth_date || ''
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
    if (user) {
      // 회사 정보 업데이트
      const clinicInfo = {
        clinicName: user.clinic?.name || '',
        representativeName: user.clinic?.owner_name || '',
        clinicAddress: user.clinic?.address || ''
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
        employeeBirthDate: prev.employeeBirthDate || user.birth_date || ''
      }))
    }
  }, [user])

  // 직원 선택 시 데이터 자동 입력
  const handleStaffSelect = (staffId: string) => {
    setSelectedStaff(staffId)
    const staff = staffList.find(s => s.id === staffId)
    if (!staff) return

    if (documentType === 'resignation') {
      setResignationData(prev => ({
        ...prev,
        employeeName: staff.name || '',
        employeePosition: staff.position || translateRole(staff.role) || '',
        hireDate: staff.hire_date || ''
      }))
    } else {
      setCertificateData(prev => ({
        ...prev,
        employeeName: staff.name || '',
        position: staff.position || translateRole(staff.role) || '',
        employeePhone: staff.phone || '',
        hireDate: staff.hire_date || '',
        employeeAddress: staff.address || '',
        employeeBirthDate: staff.birth_date || ''
      }))
    }
  }

  // PDF 다운로드
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

      const img = new Image()
      img.src = imgData
      await new Promise((resolve) => { img.onload = resolve })

      const imgWidth = img.width
      const imgHeight = img.height
      const ratio = imgWidth / imgHeight
      const width = pdfWidth - 20
      const height = width / ratio

      let position = 10
      let heightLeft = height

      pdf.addImage(imgData, 'PNG', 10, position, width, height)
      heightLeft -= (pdfHeight - 20)

      while (heightLeft > 0) {
        position = heightLeft - height + 10
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 10, position, width, height)
        heightLeft -= pdfHeight
      }

      const fileName = documentType === 'resignation'
        ? `사직서_${resignationData.employeeName || '문서'}.pdf`
        : `재직증명서_${certificateData.employeeName || '문서'}.pdf`

      pdf.save(fileName)
    } catch (error) {
      console.error('PDF 생성 중 오류 발생:', error)
      alert('PDF를 생성하는 데 실패했습니다.')
    } finally {
      setIsPdfGenerating(false)
    }
  }

  // 프린트
  const handlePrint = () => {
    window.print()
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

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">문서 양식</h2>
          <p className="text-slate-500 mt-1">사직서, 재직증명서 등 문서 양식을 작성하고 출력하세요</p>
        </div>
      </div>

      {/* 문서 타입 선택 */}
      <div className="flex gap-3 print:hidden">
        {(Object.keys(DocumentTypeLabels) as DocumentType[]).map((type) => (
          <button
            key={type}
            onClick={() => handleDocumentTypeChange(type)}
            className={`px-6 py-3 rounded-lg font-medium transition-all ${
              documentType === type
                ? 'bg-blue-600 text-white shadow-md'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-4 h-4 inline-block mr-2" />
            {DocumentTypeLabels[type]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:block">
        {/* 입력 폼 */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 print:hidden">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            {DocumentTypeLabels[documentType]} 정보 입력
          </h3>

          {/* 직원 선택 */}
          {staffList.length > 0 && (
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

          {documentType === 'resignation' ? (
            <ResignationForm data={resignationData} onChange={setResignationData} />
          ) : (
            <EmploymentCertificateForm data={certificateData} onChange={setCertificateData} />
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

          {/* 액션 버튼 */}
          <div className="flex gap-3 mt-6 pt-4 border-t">
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex-1 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
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
            <button
              onClick={handlePrint}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              <Printer className="w-4 h-4 inline-block mr-1" />
              인쇄
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={isPdfGenerating}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors ${
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
              className="bg-white p-8 border border-slate-200 rounded-lg print:border-none print:p-0"
              style={{ minHeight: '800px' }}
            >
              {documentType === 'resignation' ? (
                <ResignationPreview data={resignationData} formatDate={formatDate} />
              ) : (
                <EmploymentCertificatePreview data={certificateData} formatDate={formatDate} />
              )}
            </div>
          </div>
        </div>
      </div>

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
    </div>
  )
}

// 사직서 입력 폼
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
        <label className="block text-sm font-medium text-slate-700 mb-1">마지막 근무일</label>
        <input
          type="date"
          value={data.lastWorkDate}
          onChange={(e) => handleChange('lastWorkDate', e.target.value)}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
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
    <div className="font-['Noto_Sans_KR'] text-slate-800 leading-relaxed">
      {/* 제목 */}
      <h1 className="text-3xl font-bold text-center mb-12">사 직 서</h1>

      {/* 본문 */}
      <div className="space-y-8 text-base">
        {/* 인적사항 */}
        <section>
          <table className="w-full border-collapse">
            <tbody>
              <tr className="border-t border-b border-slate-300">
                <td className="py-3 px-4 bg-slate-50 font-medium w-28">성 명</td>
                <td className="py-3 px-4">{data.employeeName || '　'}</td>
                <td className="py-3 px-4 bg-slate-50 font-medium w-28">직 급</td>
                <td className="py-3 px-4">{translateRole(data.employeePosition) || data.employeePosition || '　'}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="py-3 px-4 bg-slate-50 font-medium">부 서</td>
                <td className="py-3 px-4" colSpan={3}>{data.department || '　'}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="py-3 px-4 bg-slate-50 font-medium">입사일</td>
                <td className="py-3 px-4">{formatDate(data.hireDate) || '　'}</td>
                <td className="py-3 px-4 bg-slate-50 font-medium">퇴사 희망일</td>
                <td className="py-3 px-4">{formatDate(data.resignationDate) || '　'}</td>
              </tr>
              <tr className="border-b border-slate-300">
                <td className="py-3 px-4 bg-slate-50 font-medium">마지막 근무일</td>
                <td className="py-3 px-4" colSpan={3}>{formatDate(data.lastWorkDate) || '　'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 사직 사유 */}
        <section>
          <h3 className="text-lg font-semibold mb-3 border-b-2 border-slate-800 pb-2">사직 사유</h3>
          <p className="mt-4 text-base leading-8">
            상기 본인은 <span className="font-semibold">{data.resignationReason || '개인 사정'}</span>
            {data.resignationReason === '기타' && data.detailedReason && (
              <span> ({data.detailedReason})</span>
            )}
            (으)로 인하여{' '}
            <span className="font-semibold">{formatDate(data.resignationDate) || '____년 __월 __일'}</span>
            부로 사직하고자 하오니 허락하여 주시기 바랍니다.
          </p>
          {data.detailedReason && data.resignationReason !== '기타' && (
            <div className="mt-4 p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600 font-medium mb-1">상세 사유:</p>
              <p>{data.detailedReason}</p>
            </div>
          )}
        </section>

        {/* 작성일 */}
        <section className="text-center mt-12">
          <p className="text-lg">{formatDate(data.submissionDate) || '____년 __월 __일'}</p>
        </section>

        {/* 서명란 */}
        <section className="mt-12">
          <div className="flex justify-end items-center gap-4">
            <span className="font-medium">작성자:</span>
            <span className="text-lg">{data.employeeName || '　　　　　'}</span>
            {data.employeeSignature ? (
              <img
                src={data.employeeSignature}
                alt="서명"
                className="h-12 ml-2"
              />
            ) : (
              <span className="text-slate-400">(인)</span>
            )}
          </div>
        </section>

        {/* 수신자 */}
        <section className="mt-16 pt-8 border-t-2 border-slate-300">
          <p className="text-center text-lg">
            <span className="font-semibold">{data.clinicName || '○○○○'}</span>
            <span className="mx-2">대표이사</span>
            <span className="font-semibold">{data.representativeName || '○○○'}</span>
            <span className="ml-2">귀하</span>
          </p>
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
    <div className="font-['Noto_Sans_KR'] text-slate-800 leading-relaxed">
      {/* 문서 번호 */}
      {data.certificateNumber && (
        <p className="text-right text-sm text-slate-500 mb-4">{data.certificateNumber}</p>
      )}

      {/* 제목 */}
      <h1 className="text-3xl font-bold text-center mb-10">재 직 증 명 서</h1>

      {/* 직원 정보 */}
      <section className="mb-8">
        <h3 className="text-base font-semibold mb-3 text-slate-600">인 적 사 항</h3>
        <table className="w-full border-collapse border border-slate-300">
          <tbody>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300 w-28">성 명</td>
              <td className="py-3 px-4 border border-slate-300">{data.employeeName || '　'}</td>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300 w-28">생년월일</td>
              <td className="py-3 px-4 border border-slate-300">{formatDate(data.employeeBirthDate || '') || '　'}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300">주 소</td>
              <td className="py-3 px-4 border border-slate-300" colSpan={3}>{data.employeeAddress || '　'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 재직 정보 */}
      <section className="mb-8">
        <h3 className="text-base font-semibold mb-3 text-slate-600">재 직 사 항</h3>
        <table className="w-full border-collapse border border-slate-300">
          <tbody>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300 w-28">소 속</td>
              <td className="py-3 px-4 border border-slate-300">{data.department || '　'}</td>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300 w-28">직 급</td>
              <td className="py-3 px-4 border border-slate-300">{translateRole(data.position) || data.position || '　'}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300">재직기간</td>
              <td className="py-3 px-4 border border-slate-300" colSpan={3}>
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
      <section className="mb-8">
        <h3 className="text-base font-semibold mb-3 text-slate-600">회 사 정 보</h3>
        <table className="w-full border-collapse border border-slate-300">
          <tbody>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300 w-28">회사명</td>
              <td className="py-3 px-4 border border-slate-300">{data.clinicName || '　'}</td>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300 w-28">대표자</td>
              <td className="py-3 px-4 border border-slate-300">{data.representativeName || '　'}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300">사업자번호</td>
              <td className="py-3 px-4 border border-slate-300" colSpan={3}>{data.businessNumber || '　'}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300">소재지</td>
              <td className="py-3 px-4 border border-slate-300" colSpan={3}>{data.clinicAddress || '　'}</td>
            </tr>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300">전화번호</td>
              <td className="py-3 px-4 border border-slate-300" colSpan={3}>{data.clinicPhone || '　'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 발급 목적 */}
      <section className="mb-8">
        <table className="w-full border-collapse border border-slate-300">
          <tbody>
            <tr>
              <td className="py-3 px-4 bg-slate-50 font-medium border border-slate-300 w-28">용 도</td>
              <td className="py-3 px-4 border border-slate-300">{data.purpose || '　'}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 증명 문구 */}
      <section className="my-12 text-center">
        <p className="text-lg leading-8">
          위 사실을 증명합니다.
        </p>
      </section>

      {/* 발급일 */}
      <section className="text-center my-8">
        <p className="text-lg">{formatDate(data.issueDate) || '____년 __월 __일'}</p>
      </section>

      {/* 회사 직인란 */}
      <section className="mt-12 text-center">
        <div className="inline-block text-left">
          <p className="mb-2">
            <span className="inline-block w-24">회 사 명:</span>
            <span className="font-semibold">{data.clinicName || '　　　　　'}</span>
          </p>
          <p className="mb-2">
            <span className="inline-block w-24">대 표 자:</span>
            <span className="font-semibold">{data.representativeName || '　　　　　'}</span>
            <span className="ml-4 text-slate-400">(직인)</span>
          </p>
          <p>
            <span className="inline-block w-24">주 소:</span>
            <span>{data.clinicAddress || '　　　　　'}</span>
          </p>
        </div>
      </section>
    </div>
  )
}
