// ============================================
// 한국 공휴일 관리 서비스
// Korean Public Holiday Service
// ============================================

import { createClient } from './supabase/client'

/**
 * 공휴일 타입
 */
export interface PublicHoliday {
  date: string           // YYYY-MM-DD
  name: string           // 공휴일 이름
  type: 'fixed' | 'lunar' | 'substitute' | 'special'  // 고정/음력/대체/특별
  isSubstitute?: boolean // 대체공휴일 여부
}

/**
 * 병원 공휴일 설정
 */
export interface ClinicHolidaySettings {
  id: string
  clinic_id: string
  // 법정 공휴일 설정
  use_public_holidays: boolean          // 법정 공휴일 휴무 적용
  deduct_public_holidays: boolean       // 법정 공휴일에 연차 차감 (보통 false)
  // 대체 공휴일 설정
  use_substitute_holidays: boolean      // 대체 공휴일 휴무 적용
  deduct_substitute_holidays: boolean   // 대체 공휴일에 연차 차감
  // 병원 지정 휴무일 설정
  deduct_clinic_holidays: boolean       // 병원 지정 휴무일에 연차 차감
  created_at: string
  updated_at: string
}

/**
 * 병원 추가 법정 공휴일
 */
export interface ClinicCustomHoliday {
  id: string
  clinic_id: string
  holiday_date: string      // YYYY-MM-DD
  holiday_name: string
  description?: string
  created_at: string
  created_by?: string
}

/**
 * 기본 공휴일 설정
 */
export const DEFAULT_HOLIDAY_SETTINGS: Omit<ClinicHolidaySettings, 'id' | 'clinic_id' | 'created_at' | 'updated_at'> = {
  use_public_holidays: true,
  deduct_public_holidays: false,       // 법정 공휴일은 연차 차감 안함
  use_substitute_holidays: true,
  deduct_substitute_holidays: false,   // 대체 공휴일도 기본적으로 연차 차감 안함
  deduct_clinic_holidays: true,        // 병원 지정 휴무일은 연차 차감
}

// ============================================
// 음력 공휴일 날짜 테이블 (2020-2035)
// 설날, 추석의 양력 날짜
// ============================================
const LUNAR_HOLIDAYS: Record<number, { seollal: string[], chuseok: string[] }> = {
  2020: {
    seollal: ['2020-01-24', '2020-01-25', '2020-01-26', '2020-01-27'],  // 1/25 설날 + 전후
    chuseok: ['2020-09-30', '2020-10-01', '2020-10-02'],
  },
  2021: {
    seollal: ['2021-02-11', '2021-02-12', '2021-02-13'],
    chuseok: ['2021-09-20', '2021-09-21', '2021-09-22'],
  },
  2022: {
    seollal: ['2022-01-31', '2022-02-01', '2022-02-02'],
    chuseok: ['2022-09-09', '2022-09-10', '2022-09-11', '2022-09-12'],  // 대체공휴일
  },
  2023: {
    seollal: ['2023-01-21', '2023-01-22', '2023-01-23', '2023-01-24'],  // 대체공휴일
    chuseok: ['2023-09-28', '2023-09-29', '2023-09-30'],
  },
  2024: {
    seollal: ['2024-02-09', '2024-02-10', '2024-02-11', '2024-02-12'],  // 대체공휴일
    chuseok: ['2024-09-16', '2024-09-17', '2024-09-18'],
  },
  2025: {
    seollal: ['2025-01-28', '2025-01-29', '2025-01-30'],
    chuseok: ['2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08'],  // 대체공휴일
  },
  2026: {
    seollal: ['2026-02-16', '2026-02-17', '2026-02-18'],
    chuseok: ['2026-09-24', '2026-09-25', '2026-09-26'],
  },
  2027: {
    seollal: ['2027-02-05', '2027-02-06', '2027-02-07', '2027-02-08'],  // 대체공휴일
    chuseok: ['2027-09-14', '2027-09-15', '2027-09-16'],
  },
  2028: {
    seollal: ['2028-01-25', '2028-01-26', '2028-01-27'],
    chuseok: ['2028-10-02', '2028-10-03', '2028-10-04'],
  },
  2029: {
    seollal: ['2029-02-12', '2029-02-13', '2029-02-14'],
    chuseok: ['2029-09-21', '2029-09-22', '2029-09-23', '2029-09-24'],  // 대체공휴일
  },
  2030: {
    seollal: ['2030-02-02', '2030-02-03', '2030-02-04', '2030-02-05'],  // 대체공휴일
    chuseok: ['2030-09-11', '2030-09-12', '2030-09-13'],
  },
  2031: {
    seollal: ['2031-01-22', '2031-01-23', '2031-01-24'],
    chuseok: ['2031-09-30', '2031-10-01', '2031-10-02'],
  },
  2032: {
    seollal: ['2032-02-10', '2032-02-11', '2032-02-12'],
    chuseok: ['2032-09-18', '2032-09-19', '2032-09-20', '2032-09-21'],  // 대체공휴일
  },
  2033: {
    seollal: ['2033-01-30', '2033-01-31', '2033-02-01'],
    chuseok: ['2033-10-07', '2033-10-08', '2033-10-09'],
  },
  2034: {
    seollal: ['2034-02-18', '2034-02-19', '2034-02-20', '2034-02-21'],  // 대체공휴일
    chuseok: ['2034-09-26', '2034-09-27', '2034-09-28'],
  },
  2035: {
    seollal: ['2035-02-07', '2035-02-08', '2035-02-09'],
    chuseok: ['2035-09-15', '2035-09-16', '2035-09-17', '2035-09-18'],  // 대체공휴일
  },
}

// 부처님 오신 날 (음력 4월 8일) 양력 날짜
const BUDDHA_BIRTHDAY: Record<number, string> = {
  2020: '2020-04-30',
  2021: '2021-05-19',
  2022: '2022-05-08',
  2023: '2023-05-27',
  2024: '2024-05-15',
  2025: '2025-05-05',
  2026: '2026-05-24',
  2027: '2027-05-13',
  2028: '2028-05-02',
  2029: '2029-05-20',
  2030: '2030-05-09',
  2031: '2031-05-28',
  2032: '2032-05-16',
  2033: '2033-05-06',
  2034: '2034-05-25',
  2035: '2035-05-15',
}

/**
 * 대체공휴일 계산
 * 공휴일이 토/일요일이면 그 다음 평일을 대체공휴일로 지정
 * 2021년부터 모든 법정공휴일에 대체공휴일 적용
 */
function getSubstituteHoliday(date: string, existingHolidays: Set<string>): string | null {
  const d = new Date(date)
  const dayOfWeek = d.getDay()

  // 일요일(0) 또는 토요일(6)인 경우
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // 다음 평일 찾기
    let substituteDate = new Date(d)
    substituteDate.setDate(substituteDate.getDate() + (dayOfWeek === 0 ? 1 : 2))

    // 대체공휴일도 공휴일이면 그 다음날
    while (existingHolidays.has(formatDate(substituteDate))) {
      substituteDate.setDate(substituteDate.getDate() + 1)
    }

    return formatDate(substituteDate)
  }

  return null
}

/**
 * 날짜 포맷 (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * 연도별 한국 법정 공휴일 조회
 * @param year 연도
 * @param includeSubstitute 대체공휴일 포함 여부
 */
export function getKoreanPublicHolidays(year: number, includeSubstitute: boolean = true): PublicHoliday[] {
  const holidays: PublicHoliday[] = []
  const holidayDates = new Set<string>()

  // 1. 고정 공휴일 (양력)
  const fixedHolidays = [
    { date: `${year}-01-01`, name: '신정' },
    { date: `${year}-03-01`, name: '삼일절' },
    { date: `${year}-05-05`, name: '어린이날' },
    { date: `${year}-06-06`, name: '현충일' },
    { date: `${year}-08-15`, name: '광복절' },
    { date: `${year}-10-03`, name: '개천절' },
    { date: `${year}-10-09`, name: '한글날' },
    { date: `${year}-12-25`, name: '크리스마스' },
  ]

  for (const h of fixedHolidays) {
    holidays.push({ ...h, type: 'fixed' })
    holidayDates.add(h.date)
  }

  // 2. 음력 공휴일
  const lunarData = LUNAR_HOLIDAYS[year]
  if (lunarData) {
    // 설날 연휴
    for (const date of lunarData.seollal) {
      holidays.push({ date, name: '설날', type: 'lunar' })
      holidayDates.add(date)
    }
    // 추석 연휴
    for (const date of lunarData.chuseok) {
      holidays.push({ date, name: '추석', type: 'lunar' })
      holidayDates.add(date)
    }
  }

  // 부처님 오신 날
  const buddhaDay = BUDDHA_BIRTHDAY[year]
  if (buddhaDay) {
    holidays.push({ date: buddhaDay, name: '부처님 오신 날', type: 'lunar' })
    holidayDates.add(buddhaDay)
  }

  // 3. 대체공휴일 계산 (2021년부터 확대 적용)
  if (includeSubstitute && year >= 2021) {
    const substituteTargets = [
      ...fixedHolidays.filter(h =>
        h.name === '삼일절' ||
        h.name === '광복절' ||
        h.name === '개천절' ||
        h.name === '한글날' ||
        h.name === '어린이날' ||
        h.name === '크리스마스'  // 2023년부터
      ),
    ]

    // 부처님 오신 날도 대체공휴일 대상 (2024년부터)
    if (year >= 2024 && buddhaDay) {
      substituteTargets.push({ date: buddhaDay, name: '부처님 오신 날' })
    }

    for (const h of substituteTargets) {
      const substitute = getSubstituteHoliday(h.date, holidayDates)
      if (substitute && !holidayDates.has(substitute)) {
        holidays.push({
          date: substitute,
          name: `${h.name} 대체공휴일`,
          type: 'substitute',
          isSubstitute: true,
        })
        holidayDates.add(substitute)
      }
    }
  }

  // 날짜순 정렬
  return holidays.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 특정 월의 공휴일 조회
 * @param year 연도
 * @param month 월 (1-12)
 * @param includeSubstitute 대체공휴일 포함 여부
 */
export function getMonthlyPublicHolidays(
  year: number,
  month: number,
  includeSubstitute: boolean = true
): PublicHoliday[] {
  const allHolidays = getKoreanPublicHolidays(year, includeSubstitute)
  const monthStr = String(month).padStart(2, '0')
  const prefix = `${year}-${monthStr}`

  return allHolidays.filter(h => h.date.startsWith(prefix))
}

/**
 * 특정 날짜가 공휴일인지 확인
 * @param date 날짜 (YYYY-MM-DD 또는 Date)
 * @param includeSubstitute 대체공휴일 포함 여부
 */
export function isPublicHoliday(
  date: string | Date,
  includeSubstitute: boolean = true
): { isHoliday: boolean; holiday?: PublicHoliday } {
  const dateStr = typeof date === 'string' ? date : formatDate(date)
  const year = parseInt(dateStr.substring(0, 4))
  const holidays = getKoreanPublicHolidays(year, includeSubstitute)

  const found = holidays.find(h => h.date === dateStr)
  return {
    isHoliday: !!found,
    holiday: found,
  }
}

/**
 * 공휴일 날짜 Set 조회 (빠른 검색용)
 * @param year 연도
 * @param month 월 (옵션)
 * @param includeSubstitute 대체공휴일 포함 여부
 */
export function getPublicHolidaySet(
  year: number,
  month?: number,
  includeSubstitute: boolean = true
): Set<string> {
  const holidays = month
    ? getMonthlyPublicHolidays(year, month, includeSubstitute)
    : getKoreanPublicHolidays(year, includeSubstitute)

  return new Set(holidays.map(h => h.date))
}

// ============================================
// 병원 공휴일 설정 CRUD
// ============================================

/**
 * 병원 공휴일 설정 조회
 */
export async function getClinicHolidaySettings(
  clinicId: string
): Promise<{ success: boolean; settings?: ClinicHolidaySettings; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { data, error } = await supabase
      .from('clinic_holiday_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // 설정이 없으면 기본값 반환
        return {
          success: true,
          settings: {
            id: '',
            clinic_id: clinicId,
            ...DEFAULT_HOLIDAY_SETTINGS,
            created_at: '',
            updated_at: '',
          },
        }
      }
      return { success: false, error: error.message }
    }

    return { success: true, settings: data as ClinicHolidaySettings }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 병원 공휴일 설정 저장/업데이트
 */
export async function saveClinicHolidaySettings(
  clinicId: string,
  settings: Partial<Omit<ClinicHolidaySettings, 'id' | 'clinic_id' | 'created_at' | 'updated_at'>>
): Promise<{ success: boolean; settings?: ClinicHolidaySettings; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    // 기존 설정 확인
    const { data: existing } = await supabase
      .from('clinic_holiday_settings')
      .select('id')
      .eq('clinic_id', clinicId)
      .single()

    if (existing) {
      // 업데이트
      const { data, error } = await supabase
        .from('clinic_holiday_settings')
        .update({
          ...settings,
          updated_at: new Date().toISOString(),
        })
        .eq('clinic_id', clinicId)
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true, settings: data as ClinicHolidaySettings }
    } else {
      // 새로 생성
      const { data, error } = await supabase
        .from('clinic_holiday_settings')
        .insert({
          clinic_id: clinicId,
          ...DEFAULT_HOLIDAY_SETTINGS,
          ...settings,
        })
        .select()
        .single()

      if (error) {
        return { success: false, error: error.message }
      }
      return { success: true, settings: data as ClinicHolidaySettings }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 병원 지정 휴무일 조회
 */
export async function getClinicDesignatedHolidays(
  clinicId: string,
  year?: number,
  month?: number
): Promise<{ success: boolean; holidays?: Array<{ date: string; description: string | null }>; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    let query = supabase
      .from('clinic_holidays')
      .select('start_date, end_date, holiday_name, description')
      .eq('clinic_id', clinicId)
      .eq('holiday_type', 'company')  // 병원 지정 휴무일만
      .order('start_date')

    if (year) {
      const startOfYear = `${year}-01-01`
      const endOfYear = `${year}-12-31`
      query = query.gte('start_date', startOfYear).lte('end_date', endOfYear)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    // 날짜 범위를 개별 날짜로 펼치기
    const holidays: Array<{ date: string; description: string | null }> = []
    for (const h of data || []) {
      const start = new Date(h.start_date)
      const end = new Date(h.end_date)

      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d)

        // 월 필터링
        if (month) {
          const [, m] = dateStr.split('-')
          if (parseInt(m) !== month) continue
        }

        holidays.push({
          date: dateStr,
          description: h.holiday_name || h.description,
        })
      }
    }

    return { success: true, holidays }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 특정 월의 모든 휴무일 조회 (법정 공휴일 + 병원 지정)
 * 근태 계산에서 사용
 */
export async function getAllHolidaysForMonth(
  clinicId: string,
  year: number,
  month: number
): Promise<{
  success: boolean
  data?: {
    publicHolidays: Set<string>       // 법정 공휴일
    substituteHolidays: Set<string>   // 대체 공휴일
    clinicHolidays: Set<string>       // 병원 지정 휴무일
    allHolidays: Set<string>          // 전체 휴무일
    settings: ClinicHolidaySettings   // 설정
  }
  error?: string
}> {
  try {
    // 병원 설정 조회
    const settingsResult = await getClinicHolidaySettings(clinicId)
    if (!settingsResult.success || !settingsResult.settings) {
      return { success: false, error: settingsResult.error || '설정을 불러올 수 없습니다.' }
    }
    const settings = settingsResult.settings

    // 법정 공휴일 (대체공휴일 제외)
    const publicHolidaysArray = getMonthlyPublicHolidays(year, month, false)
    const publicHolidays = new Set(publicHolidaysArray.map(h => h.date))

    // 대체 공휴일만
    const allPublicHolidays = getMonthlyPublicHolidays(year, month, true)
    const substituteHolidays = new Set(
      allPublicHolidays
        .filter(h => h.isSubstitute || h.type === 'substitute')
        .map(h => h.date)
    )

    // 병원 지정 휴무일
    const clinicResult = await getClinicDesignatedHolidays(clinicId, year, month)
    const clinicHolidays = new Set(
      (clinicResult.holidays || []).map(h => h.date)
    )

    // 전체 휴무일 합산 (설정에 따라)
    const allHolidays = new Set<string>()

    if (settings.use_public_holidays) {
      publicHolidays.forEach(d => allHolidays.add(d))
    }

    if (settings.use_substitute_holidays) {
      substituteHolidays.forEach(d => allHolidays.add(d))
    }

    // 병원 지정 휴무일은 항상 포함
    clinicHolidays.forEach(d => allHolidays.add(d))

    return {
      success: true,
      data: {
        publicHolidays,
        substituteHolidays,
        clinicHolidays,
        allHolidays,
        settings,
      },
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// ============================================
// 병원 추가 법정 공휴일 CRUD
// ============================================

/**
 * 병원 추가 법정 공휴일 목록 조회
 */
export async function getClinicCustomHolidays(
  clinicId: string,
  year?: number
): Promise<{ success: boolean; holidays?: ClinicCustomHoliday[]; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    let query = supabase
      .from('clinic_custom_public_holidays')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('holiday_date', { ascending: true })

    if (year) {
      const startOfYear = `${year}-01-01`
      const endOfYear = `${year}-12-31`
      query = query.gte('holiday_date', startOfYear).lte('holiday_date', endOfYear)
    }

    const { data, error } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, holidays: data as ClinicCustomHoliday[] }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 병원 추가 법정 공휴일 추가
 */
export async function addClinicCustomHoliday(
  clinicId: string,
  holidayDate: string,
  holidayName: string,
  description?: string,
  createdBy?: string
): Promise<{ success: boolean; holiday?: ClinicCustomHoliday; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { data, error } = await supabase
      .from('clinic_custom_public_holidays')
      .insert({
        clinic_id: clinicId,
        holiday_date: holidayDate,
        holiday_name: holidayName,
        description: description || null,
        created_by: createdBy || null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: '이미 등록된 날짜입니다.' }
      }
      return { success: false, error: error.message }
    }

    return { success: true, holiday: data as ClinicCustomHoliday }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 병원 추가 법정 공휴일 삭제
 */
export async function deleteClinicCustomHoliday(
  holidayId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  if (!supabase) {
    return { success: false, error: 'Database connection not available' }
  }

  try {
    const { error } = await supabase
      .from('clinic_custom_public_holidays')
      .delete()
      .eq('id', holidayId)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * 병원 추가 법정 공휴일 Set 조회 (빠른 검색용)
 */
export async function getClinicCustomHolidaySet(
  clinicId: string,
  year?: number,
  month?: number
): Promise<Set<string>> {
  const result = await getClinicCustomHolidays(clinicId, year)
  if (!result.success || !result.holidays) {
    return new Set()
  }

  let holidays = result.holidays
  if (month) {
    const monthStr = String(month).padStart(2, '0')
    const prefix = year ? `${year}-${monthStr}` : `-${monthStr}-`
    holidays = holidays.filter(h =>
      year ? h.holiday_date.startsWith(prefix) : h.holiday_date.includes(prefix)
    )
  }

  return new Set(holidays.map(h => h.holiday_date))
}

export const holidayService = {
  getKoreanPublicHolidays,
  getMonthlyPublicHolidays,
  isPublicHoliday,
  getPublicHolidaySet,
  getClinicHolidaySettings,
  saveClinicHolidaySettings,
  getClinicDesignatedHolidays,
  getAllHolidaysForMonth,
  // 추가 법정 공휴일 관련
  getClinicCustomHolidays,
  addClinicCustomHoliday,
  deleteClinicCustomHoliday,
  getClinicCustomHolidaySet,
}
