/**
 * Document Template Types
 * 사직서, 재직증명서 등 문서 양식 타입 정의
 */

// 문서 타입
export type DocumentType = 'resignation' | 'employment_certificate'

// 문서 타입 한글 라벨
export const DocumentTypeLabels: Record<DocumentType, string> = {
  resignation: '사직서',
  employment_certificate: '재직증명서'
}

// 사직서 데이터
export interface ResignationData {
  // 직원 정보
  employeeName: string
  employeePosition: string
  department: string

  // 퇴사 정보
  hireDate: string
  resignationDate: string

  // 사유
  resignationReason: string
  detailedReason?: string

  // 회사 정보
  clinicName: string
  representativeName: string
  clinicAddress?: string

  // 작성일
  submissionDate: string

  // 서명
  employeeSignature?: string
}

// 재직증명서 데이터
export interface EmploymentCertificateData {
  // 발급 정보
  certificateNumber?: string
  issueDate: string

  // 직원 정보
  employeeName: string
  employeeBirthDate?: string
  employeeAddress?: string
  employeePhone?: string

  // 재직 정보
  position: string
  department: string
  hireDate: string
  currentlyEmployed: boolean
  resignationDate?: string

  // 회사 정보
  clinicName: string
  representativeName: string
  businessNumber?: string
  clinicAddress?: string
  clinicPhone?: string

  // 발급 목적
  purpose: string
}

// 기본 사직 사유 옵션
export const ResignationReasons = [
  '개인 사정',
  '건강 문제',
  '이직',
  '학업',
  '가정 사정',
  '직무 변경',
  '기타'
] as const

// 재직증명서 발급 목적 옵션
export const CertificatePurposes = [
  '금융기관 제출용',
  '관공서 제출용',
  '이직용',
  '비자 신청용',
  '학교 제출용',
  '기타'
] as const

// 문서 양식 폼 상태
export interface DocumentFormState<T> {
  data: T
  isValid: boolean
  errors: Partial<Record<keyof T, string>>
}

// 기본 사직서 데이터
export const getDefaultResignationData = (
  clinicName?: string,
  representativeName?: string
): ResignationData => ({
  employeeName: '',
  employeePosition: '',
  department: '진료실',
  hireDate: '',
  resignationDate: '',
  resignationReason: '개인 사정',
  detailedReason: '',
  clinicName: clinicName || '',
  representativeName: representativeName || '',
  clinicAddress: '',
  submissionDate: new Date().toISOString().split('T')[0]
})

// 기본 재직증명서 데이터
export const getDefaultEmploymentCertificateData = (
  clinicName?: string,
  representativeName?: string
): EmploymentCertificateData => ({
  certificateNumber: '',
  issueDate: new Date().toISOString().split('T')[0],
  employeeName: '',
  employeeBirthDate: '',
  employeeAddress: '',
  employeePhone: '',
  position: '',
  department: '진료실',
  hireDate: '',
  currentlyEmployed: true,
  resignationDate: '',
  clinicName: clinicName || '',
  representativeName: representativeName || '',
  businessNumber: '',
  clinicAddress: '',
  clinicPhone: '',
  purpose: '금융기관 제출용'
})
