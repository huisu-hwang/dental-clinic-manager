import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  MonthlyReport,
  MonthlyRevenuePoint,
  MonthlyNewPatientPoint,
  MonthlyChannelPoint,
  MonthlyAgeGroupPoint,
  MonthlyReportSummary,
  AgeGroupBreakdown,
  ChannelBreakdown,
} from '@/types/monthlyReport'
import {
  classifyAgeGroup,
  emptyAgeGroupBreakdown,
  AGE_GROUP_ORDER,
} from '@/types/monthlyReport'

const MONTH_WINDOW = 12

/**
 * 직전 N개월 윈도우의 (year, month) 시퀀스를 오래된 순으로 반환.
 * 예: targetYear=2026, targetMonth=4, window=12 → 2025-05 ~ 2026-04
 */
function buildMonthRange(
  targetYear: number,
  targetMonth: number,
  windowSize: number = MONTH_WINDOW,
): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = []
  let y = targetYear
  let m = targetMonth
  for (let i = 0; i < windowSize; i++) {
    result.unshift({ year: y, month: m })
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  return result
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 || previous === null || previous === undefined) {
    return current > 0 ? null : null
  }
  return ((current - previous) / previous) * 100
}

function monthFirstDay(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function monthLastDay(year: number, month: number): string {
  const lastDay = new Date(year, month, 0).getDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
}

interface RevenueRow {
  year: number
  month: number
  insurance_revenue: number | string | null
  non_insurance_revenue: number | string | null
  other_revenue: number | string | null
  total_revenue: number | string | null
}

interface PatientRow {
  registration_date: string | null
  birth_date: string | null
  acquisition_channel: string | null
}

async function fetchRevenueSeries(
  supabase: SupabaseClient,
  clinicId: string,
  range: Array<{ year: number; month: number }>,
): Promise<MonthlyRevenuePoint[]> {
  if (range.length === 0) return []
  const earliest = range[0]
  const latest = range[range.length - 1]
  const { data, error } = await supabase
    .from('revenue_records')
    .select('year, month, insurance_revenue, non_insurance_revenue, other_revenue, total_revenue')
    .eq('clinic_id', clinicId)
    .or(
      `and(year.eq.${earliest.year},month.gte.${earliest.month}),` +
      `and(year.gt.${earliest.year},year.lt.${latest.year}),` +
      `and(year.eq.${latest.year},month.lte.${latest.month})`,
    )

  if (error) {
    console.error('[monthlyReportService] revenue fetch error:', error)
    return range.map((r) => emptyRevenuePoint(r.year, r.month))
  }

  const map = new Map<string, RevenueRow>()
  for (const row of (data ?? []) as RevenueRow[]) {
    map.set(`${row.year}-${row.month}`, row)
  }

  return range.map(({ year, month }) => {
    const row = map.get(`${year}-${month}`)
    if (!row) return emptyRevenuePoint(year, month)
    return {
      year,
      month,
      insurance_revenue: Number(row.insurance_revenue ?? 0),
      non_insurance_revenue: Number(row.non_insurance_revenue ?? 0),
      other_revenue: Number(row.other_revenue ?? 0),
      total_revenue: Number(row.total_revenue ?? 0),
    }
  })
}

function emptyRevenuePoint(year: number, month: number): MonthlyRevenuePoint {
  return { year, month, insurance_revenue: 0, non_insurance_revenue: 0, other_revenue: 0, total_revenue: 0 }
}

async function fetchPatientsForRange(
  supabase: SupabaseClient,
  clinicId: string,
  range: Array<{ year: number; month: number }>,
): Promise<PatientRow[]> {
  if (range.length === 0) return []
  const startDate = monthFirstDay(range[0].year, range[0].month)
  const endDate = monthLastDay(range[range.length - 1].year, range[range.length - 1].month)
  const { data, error } = await supabase
    .from('dentweb_patients')
    .select('registration_date, birth_date, acquisition_channel')
    .eq('clinic_id', clinicId)
    .not('registration_date', 'is', null)
    .gte('registration_date', startDate)
    .lte('registration_date', endDate)

  if (error) {
    console.error('[monthlyReportService] patients fetch error:', error)
    return []
  }
  return (data ?? []) as PatientRow[]
}

function bucketByMonth<T>(
  range: Array<{ year: number; month: number }>,
  rows: T[],
  getDate: (row: T) => string | null,
): Map<string, T[]> {
  const buckets = new Map<string, T[]>()
  for (const r of range) {
    buckets.set(`${r.year}-${r.month}`, [])
  }
  for (const row of rows) {
    const date = getDate(row)
    if (!date) continue
    const d = new Date(date)
    if (isNaN(d.getTime())) continue
    const y = d.getUTCFullYear()
    const m = d.getUTCMonth() + 1
    const key = `${y}-${m}`
    if (buckets.has(key)) {
      buckets.get(key)!.push(row)
    }
  }
  return buckets
}

function buildNewPatientSeries(
  range: Array<{ year: number; month: number }>,
  patients: PatientRow[],
): MonthlyNewPatientPoint[] {
  const buckets = bucketByMonth(range, patients, (p) => p.registration_date)
  return range.map(({ year, month }) => ({
    year,
    month,
    count: (buckets.get(`${year}-${month}`) ?? []).length,
  }))
}

function buildChannelSeries(
  range: Array<{ year: number; month: number }>,
  patients: PatientRow[],
): MonthlyChannelPoint[] {
  const buckets = bucketByMonth(range, patients, (p) => p.registration_date)
  return range.map(({ year, month }) => {
    const monthly = buckets.get(`${year}-${month}`) ?? []
    const channels: ChannelBreakdown = {}
    for (const p of monthly) {
      const key = (p.acquisition_channel ?? '미분류').trim() || '미분류'
      channels[key] = (channels[key] ?? 0) + 1
    }
    return { year, month, channels, total: monthly.length }
  })
}

function buildAgeSeries(
  range: Array<{ year: number; month: number }>,
  patients: PatientRow[],
): MonthlyAgeGroupPoint[] {
  const buckets = bucketByMonth(range, patients, (p) => p.registration_date)
  return range.map(({ year, month }) => {
    const monthly = buckets.get(`${year}-${month}`) ?? []
    const groups: AgeGroupBreakdown = emptyAgeGroupBreakdown()
    let ageSum = 0
    let ageCount = 0
    for (const p of monthly) {
      const ref = p.registration_date ?? `${year}-${String(month).padStart(2, '0')}-15`
      const group = classifyAgeGroup(p.birth_date, ref)
      groups[group] += 1
      if (group !== 'unknown' && p.birth_date) {
        const ageMs = new Date(ref).getTime() - new Date(p.birth_date).getTime()
        if (!isNaN(ageMs) && ageMs > 0) {
          ageSum += Math.floor(ageMs / (1000 * 60 * 60 * 24 * 365.25))
          ageCount += 1
        }
      }
    }
    return {
      year,
      month,
      groups,
      total: monthly.length,
      avg_age: ageCount > 0 ? Math.round((ageSum / ageCount) * 10) / 10 : null,
    }
  })
}

function buildSummary(
  targetYear: number,
  targetMonth: number,
  revenue: MonthlyRevenuePoint[],
  newPatients: MonthlyNewPatientPoint[],
  channels: MonthlyChannelPoint[],
  ages: MonthlyAgeGroupPoint[],
): MonthlyReportSummary {
  const targetRevenue = revenue.find((r) => r.year === targetYear && r.month === targetMonth)
  const prevMonthY = targetMonth === 1 ? targetYear - 1 : targetYear
  const prevMonthM = targetMonth === 1 ? 12 : targetMonth - 1
  const prevYearY = targetYear - 1
  const prevYearM = targetMonth

  const momRevenue = revenue.find((r) => r.year === prevMonthY && r.month === prevMonthM)
  const yoyRevenue = revenue.find((r) => r.year === prevYearY && r.month === prevYearM)
  const targetNew = newPatients.find((p) => p.year === targetYear && p.month === targetMonth)
  const momNew = newPatients.find((p) => p.year === prevMonthY && p.month === prevMonthM)
  const yoyNew = newPatients.find((p) => p.year === prevYearY && p.month === prevYearM)

  const targetChannels = channels.find((c) => c.year === targetYear && c.month === targetMonth)
  let topChannel: string | null = null
  let topChannelPct: number | null = null
  let channelCount = 0
  if (targetChannels && targetChannels.total > 0) {
    const entries = Object.entries(targetChannels.channels).filter(([k]) => k !== '미분류')
    channelCount = entries.length
    if (entries.length > 0) {
      entries.sort((a, b) => b[1] - a[1])
      topChannel = entries[0][0]
      topChannelPct = (entries[0][1] / targetChannels.total) * 100
    }
  }

  const targetAge = ages.find((a) => a.year === targetYear && a.month === targetMonth)

  const totalRev = targetRevenue?.total_revenue ?? 0
  const newCount = targetNew?.count ?? 0
  const hasRevenue = revenue.some((r) => r.total_revenue > 0)
  const hasNewPatient = newPatients.some((p) => p.count > 0)
  const hasChannel = channels.some((c) =>
    Object.keys(c.channels).some((k) => k !== '미분류' && c.channels[k] > 0),
  )

  return {
    target_year: targetYear,
    target_month: targetMonth,
    total_revenue: totalRev,
    total_revenue_mom_pct: momRevenue ? pctChange(totalRev, momRevenue.total_revenue) : null,
    total_revenue_yoy_pct: yoyRevenue ? pctChange(totalRev, yoyRevenue.total_revenue) : null,
    new_patient_count: newCount,
    new_patient_mom_pct: momNew ? pctChange(newCount, momNew.count) : null,
    new_patient_yoy_pct: yoyNew ? pctChange(newCount, yoyNew.count) : null,
    top_channel: topChannel,
    top_channel_pct: topChannelPct,
    avg_age: targetAge?.avg_age ?? null,
    channel_count: channelCount,
    has_revenue_data: hasRevenue,
    has_new_patient_data: hasNewPatient,
    has_acquisition_channel_data: hasChannel,
  }
}

export interface GenerateMonthlyReportInput {
  supabase: SupabaseClient
  clinicId: string
  year: number
  month: number
  generatedBy: 'cron' | 'manual'
}

/**
 * 보고서 생성: 매출/신환/유입경로/연령대 12개월 데이터 집계 후 monthly_reports에 upsert.
 * 기존 row가 있으면 덮어쓴다.
 */
export async function generateMonthlyReport({
  supabase,
  clinicId,
  year,
  month,
  generatedBy,
}: GenerateMonthlyReportInput): Promise<MonthlyReport> {
  const range = buildMonthRange(year, month, MONTH_WINDOW)

  const [revenue, patients] = await Promise.all([
    fetchRevenueSeries(supabase, clinicId, range),
    fetchPatientsForRange(supabase, clinicId, range),
  ])

  const newPatients = buildNewPatientSeries(range, patients)
  const channels = buildChannelSeries(range, patients)
  const ages = buildAgeSeries(range, patients)
  const summary = buildSummary(year, month, revenue, newPatients, channels, ages)

  const payload = {
    clinic_id: clinicId,
    year,
    month,
    revenue_data: revenue,
    new_patient_data: newPatients,
    acquisition_channel_data: channels,
    age_distribution_data: ages,
    summary,
    generated_at: new Date().toISOString(),
    generated_by: generatedBy,
  }

  const { data, error } = await supabase
    .from('monthly_reports')
    .upsert(payload, { onConflict: 'clinic_id,year,month' })
    .select()
    .single()

  if (error || !data) {
    throw new Error(`월간 보고서 저장 실패: ${error?.message ?? 'unknown'}`)
  }

  return normalizeReport(data)
}

export async function fetchMonthlyReport(
  supabase: SupabaseClient,
  clinicId: string,
  year: number,
  month: number,
): Promise<MonthlyReport | null> {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month)
    .maybeSingle()

  if (error) {
    console.error('[monthlyReportService] fetch error:', error)
    return null
  }
  if (!data) return null
  return normalizeReport(data)
}

export async function fetchAvailableReportMonths(
  supabase: SupabaseClient,
  clinicId: string,
  limit = 24,
): Promise<Array<{ year: number; month: number; generated_at: string; generated_by: 'cron' | 'manual' }>> {
  const { data, error } = await supabase
    .from('monthly_reports')
    .select('year, month, generated_at, generated_by')
    .eq('clinic_id', clinicId)
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(limit)

  if (error || !data) return []
  return data.map((r) => ({
    year: r.year as number,
    month: r.month as number,
    generated_at: r.generated_at as string,
    generated_by: (r.generated_by as 'cron' | 'manual') ?? 'manual',
  }))
}

function normalizeReport(row: Record<string, unknown>): MonthlyReport {
  return {
    id: row.id as string,
    clinic_id: row.clinic_id as string,
    year: row.year as number,
    month: row.month as number,
    revenue_data: ensureArray<MonthlyRevenuePoint>(row.revenue_data),
    new_patient_data: ensureArray<MonthlyNewPatientPoint>(row.new_patient_data),
    acquisition_channel_data: ensureArray<MonthlyChannelPoint>(row.acquisition_channel_data),
    age_distribution_data: ensureArray<MonthlyAgeGroupPoint>(row.age_distribution_data),
    summary: (row.summary as MonthlyReportSummary) ?? defaultSummary(row.year as number, row.month as number),
    generated_at: row.generated_at as string,
    generated_by: ((row.generated_by as 'cron' | 'manual') ?? 'manual'),
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function ensureArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  return []
}

function defaultSummary(year: number, month: number): MonthlyReportSummary {
  return {
    target_year: year,
    target_month: month,
    total_revenue: 0,
    total_revenue_mom_pct: null,
    total_revenue_yoy_pct: null,
    new_patient_count: 0,
    new_patient_mom_pct: null,
    new_patient_yoy_pct: null,
    top_channel: null,
    top_channel_pct: null,
    avg_age: null,
    channel_count: 0,
    has_revenue_data: false,
    has_new_patient_data: false,
    has_acquisition_channel_data: false,
  }
}

export const _internalForTests = {
  buildMonthRange,
  buildNewPatientSeries,
  buildChannelSeries,
  buildAgeSeries,
  buildSummary,
  AGE_GROUP_ORDER,
}
