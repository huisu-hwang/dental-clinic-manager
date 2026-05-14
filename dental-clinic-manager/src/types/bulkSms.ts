export type BulkSmsCampaignStatus =
  | 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'

export type BulkSmsMsgType = 'SMS' | 'LMS'

export type BulkSmsRecipientStatus = 'pending' | 'success' | 'failed'

export interface BulkSmsCampaign {
  id: string
  clinic_id: string
  created_by: string
  title: string | null
  message: string
  msg_type: BulkSmsMsgType
  total_count: number
  success_count: number
  fail_count: number
  status: BulkSmsCampaignStatus
  scheduled_at: string | null
  sent_at: string | null
  completed_at: string | null
  filter_snapshot: BulkSmsFilter | null
  exclude_recall_excluded: boolean
  created_at: string
  updated_at: string
}

export interface BulkSmsRecipient {
  id: string
  campaign_id: string
  clinic_id: string
  dentweb_patient_id: string | null
  patient_name: string | null
  phone_number: string
  personalized_message: string
  status: BulkSmsRecipientStatus
  aligo_msg_id: string | null
  error_message: string | null
  sent_at: string | null
  created_at: string
}

export interface BulkSmsTemplate {
  id: string
  clinic_id: string
  name: string
  content: string
  is_default: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

// 필터
export type BulkSmsGender = 'male' | 'female' | 'all'

export interface BulkSmsFilter {
  gender?: BulkSmsGender                    // 'all' 또는 미지정 = 전체
  ageMin?: number | null
  ageMax?: number | null
  lastVisitFrom?: string | null      // ISO date 'YYYY-MM-DD'
  lastVisitTo?: string | null
  lastTreatmentTypes?: string[]      // 다중 선택
  hasNextAppointment?: boolean | null  // null=전체, true=있음, false=없음
  birthMonths?: number[]             // 1..12 (birthToday=true 면 무시)
  birthToday?: boolean               // true 면 오늘이 생일인 환자만 (KST 기준 month/day 일치)
  searchKeyword?: string             // 이름/차트번호
  activeOnly?: boolean               // 기본 true
}

// API 응답
export interface BulkSmsEligiblePatient {
  dentweb_patient_id: string
  patient_name: string
  phone_number: string
  chart_number: string | null
  birth_date: string | null
  gender: string | null
  last_visit_date: string | null
  last_treatment_type: string | null
  next_appointment_date: string | null
}

export interface BulkSmsEligibleResponse {
  patients: BulkSmsEligiblePatient[]
  total: number
  excluded_count: number             // 리콜 제외로 빠진 환자 수
  no_phone_count: number             // 전화번호 없어 자동 제외된 수
}
