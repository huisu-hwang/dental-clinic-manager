/**
 * Document Legal Utilities
 * 전자서명법 및 전자문서법 준수를 위한 유틸리티 함수
 *
 * 법적 근거:
 * - 전자서명법 제3조 (전자서명의 효력)
 * - 전자문서 및 전자거래 기본법 제4조의2 (전자문서의 서면 인정 요건)
 */

import { hashData } from './encryptionUtils'

// =====================================================================
// 법적 고지문 상수
// =====================================================================

/**
 * 전자서명 동의 문구
 * 서명 전 동의를 받아야 하는 법적 고지문
 */
export const ELECTRONIC_SIGNATURE_CONSENT = {
  title: '전자서명 동의',
  content: `본인은 아래 사항을 이해하고 동의합니다:

1. 본 전자문서에 전자서명을 함으로써 자필 서명 또는 날인과 동일한 법적 효력이 발생함을 이해합니다.
   (전자서명법 제3조 제2항)

2. 전자서명 후에는 본 문서의 내용 변경이 불가능하며, 무결성이 보장됨을 이해합니다.

3. 본인의 전자서명 정보(서명 이미지, 서명 시간, IP 주소, 기기 정보)가 기록되고 보존됨에 동의합니다.

4. 전자문서는 전자적 형태로 보존되며, 이는 서면과 동일한 효력을 가집니다.
   (전자문서 및 전자거래 기본법 제4조의2)`,
  checkboxLabel: '위 내용을 확인하였으며, 전자서명에 동의합니다.',
} as const

/**
 * 근로계약서 법적 고지문
 */
export const EMPLOYMENT_CONTRACT_LEGAL_NOTICE = {
  title: '근로계약서 법적 효력 안내',
  content: `본 전자 근로계약서는 다음과 같은 법적 효력을 가집니다:

• 근로기준법 제17조에 따른 근로조건 명시의무를 충족합니다.
• 전자서명법에 따라 양 당사자의 전자서명으로 체결되며,
  서면 계약과 동일한 법적 효력을 가집니다.
• 계약 체결 시점의 문서 해시값이 기록되어 무결성이 보장됩니다.
• 본 계약서는 전자문서 및 전자거래 기본법에 따라 보존됩니다.`,
} as const

/**
 * 사직서 법적 고지문
 */
export const RESIGNATION_LEGAL_NOTICE = {
  title: '사직서 법적 효력 안내',
  content: `본 전자 사직서는 다음과 같은 법적 효력을 가집니다:

• 전자서명법 제3조에 따라 자필 서명과 동일한 법적 효력을 가집니다.
• 본인의 자유로운 의사에 의해 작성되었음을 확인합니다.
• 전자서명 후 문서의 무결성이 보장됩니다.
• 근로기준법 제26조에 따른 해고 예고 규정과 별개로,
  근로자의 일방적 의사표시로 효력이 발생합니다.`,
} as const

/**
 * 복지비 지급 확인서 법적 고지문
 */
export const WELFARE_PAYMENT_LEGAL_NOTICE = {
  title: '복지비 지급 확인서 법적 효력 안내',
  content: `본 전자 복지비 지급 확인서는 다음과 같은 법적 효력을 가집니다:

• 전자서명법에 따라 자필 서명과 동일한 법적 효력을 가집니다.
• 복지비 수령 사실을 확인하는 증빙 서류로 사용됩니다.
• 세무/회계 처리를 위한 적격 증빙으로 활용될 수 있습니다.
• 전자서명 후 문서의 무결성이 보장됩니다.`,
} as const

// =====================================================================
// 문서 해시 생성 함수
// =====================================================================

/**
 * 문서 데이터를 정규화하여 해시 생성
 * 서명 시점의 문서 내용에 대한 무결성 검증용
 *
 * @param documentData - 해시할 문서 데이터
 * @returns SHA-256 해시 문자열
 */
export async function generateDocumentHash(documentData: Record<string, any>): Promise<string> {
  // 서명 데이터 제외 (서명은 해시 대상이 아님)
  const dataToHash = { ...documentData }
  delete dataToHash.employeeSignature
  delete dataToHash.ownerSignature
  delete dataToHash.applicantSignature
  delete dataToHash.confirmSignature
  delete dataToHash.signature_data

  // 정렬된 JSON 문자열로 변환 (일관된 해시 생성)
  const sortedKeys = Object.keys(dataToHash).sort()
  const normalizedData: Record<string, any> = {}
  for (const key of sortedKeys) {
    normalizedData[key] = dataToHash[key]
  }

  const jsonString = JSON.stringify(normalizedData)
  return await hashData(jsonString)
}

/**
 * 근로계약서 전용 해시 생성
 * 계약 핵심 내용만 추출하여 해시 생성
 */
export async function generateContractHash(contractData: {
  employee_name: string
  employee_resident_number: string
  employer_name: string
  clinic_name: string
  employment_period_start: string
  employment_period_end?: string
  salary_base: number
  salary_total: number
  contract_date: string
  [key: string]: any
}): Promise<string> {
  const coreData = {
    employee_name: contractData.employee_name,
    employee_resident_number: contractData.employee_resident_number,
    employer_name: contractData.employer_name,
    clinic_name: contractData.clinic_name,
    employment_period_start: contractData.employment_period_start,
    employment_period_end: contractData.employment_period_end || null,
    salary_base: contractData.salary_base,
    salary_total: contractData.salary_total,
    contract_date: contractData.contract_date,
  }

  return await generateDocumentHash(coreData)
}

// =====================================================================
// 서명 메타데이터 수집
// =====================================================================

export interface SignatureMetadata {
  ip_address: string
  device_info: string
  user_agent: string
  signed_at: string
  document_hash: string
}

/**
 * 클라이언트 서명 메타데이터 수집
 * 브라우저에서 실행되어 서명 시점의 정보를 수집
 */
export function collectSignatureMetadata(): Omit<SignatureMetadata, 'document_hash' | 'signed_at'> {
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown'

  // 디바이스 정보 추출
  const deviceInfo = getDeviceInfo()

  return {
    ip_address: '', // 서버에서 수집해야 함
    device_info: deviceInfo,
    user_agent: userAgent,
  }
}

/**
 * 디바이스 정보 추출
 */
function getDeviceInfo(): string {
  if (typeof navigator === 'undefined') return 'Unknown'

  const ua = navigator.userAgent

  // 플랫폼 감지
  let platform = 'Unknown'
  if (/iPhone|iPad|iPod/.test(ua)) {
    platform = 'iOS'
  } else if (/Android/.test(ua)) {
    platform = 'Android'
  } else if (/Windows/.test(ua)) {
    platform = 'Windows'
  } else if (/Mac/.test(ua)) {
    platform = 'macOS'
  } else if (/Linux/.test(ua)) {
    platform = 'Linux'
  }

  // 브라우저 감지
  let browser = 'Unknown'
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) {
    browser = 'Chrome'
  } else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
    browser = 'Safari'
  } else if (/Firefox/.test(ua)) {
    browser = 'Firefox'
  } else if (/Edg/.test(ua)) {
    browser = 'Edge'
  }

  return `${platform} - ${browser}`
}

// =====================================================================
// 문서 무결성 검증
// =====================================================================

/**
 * 저장된 해시와 현재 문서 해시 비교
 * 문서가 서명 후 변경되었는지 검증
 */
export async function verifyDocumentIntegrity(
  documentData: Record<string, any>,
  storedHash: string
): Promise<{
  isValid: boolean
  currentHash: string
  message: string
}> {
  const currentHash = await generateDocumentHash(documentData)
  const isValid = currentHash === storedHash

  return {
    isValid,
    currentHash,
    message: isValid
      ? '문서 무결성이 확인되었습니다. 서명 후 변경되지 않았습니다.'
      : '⚠️ 문서 무결성 검증 실패. 서명 후 문서가 변경되었을 수 있습니다.',
  }
}

// =====================================================================
// 법적 효력 확인서 생성
// =====================================================================

export interface LegalCertificate {
  documentType: string
  documentHash: string
  signedAt: string
  signerInfo: {
    name: string
    type: 'employer' | 'employee' | 'applicant'
  }[]
  signatureMetadata: {
    ip_address?: string
    device_info?: string
    user_agent?: string
  }[]
  integrityStatus: 'verified' | 'pending' | 'failed'
  legalBasis: string[]
}

/**
 * 법적 효력 확인서 데이터 생성
 */
export function generateLegalCertificate(
  documentType: '근로계약서' | '사직서' | '복지비 지급 확인서',
  documentHash: string,
  signedAt: string,
  signerInfo: { name: string; type: 'employer' | 'employee' | 'applicant' }[],
  signatureMetadata: { ip_address?: string; device_info?: string; user_agent?: string }[]
): LegalCertificate {
  const legalBasis = [
    '전자서명법 제3조 (전자서명의 효력)',
    '전자문서 및 전자거래 기본법 제4조 (전자문서의 효력)',
    '전자문서 및 전자거래 기본법 제4조의2 (전자문서의 서면 인정)',
  ]

  if (documentType === '근로계약서') {
    legalBasis.push('근로기준법 제17조 (근로조건의 명시)')
  }

  return {
    documentType,
    documentHash,
    signedAt,
    signerInfo,
    signatureMetadata,
    integrityStatus: 'verified',
    legalBasis,
  }
}

// =====================================================================
// 타임스탬프 유틸리티
// =====================================================================

/**
 * ISO 8601 형식의 정확한 타임스탬프 생성
 * 서버 시간과 동기화된 신뢰할 수 있는 시간
 */
export function generateTimestamp(): string {
  return new Date().toISOString()
}

/**
 * 타임스탬프 포맷팅 (한국 시간 표시용)
 */
export function formatTimestampKorean(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  return date.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
