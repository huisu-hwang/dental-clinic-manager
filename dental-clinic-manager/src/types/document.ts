/**
 * Document Template Types
 * 사직서, 재직증명서 등 문서 양식 타입 정의
 */

// 문서 타입
export type DocumentType = 'resignation' | 'employment_certificate' | 'recommended_resignation' | 'termination_notice' | 'welfare_payment'

// 문서 타입 한글 라벨
export const DocumentTypeLabels: Record<DocumentType, string> = {
  resignation: '사직서',
  employment_certificate: '재직증명서',
  recommended_resignation: '권고사직서',
  termination_notice: '해고통보서',
  welfare_payment: '복지비 지급 확인서'
}

// 원장 전용 문서 타입 (직원은 작성 불가)
// 권고사직서, 해고통보서, 복지비 지급 확인서는 원장이 직원에게 발급하는 문서
export const OwnerOnlyDocumentTypes: DocumentType[] = ['recommended_resignation', 'termination_notice', 'welfare_payment']

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

// 권고사직 사유 옵션
export const RecommendedResignationReasons = [
  '경영상 필요',
  '직무 부적합',
  '업무 성과 미달',
  '조직 개편',
  '사업 축소',
  '기타'
] as const

// 해고 사유 옵션
export const TerminationReasons = [
  '근무태도 불량',
  '업무능력 부족',
  '회사 규정 위반',
  '무단결근',
  '업무상 중대한 과실',
  '경영상 이유 (정리해고)',
  '기타'
] as const

// 권고사직서 데이터
export interface RecommendedResignationData {
  // 대상 직원 정보
  employeeName: string
  employeePosition: string
  department: string
  hireDate: string

  // 권고사직 정보
  recommendedDate: string  // 권고일
  expectedResignationDate: string  // 예정 퇴직일
  reason: string  // 권고사직 사유
  detailedReason?: string  // 상세 사유

  // 퇴직 조건
  severancePay?: string  // 퇴직금
  additionalCompensation?: string  // 추가 위로금
  otherConditions?: string  // 기타 조건

  // 회사 정보
  clinicName: string
  representativeName: string
  clinicAddress?: string

  // 작성일
  submissionDate: string

  // 서명
  ownerSignature?: string
}

// 해고통보서 데이터
export interface TerminationNoticeData {
  // 대상 직원 정보
  employeeName: string
  employeePosition: string
  department: string
  hireDate: string

  // 해고 정보
  noticeDate: string  // 통보일
  terminationDate: string  // 해고일
  reason: string  // 해고 사유
  detailedReason: string  // 상세 사유 (필수 - 근로기준법 제27조)

  // 해고예고 관련
  advanceNotice: boolean  // 30일 전 예고 여부
  advanceNoticeDays?: number  // 예고 일수
  severancePayInLieu?: string  // 해고예고수당 (30일 전 예고 못한 경우)

  // 회사 정보
  clinicName: string
  representativeName: string
  businessNumber?: string
  clinicAddress?: string
  clinicPhone?: string

  // 작성일
  submissionDate: string

  // 서명
  ownerSignature?: string
}

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

// 기본 권고사직서 데이터
export const getDefaultRecommendedResignationData = (
  clinicName?: string,
  representativeName?: string
): RecommendedResignationData => ({
  employeeName: '',
  employeePosition: '',
  department: '진료실',
  hireDate: '',
  recommendedDate: new Date().toISOString().split('T')[0],
  expectedResignationDate: '',
  reason: '경영상 필요',
  detailedReason: '',
  severancePay: '',
  additionalCompensation: '',
  otherConditions: '',
  clinicName: clinicName || '',
  representativeName: representativeName || '',
  clinicAddress: '',
  submissionDate: new Date().toISOString().split('T')[0]
})

// 기본 해고통보서 데이터
export const getDefaultTerminationNoticeData = (
  clinicName?: string,
  representativeName?: string
): TerminationNoticeData => ({
  employeeName: '',
  employeePosition: '',
  department: '진료실',
  hireDate: '',
  noticeDate: new Date().toISOString().split('T')[0],
  terminationDate: '',
  reason: '근무태도 불량',
  detailedReason: '',
  advanceNotice: true,
  advanceNoticeDays: 30,
  severancePayInLieu: '',
  clinicName: clinicName || '',
  representativeName: representativeName || '',
  businessNumber: '',
  clinicAddress: '',
  clinicPhone: '',
  submissionDate: new Date().toISOString().split('T')[0]
})

// 복지비 지급 확인서 데이터
export interface WelfarePaymentData {
  // 신청자 정보
  employeeName: string
  birthDate: string
  phone: string

  // 회사 정보
  clinicName: string

  // 지급 정보
  paymentMethod: 'cash' | 'transfer' | 'hospital_card'
  accountNumber?: string
  accountHolder?: string
  bankName?: string
  paymentDate: string
  requestDate: string
  paymentAmount: string

  // 지급 사유
  paymentReason: string

  // 서명
  applicantSignature?: string
  confirmSignature?: string
}

// 기본 복지비 지급 확인서 데이터
export const getDefaultWelfarePaymentData = (
  clinicName?: string
): WelfarePaymentData => ({
  employeeName: '',
  birthDate: '',
  phone: '',
  clinicName: clinicName || '',
  paymentMethod: 'transfer',
  accountNumber: '',
  accountHolder: '',
  bankName: '',
  paymentDate: '',
  requestDate: new Date().toISOString().split('T')[0],
  paymentAmount: '',
  paymentReason: '해당 직원의 업무 기여도 및 향후 업무증진을 위해 운동비 등'
})
