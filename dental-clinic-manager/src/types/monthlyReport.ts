// ========================================
// 월간 성과 보고서 타입 정의
// ========================================

export type AgeGroupKey =
  | 'under_10'
  | 'teens'
  | 'twenties'
  | 'thirties'
  | 'forties'
  | 'fifties'
  | 'sixties_plus'
  | 'unknown'

export const AGE_GROUP_LABELS: Record<AgeGroupKey, string> = {
  under_10: '10세 미만',
  teens: '10대',
  twenties: '20대',
  thirties: '30대',
  forties: '40대',
  fifties: '50대',
  sixties_plus: '60대+',
  unknown: '미상',
}

export const AGE_GROUP_ORDER: AgeGroupKey[] = [
  'under_10',
  'teens',
  'twenties',
  'thirties',
  'forties',
  'fifties',
  'sixties_plus',
  'unknown',
]

export const AGE_GROUP_COLORS: Record<AgeGroupKey, string> = {
  under_10: '#a78bfa',
  teens: '#60a5fa',
  twenties: '#34d399',
  thirties: '#fbbf24',
  forties: '#fb923c',
  fifties: '#f87171',
  sixties_plus: '#c084fc',
  unknown: '#9ca3af',
}

export interface MonthlyRevenuePoint {
  year: number
  month: number
  total_revenue: number
  insurance_revenue: number
  non_insurance_revenue: number
  other_revenue: number
}

export interface MonthlyNewPatientPoint {
  year: number
  month: number
  count: number
}

export interface ChannelBreakdown {
  [channel: string]: number
}

export interface MonthlyChannelPoint {
  year: number
  month: number
  channels: ChannelBreakdown
  total: number
}

export type AgeGroupBreakdown = {
  [K in AgeGroupKey]: number
}

export interface MonthlyAgeGroupPoint {
  year: number
  month: number
  groups: AgeGroupBreakdown
  total: number
  avg_age: number | null
}

export interface MonthlyReportSummary {
  target_year: number
  target_month: number
  total_revenue: number
  total_revenue_mom_pct: number | null
  total_revenue_yoy_pct: number | null
  new_patient_count: number
  new_patient_mom_pct: number | null
  new_patient_yoy_pct: number | null
  top_channel: string | null
  top_channel_pct: number | null
  avg_age: number | null
  channel_count: number
  has_revenue_data: boolean
  has_new_patient_data: boolean
  has_acquisition_channel_data: boolean
}

export interface MonthlyReport {
  id: string
  clinic_id: string
  year: number
  month: number
  revenue_data: MonthlyRevenuePoint[]
  new_patient_data: MonthlyNewPatientPoint[]
  acquisition_channel_data: MonthlyChannelPoint[]
  age_distribution_data: MonthlyAgeGroupPoint[]
  summary: MonthlyReportSummary
  generated_at: string
  generated_by: 'cron' | 'manual'
  created_at: string
  updated_at: string
}

export interface MonthlyReportListItem {
  id: string
  year: number
  month: number
  generated_at: string
  generated_by: 'cron' | 'manual'
}

/**
 * 등록일 시점의 만 나이로 연령대 분류.
 * birth_date가 null/이상치면 'unknown' 반환.
 */
export function classifyAgeGroup(
  birthDate: string | null | undefined,
  referenceDate: string | Date,
): AgeGroupKey {
  if (!birthDate) return 'unknown'
  try {
    const ref = typeof referenceDate === 'string' ? new Date(referenceDate) : referenceDate
    const birth = new Date(birthDate)
    if (isNaN(birth.getTime()) || isNaN(ref.getTime())) return 'unknown'
    const ageMs = ref.getTime() - birth.getTime()
    if (ageMs < 0) return 'unknown'
    const ageYears = Math.floor(ageMs / (1000 * 60 * 60 * 24 * 365.25))
    if (ageYears < 0 || ageYears > 130) return 'unknown'
    if (ageYears < 10) return 'under_10'
    if (ageYears < 20) return 'teens'
    if (ageYears < 30) return 'twenties'
    if (ageYears < 40) return 'thirties'
    if (ageYears < 50) return 'forties'
    if (ageYears < 60) return 'fifties'
    return 'sixties_plus'
  } catch {
    return 'unknown'
  }
}

export function emptyAgeGroupBreakdown(): AgeGroupBreakdown {
  return {
    under_10: 0,
    teens: 0,
    twenties: 0,
    thirties: 0,
    forties: 0,
    fifties: 0,
    sixties_plus: 0,
    unknown: 0,
  }
}

/**
 * 매월 1일 KST 기준으로 직전 달의 (year, month)를 계산.
 * 예: 2026-05-01 00:30 KST → { year: 2026, month: 4 }
 */
export function computePreviousMonthKst(now: Date = new Date()): { year: number; month: number } {
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  let year = kstNow.getUTCFullYear()
  let month = kstNow.getUTCMonth() // 0-11
  if (month === 0) {
    year -= 1
    month = 12
  }
  return { year, month }
}
