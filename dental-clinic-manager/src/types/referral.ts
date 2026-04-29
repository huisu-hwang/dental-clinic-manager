// ========================================
// 소개환자 관리 타입 정의
// Patient Referral Management Types
// ========================================

export interface PatientReferral {
  id: string
  clinic_id: string
  referrer_dentweb_patient_id: string
  referee_dentweb_patient_id: string
  referred_at: string
  note: string | null
  first_paid_at: string | null
  first_paid_amount: number | null
  thanks_sms_sent_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface PatientReferralWithPatients extends PatientReferral {
  referrer: {
    id: string
    patient_name: string
    chart_number: string | null
    phone_number: string | null
  } | null
  referee: {
    id: string
    patient_name: string
    chart_number: string | null
    phone_number: string | null
    registration_date: string | null
  } | null
  reward_summary?: {
    referrer_points: number
    referee_points: number
    referrer_gift_count: number
    referee_gift_count: number
  }
}

export type PointReason =
  | 'referral_reward'
  | 'referral_welcome'
  | 'manual_add'
  | 'manual_use'
  | 'expired'

export interface PatientPoint {
  id: string
  clinic_id: string
  dentweb_patient_id: string
  delta: number
  reason: PointReason
  referral_id: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface PatientPointBalance {
  clinic_id: string
  dentweb_patient_id: string
  balance: number
  last_transaction_at: string | null
}

export interface ReferralSettings {
  clinic_id: string
  referrer_default_points: number
  referee_default_points: number
  auto_thanks_enabled: boolean
  auto_thanks_after_days: number
  thanks_template_id: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface ReferralSmsLog {
  id: string
  clinic_id: string
  referral_id: string | null
  recipient_dentweb_patient_id: string
  phone_number: string
  message_content: string
  message_type: 'SMS' | 'LMS' | 'MMS' | null
  status: 'sent' | 'failed'
  aligo_msg_id: string | null
  error_message: string | null
  sent_by: string | null
  sent_at: string
}

export interface ReferralListFilters {
  search?: string
  referrerId?: string
  startDate?: string
  endDate?: string
  thanksSent?: boolean
  page?: number
  pageSize?: number
}

export interface ReferralListResponse {
  rows: PatientReferralWithPatients[]
  total: number
  page: number
  pageSize: number
}

export interface ReferralKpi {
  monthly_count: number
  monthly_count_prev: number
  top_referrer: {
    dentweb_patient_id: string
    patient_name: string
    referral_count: number
  } | null
  conversion_rate: number
  pending_link_count: number
}

export interface PatientSearchResult {
  id: string
  patient_name: string
  chart_number: string | null
  phone_number: string | null
  birth_date: string | null
  acquisition_channel: string | null
  registration_date: string | null
}

export interface FamilyCandidateMember {
  id: string
  patient_name: string
  birth_date: string | null
  chart_number: string | null
  gender: string | null
}

export interface FamilyCandidate {
  group_key: string
  member_count: number
  members: FamilyCandidateMember[]
}

export interface ConfirmedFamily {
  id: string
  family_name: string
  created_at: string
  members: Array<FamilyCandidateMember & { relation_label: string | null }>
}

export interface MonthlyStatRow {
  year_month: string
  referral_count: number
  paid_count: number
}
