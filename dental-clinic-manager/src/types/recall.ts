// ========================================
// 환자 리콜 시스템 타입 정의
// Patient Recall System Types
// ========================================

// 환자 리콜 상태 (간소화)
export type PatientRecallStatus =
  | 'pending'              // 대기 중
  | 'sms_sent'             // 문자 발송 (자동)
  | 'appointment_made'     // 예약 완료
  | 'no_answer'            // 부재중
  | 'call_rejected'        // 통화 거부
  | 'visit_refused'        // 내원 거부
  | 'invalid_number'       // 없는 번호

// 리콜 제외 사유
export type RecallExcludeReason = 'family' | 'unfavorable'

// 수동으로 선택 가능한 상태 (문자발송 제외)
export const MANUAL_STATUS_OPTIONS: PatientRecallStatus[] = [
  'pending',
  'appointment_made',
  'no_answer',
  'call_rejected',
  'visit_refused',
  'invalid_number'
]

// 성별 타입
export type Gender = 'male' | 'female' | 'other'

// 연락 유형
export type ContactType = 'sms' | 'call'

// 캠페인 상태
export type CampaignStatus = 'active' | 'completed' | 'archived'

// ========================================
// 리콜 캠페인
// ========================================
export interface RecallCampaign {
  id: string
  clinic_id: string

  // 캠페인 정보
  name: string
  description?: string

  // 파일 업로드 정보
  original_filename?: string
  total_patients: number

  // 통계
  sms_sent_count: number
  call_attempted_count: number
  appointment_count: number

  // 상태
  status: CampaignStatus

  // 메타데이터
  created_by?: string
  created_by_name?: string
  created_at: string
  updated_at: string
}

export interface RecallCampaignFormData {
  name: string
  description?: string
}

// ========================================
// 리콜 환자
// ========================================
export interface RecallPatient {
  id: string
  clinic_id: string
  campaign_id?: string

  // 환자 정보
  patient_name: string
  phone_number: string
  chart_number?: string
  birth_date?: string        // 생년월일 추가
  gender?: Gender            // 성별 추가

  // 추가 정보
  last_visit_date?: string
  treatment_type?: string
  notes?: string

  // 리콜 제외
  exclude_reason?: RecallExcludeReason | null  // null=일반, family=친인척/가족, unfavorable=비우호적

  // 리콜 상태
  status: PatientRecallStatus
  recall_datetime?: string   // 리콜 처리 일시 (상태 변경 시 기록)

  // 예약 정보
  appointment_date?: string
  appointment_time?: string
  appointment_notes?: string

  // 연락 이력 요약
  last_contact_date?: string
  last_contact_type?: ContactType
  contact_count: number

  // 메타데이터
  created_at: string
  updated_at: string

  // 조인 데이터
  campaign?: RecallCampaign
}

// 환자 목록 업로드용 데이터 (CSV/Excel)
export interface RecallPatientUploadData {
  patient_name: string
  phone_number: string
  chart_number?: string
  birth_date?: string        // 생년월일 추가
  gender?: string            // 성별 추가
  last_visit_date?: string
  treatment_type?: string
  notes?: string
}

// 환자 폼 데이터
export interface RecallPatientFormData {
  patient_name: string
  phone_number: string
  chart_number?: string
  birth_date?: string
  gender?: Gender
  last_visit_date?: string
  treatment_type?: string
  notes?: string
  exclude_reason?: RecallExcludeReason | null
}

// ========================================
// 연락 이력
// ========================================
export interface RecallContactLog {
  id: string
  clinic_id: string
  patient_id: string
  campaign_id?: string

  // 연락 정보
  contact_type: ContactType
  contact_date: string

  // 문자 메시지 관련
  sms_content?: string
  sms_api_response?: string
  sms_message_id?: string

  // 전화 관련
  call_duration?: number
  call_result?: string

  // 결과
  result_status?: PatientRecallStatus
  result_notes?: string

  // 담당자
  contacted_by?: string
  contacted_by_name?: string

  // 메타데이터
  created_at: string

  // 조인 데이터
  patient?: RecallPatient
}

// 연락 이력 생성용 데이터
export interface RecallContactLogFormData {
  patient_id: string
  campaign_id?: string
  contact_type: ContactType
  sms_content?: string
  call_duration?: number
  call_result?: string
  result_status: PatientRecallStatus
  result_notes?: string
}

// ========================================
// 문자 템플릿
// ========================================
export interface RecallSmsTemplate {
  id: string
  clinic_id: string

  // 템플릿 정보
  name: string
  content: string  // 치환 변수: {환자명}, {병원명}, {전화번호} 등

  // 상태
  is_default: boolean
  is_active: boolean

  // 메타데이터
  created_by?: string
  created_at: string
  updated_at: string
}

export interface RecallSmsTemplateFormData {
  name: string
  content: string
  is_default?: boolean
}

// ========================================
// 알리고 API 설정
// ========================================
export interface AligoSettings {
  id: string
  clinic_id: string

  // API 설정
  api_key?: string
  user_id?: string
  sender_number?: string

  // 상태
  is_active: boolean
  last_test_date?: string
  last_test_result?: boolean

  // 메타데이터
  created_at: string
  updated_at: string
}

export interface AligoSettingsFormData {
  api_key: string
  user_id: string
  sender_number: string
}

// ========================================
// 알리고 API 요청/응답 타입
// ========================================
export interface AligoSendSmsRequest {
  receiver: string       // 수신자 번호
  msg: string           // 메시지 내용
  msg_type?: 'SMS' | 'LMS' | 'MMS'  // 메시지 타입
  title?: string        // LMS/MMS 제목
}

export interface AligoSendSmsResponse {
  result_code: string
  message: string
  msg_id?: string
  success_cnt?: number
  error_cnt?: number
}

// ========================================
// 인터넷 전화 API 설정
// ========================================
export interface VoipSettings {
  id: string
  clinic_id: string

  // 서비스 제공업체
  provider: VoipProvider

  // API 설정
  api_key?: string
  api_secret?: string
  caller_number?: string

  // 추가 설정 (업체별)
  extra_settings?: Record<string, string>

  // 상태
  is_active: boolean

  // 메타데이터
  created_at: string
  updated_at: string
}

// 지원하는 VoIP 제공업체
export type VoipProvider =
  | 'kt_bizmeka'       // KT 비즈메카
  | 'lg_uplus'         // LG U+
  | 'sk_bizring'       // SK 비즈링
  | 'samsung_voip'     // 삼성 VoIP
  | 'custom'           // 사용자 정의

export interface VoipProviderInfo {
  id: VoipProvider
  name: string
  description: string
  apiDocUrl?: string
}

export const VOIP_PROVIDERS: VoipProviderInfo[] = [
  {
    id: 'kt_bizmeka',
    name: 'KT 비즈메카',
    description: 'KT 클라우드 전화 서비스',
    apiDocUrl: 'https://www.bizmeka.com'
  },
  {
    id: 'lg_uplus',
    name: 'LG U+ 스마트오피스',
    description: 'LG U+ 클라우드 전화 서비스',
    apiDocUrl: 'https://www.uplus.co.kr'
  },
  {
    id: 'sk_bizring',
    name: 'SK 비즈링',
    description: 'SK 클라우드 전화 서비스',
    apiDocUrl: 'https://www.skbizring.com'
  },
  {
    id: 'samsung_voip',
    name: '삼성 VoIP',
    description: '삼성 IP 전화 시스템',
  },
  {
    id: 'custom',
    name: '사용자 정의',
    description: '직접 API 설정',
  }
]

// ========================================
// 상태 레이블 및 색상
// ========================================
export const RECALL_STATUS_LABELS: Record<PatientRecallStatus, string> = {
  pending: '대기중',
  sms_sent: '문자발송',
  appointment_made: '예약완료',
  no_answer: '부재중',
  call_rejected: '통화거부',
  visit_refused: '내원거부',
  invalid_number: '없는번호'
}

export const RECALL_STATUS_COLORS: Record<PatientRecallStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  sms_sent: 'bg-blue-100 text-blue-700',
  appointment_made: 'bg-green-100 text-green-700',
  no_answer: 'bg-orange-100 text-orange-700',
  call_rejected: 'bg-red-100 text-red-700',
  visit_refused: 'bg-red-100 text-red-700',
  invalid_number: 'bg-purple-100 text-purple-700'
}

export const CONTACT_TYPE_LABELS: Record<ContactType, string> = {
  sms: '문자',
  call: '전화'
}

export const GENDER_LABELS: Record<Gender, string> = {
  male: '남',
  female: '여',
  other: '기타'
}

// 리콜 제외 사유 레이블
export const EXCLUDE_REASON_LABELS: Record<RecallExcludeReason, string> = {
  family: '지인',
  unfavorable: '비우호적'
}

// 리콜 제외 사유 색상
export const EXCLUDE_REASON_COLORS: Record<RecallExcludeReason, string> = {
  family: 'bg-amber-100 text-amber-700',
  unfavorable: 'bg-rose-100 text-rose-700'
}

// ========================================
// 나이 계산 유틸리티
// ========================================
export function calculateAge(birthDate: string | undefined): number | null {
  if (!birthDate) return null

  const today = new Date()
  const birth = new Date(birthDate)

  if (isNaN(birth.getTime())) return null

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return age
}

// ========================================
// 최종 내원일 관련 타입 및 유틸리티
// ========================================

// 최종 내원일 기간 필터 프리셋
export type LastVisitPeriod =
  | 'all'           // 전체
  | '6months'       // 6개월 이상
  | '6to12months'   // 6개월~1년
  | '1to2years'     // 1년~2년
  | '2years'        // 2년 이상
  | 'custom'        // 사용자 정의
  | 'no_date'       // 내원일 없음

// 경과 개월수 계산
export function getElapsedMonths(dateStr: string): number {
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 0
  const now = new Date()
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
}

// 경과 기간 한국어 포맷 ("6개월 전", "1년 2개월 전" 등)
export function formatElapsedTime(dateStr: string): string {
  const months = getElapsedMonths(dateStr)
  if (months < 0) return '미래'
  if (months === 0) return '이번 달'
  if (months < 12) return `${months}개월 전`
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (remainingMonths === 0) return `${years}년 전`
  return `${years}년 ${remainingMonths}개월 전`
}

// ========================================
// 일괄 업로드 결과
// ========================================
export interface BulkUploadResult {
  success: boolean
  newCount: number       // 신규 등록
  updatedCount: number   // 기존 환자 업데이트
  skippedCount: number   // 건너뜀 (유효하지 않은 데이터)
  error?: string
}

// ========================================
// 필터 옵션
// ========================================
export interface RecallPatientFilters {
  status?: PatientRecallStatus | 'all'
  campaign_id?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
  showExcluded?: boolean              // true: 제외 환자만, false: 일반 환자만 (기본)
  excludeReason?: RecallExcludeReason | 'all'  // 제외 사유 필터
  lastVisitPeriod?: LastVisitPeriod   // 최종 내원일 프리셋 기간 필터
  lastVisitFrom?: string              // 사용자 정의: 시작일
  lastVisitTo?: string                // 사용자 정의: 종료일
  sortBy?: 'patient_name' | 'status' | 'last_contact_date' | 'last_visit_date'
  sortDirection?: 'asc' | 'desc'
}

// 페이지네이션 응답
export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// ========================================
// 통계
// ========================================
export interface RecallStats {
  total_patients: number
  pending_count: number
  contacted_count: number
  appointment_count: number
  rejected_count: number
  invalid_count: number
  success_rate: number  // 예약 성공률 (%)
}

// ========================================
// 디바이스 타입 (전화 걸기용)
// ========================================
export type DeviceType = 'mobile' | 'desktop' | 'tablet'

export interface CallOptions {
  deviceType: DeviceType
  useVoip: boolean
}
