// 단체 문자 발송 핵심 서비스
// - 환자 조회(DentWeb + 필터 + 리콜 제외 환자 매칭)
// - 변수 치환
// - 발송 실행 (즉시·예약 공용)
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { aligoFetch } from '@/lib/aligoFetch'
import type {
  BulkSmsFilter,
  BulkSmsEligiblePatient,
  BulkSmsEligibleResponse,
  BulkSmsCampaign,
} from '@/types/bulkSms'

const ALIGO_API_URL = 'https://apis.aligo.in'
const ALIGO_BATCH_SIZE = 1000  // 알리고 단일 호출 최대 수신자 수
const SMS_BYTE_LIMIT = 90      // 90바이트 초과 시 LMS

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  return String(phone).replace(/[^0-9]/g, '')
}

export function calculateAge(birthDate: string | null | undefined, today: Date = new Date()): number | null {
  if (!birthDate) return null
  const b = new Date(birthDate)
  if (isNaN(b.getTime())) return null
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return age
}

export function applyVariables(
  template: string,
  vars: { patientName?: string; clinicName?: string; clinicPhone?: string }
): string {
  let out = template
  if (vars.patientName) out = out.replace(/\{환자명\}/g, vars.patientName)
  if (vars.clinicName !== undefined) out = out.replace(/\{병원명\}/g, vars.clinicName)
  if (vars.clinicPhone !== undefined) out = out.replace(/\{전화번호\}/g, vars.clinicPhone)
  return out
}

export function determineMsgType(message: string): 'SMS' | 'LMS' {
  const bytes = new TextEncoder().encode(message).length
  return bytes > SMS_BYTE_LIMIT ? 'LMS' : 'SMS'
}

// 제외 룰 매칭 (전화번호 > 차트번호 > 이름 우선)
export interface ExcludeRule {
  phone_number: string | null
  patient_name: string | null
  chart_number: string | null
}

export function isExcluded(
  patient: { phone_number: string; patient_name: string; chart_number: string | null },
  rules: ExcludeRule[]
): boolean {
  const pPhone = normalizePhone(patient.phone_number)
  const pName = (patient.patient_name || '').trim()
  const pChart = (patient.chart_number || '').trim()

  for (const r of rules) {
    if (r.phone_number && normalizePhone(r.phone_number) === pPhone && pPhone) return true
    if (r.chart_number && r.chart_number.trim() === pChart && pChart) return true
    // 이름만 매칭은 다른 키가 NULL일 때만(동명이인 위험 회피)
    if (r.patient_name && !r.phone_number && !r.chart_number) {
      if (r.patient_name.trim() === pName && pName) return true
    }
  }
  return false
}

// 발송 대상 환자 조회 (DentWeb + 필터 + 리콜 제외 적용)
export async function getEligiblePatients(
  supabase: SupabaseClient,
  clinicId: string,
  filter: BulkSmsFilter,
  excludeRecallExcluded: boolean
): Promise<BulkSmsEligibleResponse> {
  let q = supabase
    .from('dentweb_patients')
    .select('id, patient_name, phone_number, chart_number, birth_date, gender, last_visit_date, last_treatment_type, next_appointment_date, is_active')
    .eq('clinic_id', clinicId)

  if (filter.activeOnly !== false) q = q.eq('is_active', true)
  if (filter.gender && filter.gender !== 'all') {
    const g = filter.gender === 'male' ? 'M' : 'F'
    q = q.eq('gender', g)
  }
  if (filter.lastVisitFrom) q = q.gte('last_visit_date', filter.lastVisitFrom)
  if (filter.lastVisitTo) q = q.lte('last_visit_date', filter.lastVisitTo)
  if (filter.lastTreatmentTypes && filter.lastTreatmentTypes.length > 0) {
    q = q.in('last_treatment_type', filter.lastTreatmentTypes)
  }
  if (filter.hasNextAppointment === true) q = q.not('next_appointment_date', 'is', null)
  if (filter.hasNextAppointment === false) q = q.is('next_appointment_date', null)
  if (filter.searchKeyword && filter.searchKeyword.trim()) {
    const kw = filter.searchKeyword.trim()
    q = q.or(`patient_name.ilike.%${kw}%,chart_number.ilike.%${kw}%`)
  }

  const { data, error } = await q.limit(5000)
  if (error) throw new Error(`환자 조회 실패: ${error.message}`)

  const today = new Date()
  let rows = (data ?? []) as Array<{
    id: string; patient_name: string; phone_number: string | null; chart_number: string | null;
    birth_date: string | null; gender: string | null;
    last_visit_date: string | null; last_treatment_type: string | null;
    next_appointment_date: string | null; is_active: boolean;
  }>

  // 나이 필터
  if (filter.ageMin != null || filter.ageMax != null) {
    rows = rows.filter(r => {
      const age = calculateAge(r.birth_date, today)
      if (age == null) return false
      if (filter.ageMin != null && age < filter.ageMin) return false
      if (filter.ageMax != null && age > filter.ageMax) return false
      return true
    })
  }

  // 생일 월 필터
  if (filter.birthMonths && filter.birthMonths.length > 0) {
    const months = new Set(filter.birthMonths)
    rows = rows.filter(r => {
      if (!r.birth_date) return false
      const m = new Date(r.birth_date).getMonth() + 1
      return months.has(m)
    })
  }

  // 전화번호 없는 환자 제외
  const beforeNoPhone = rows.length
  rows = rows.filter(r => !!r.phone_number && normalizePhone(r.phone_number).length >= 9)
  const noPhoneCount = beforeNoPhone - rows.length

  // 리콜 제외 환자 제거
  let excludedCount = 0
  if (excludeRecallExcluded) {
    const rules = await fetchExcludeRules(supabase, clinicId)
    const before = rows.length
    rows = rows.filter(r => !isExcluded({
      phone_number: r.phone_number!,
      patient_name: r.patient_name,
      chart_number: r.chart_number
    }, rules))
    excludedCount = before - rows.length
  }

  const patients: BulkSmsEligiblePatient[] = rows.map(r => ({
    dentweb_patient_id: r.id,
    patient_name: r.patient_name,
    phone_number: r.phone_number!,
    chart_number: r.chart_number,
    birth_date: r.birth_date,
    gender: r.gender,
    last_visit_date: r.last_visit_date,
    last_treatment_type: r.last_treatment_type,
    next_appointment_date: r.next_appointment_date,
  }))

  return { patients, total: patients.length, excluded_count: excludedCount, no_phone_count: noPhoneCount }
}

// 제외 룰 수집: recall_patients(exclude_reason IS NOT NULL) + recall_exclude_rules(is_active=true)
async function fetchExcludeRules(supabase: SupabaseClient, clinicId: string): Promise<ExcludeRule[]> {
  const [{ data: rp }, { data: rer }] = await Promise.all([
    supabase
      .from('recall_patients')
      .select('phone_number, patient_name, chart_number')
      .eq('clinic_id', clinicId)
      .not('exclude_reason', 'is', null),
    supabase
      .from('recall_exclude_rules')
      .select('phone_number, patient_name, chart_number')
      .eq('clinic_id', clinicId)
      .eq('is_active', true),
  ])
  const rules: ExcludeRule[] = []
  ;(rp ?? []).forEach((r: { phone_number: string | null; patient_name: string | null; chart_number: string | null }) => rules.push(r))
  ;(rer ?? []).forEach((r: { phone_number: string | null; patient_name: string | null; chart_number: string | null }) => rules.push(r))
  return rules
}

// 알리고 발송 결과
export interface AligoSendResult {
  ok: boolean
  msg_id?: string
  success_cnt: number
  error_cnt: number
  error?: string
}

// 단일 호출 (수신자 콤마 결합 — 최대 1,000명, 동일 본문)
export async function sendBatch(params: {
  apiKey: string
  userId: string
  sender: string
  receivers: string[]
  message: string
  msgType: 'SMS' | 'LMS'
  title?: string
}): Promise<AligoSendResult> {
  const body = new URLSearchParams()
  body.append('key', params.apiKey)
  body.append('user_id', params.userId)
  body.append('sender', params.sender)
  body.append('receiver', params.receivers.join(','))
  body.append('msg', params.message)
  body.append('msg_type', params.msgType)
  if (params.title && params.msgType !== 'SMS') body.append('title', params.title)

  try {
    const res = await aligoFetch(`${ALIGO_API_URL}/send/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    const json = await res.json() as { result_code: string | number; message?: string; msg_id?: string; success_cnt?: number; error_cnt?: number }
    const ok = String(json.result_code) === '1'
    return {
      ok,
      msg_id: json.msg_id,
      success_cnt: json.success_cnt ?? (ok ? params.receivers.length : 0),
      error_cnt: json.error_cnt ?? (ok ? 0 : params.receivers.length),
      error: ok ? undefined : (json.message || 'aligo error'),
    }
  } catch (e) {
    return { ok: false, success_cnt: 0, error_cnt: params.receivers.length, error: (e as Error).message }
  }
}

export { ALIGO_BATCH_SIZE, SMS_BYTE_LIMIT }
