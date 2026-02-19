import { createClient } from './supabase/client'
import { ensureConnection } from './supabase/connectionCheck'
import type {
  RecallCampaign,
  RecallCampaignFormData,
  RecallPatient,
  RecallPatientFormData,
  RecallPatientUploadData,
  RecallContactLog,
  RecallContactLogFormData,
  RecallSmsTemplate,
  RecallSmsTemplateFormData,
  AligoSettings,
  AligoSettingsFormData,
  PatientRecallStatus,
  RecallExcludeReason,
  RecallPatientFilters,
  RecallStats,
  ContactType,
  PaginatedResponse
} from '@/types/recall'

// ========================================
// Helper Functions
// ========================================

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object') {
    if ('message' in error && typeof (error as any).message === 'string') {
      return (error as any).message
    }
  }
  return 'Unknown error occurred'
}

// 현재 로그인한 사용자의 clinic_id를 가져오는 헬퍼 함수
async function getCurrentClinicId(): Promise<string | null> {
  try {
    if (typeof window !== 'undefined') {
      const cachedUser = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
      if (cachedUser) {
        try {
          const userData = JSON.parse(cachedUser)
          if (userData.clinic_id) {
            return userData.clinic_id
          }
        } catch (e) {
          console.warn('[recallService] Failed to parse cached user data:', e)
        }
      }
    }

    const supabase = await ensureConnection()
    if (!supabase) return null

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return null

    const { data } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', userData.user.id)
      .single()

    return data?.clinic_id || null
  } catch (error) {
    console.error('[recallService] Error getting clinic id:', error)
    return null
  }
}

// 현재 로그인한 사용자 정보 가져오기
async function getCurrentUser(): Promise<{ id: string; name: string } | null> {
  try {
    if (typeof window !== 'undefined') {
      const cachedUser = sessionStorage.getItem('dental_user') || localStorage.getItem('dental_user')
      if (cachedUser) {
        try {
          const userData = JSON.parse(cachedUser)
          if (userData.id && userData.name) {
            return { id: userData.id, name: userData.name }
          }
        } catch (e) {
          console.warn('[recallService] Failed to parse cached user data:', e)
        }
      }
    }

    const supabase = await ensureConnection()
    if (!supabase) return null

    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) return null

    const { data } = await supabase
      .from('users')
      .select('id, name')
      .eq('id', userData.user.id)
      .single()

    return data ? { id: data.id, name: data.name } : null
  } catch (error) {
    console.error('[recallService] Error getting current user:', error)
    return null
  }
}

// 최종 내원일 필터 적용 헬퍼 함수
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyLastVisitFilter(
  query: any,
  filters?: RecallPatientFilters
): any {
  if (!filters?.lastVisitPeriod || filters.lastVisitPeriod === 'all') return query

  const now = new Date()

  if (filters.lastVisitPeriod === 'no_date') {
    return query.is('last_visit_date', null)
  }

  if (filters.lastVisitPeriod === 'custom') {
    if (filters.lastVisitFrom) {
      query = query.gte('last_visit_date', filters.lastVisitFrom)
    }
    if (filters.lastVisitTo) {
      query = query.lte('last_visit_date', filters.lastVisitTo)
    }
    return query
  }

  // 프리셋 기간 필터 - last_visit_date가 null이 아닌 것만
  query = query.not('last_visit_date', 'is', null)

  if (filters.lastVisitPeriod === '6months') {
    // 6개월 이상 경과
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
    query = query.lte('last_visit_date', sixMonthsAgo.toISOString().split('T')[0])
  } else if (filters.lastVisitPeriod === '6to12months') {
    // 6개월~1년
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    query = query.lte('last_visit_date', sixMonthsAgo.toISOString().split('T')[0])
    query = query.gte('last_visit_date', oneYearAgo.toISOString().split('T')[0])
  } else if (filters.lastVisitPeriod === '1to2years') {
    // 1년~2년
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())
    query = query.lt('last_visit_date', oneYearAgo.toISOString().split('T')[0])
    query = query.gte('last_visit_date', twoYearsAgo.toISOString().split('T')[0])
  } else if (filters.lastVisitPeriod === '2years') {
    // 2년 이상
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate())
    query = query.lt('last_visit_date', twoYearsAgo.toISOString().split('T')[0])
  }

  return query
}

// ========================================
// Recall Campaign Service
// ========================================

export const recallCampaignService = {
  // 캠페인 목록 조회
  async getCampaigns(status?: string): Promise<{ success: boolean; data?: RecallCampaign[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      let query = supabase
        .from('recall_campaigns')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })

      if (status && status !== 'all') {
        query = query.eq('status', status)
      }

      const { data, error } = await query

      if (error) throw error
      return { success: true, data: data as RecallCampaign[] }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 캠페인 상세 조회
  async getCampaignById(id: string): Promise<{ success: boolean; data?: RecallCampaign; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { data, error } = await supabase
        .from('recall_campaigns')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      return { success: true, data: data as RecallCampaign }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 캠페인 생성
  async createCampaign(formData: RecallCampaignFormData): Promise<{ success: boolean; data?: RecallCampaign; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    const currentUser = await getCurrentUser()

    try {
      const { data, error } = await supabase
        .from('recall_campaigns')
        .insert([{
          ...formData,
          clinic_id: clinicId,
          created_by: currentUser?.id
        }])
        .select()
        .single()

      if (error) throw error
      return { success: true, data: data as RecallCampaign }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 캠페인 수정
  async updateCampaign(id: string, updates: Partial<RecallCampaign>): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_campaigns')
        .update(updates)
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 캠페인 삭제
  async deleteCampaign(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_campaigns')
        .delete()
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 캠페인 통계 업데이트
  async updateCampaignStats(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      // 환자 통계 계산
      const { data: patients } = await supabase
        .from('recall_patients')
        .select('status')
        .eq('campaign_id', id)

      if (!patients) return { success: true }

      const patientList = patients as { status: string }[]
      const stats = {
        total_patients: patientList.length,
        sms_sent_count: patientList.filter(p => ['sms_sent', 'appointment_made', 'call_attempted', 'completed'].includes(p.status)).length,
        call_attempted_count: patientList.filter(p => ['call_attempted', 'appointment_made', 'call_rejected', 'visit_refused', 'no_answer', 'callback_requested', 'completed'].includes(p.status)).length,
        appointment_count: patientList.filter(p => ['appointment_made', 'completed'].includes(p.status)).length
      }

      const { error } = await supabase
        .from('recall_campaigns')
        .update(stats)
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// Recall Patient Service
// ========================================

export const recallPatientService = {
  // 환자 목록 조회 (페이지네이션 지원)
  async getPatients(filters?: RecallPatientFilters): Promise<{
    success: boolean;
    data?: PaginatedResponse<RecallPatient>;
    error?: string
  }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    const page = filters?.page || 1
    const pageSize = filters?.pageSize || 20
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    try {
      // 먼저 총 개수 조회
      let countQuery = supabase
        .from('recall_patients')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)

      // 필터 적용 (count 쿼리)
      if (filters?.campaign_id) {
        countQuery = countQuery.eq('campaign_id', filters.campaign_id)
      }
      if (filters?.status && filters.status !== 'all') {
        countQuery = countQuery.eq('status', filters.status)
      }
      if (filters?.search) {
        countQuery = countQuery.or(`patient_name.ilike.%${filters.search}%,phone_number.ilike.%${filters.search}%,chart_number.ilike.%${filters.search}%`)
      }
      if (filters?.dateFrom) {
        countQuery = countQuery.gte('created_at', filters.dateFrom)
      }
      if (filters?.dateTo) {
        countQuery = countQuery.lte('created_at', filters.dateTo)
      }
      // 제외 환자 필터링
      if (filters?.showExcluded) {
        // 제외된 환자만 보기
        countQuery = countQuery.not('exclude_reason', 'is', null)
        if (filters?.excludeReason && filters.excludeReason !== 'all') {
          countQuery = countQuery.eq('exclude_reason', filters.excludeReason)
        }
      } else {
        // 기본: 제외되지 않은 환자만 보기
        countQuery = countQuery.is('exclude_reason', null)
      }

      // 최종 내원일 필터 (count 쿼리)
      countQuery = applyLastVisitFilter(countQuery, filters)

      const { count, error: countError } = await countQuery
      if (countError) throw countError

      const total = count || 0
      const totalPages = Math.ceil(total / pageSize)

      // 정렬 설정
      const sortBy = filters?.sortBy || 'created_at'
      const sortAsc = filters?.sortDirection === 'asc'

      // 데이터 조회 (페이지네이션)
      let dataQuery = supabase
        .from('recall_patients')
        .select('*, campaign:recall_campaigns(*)')
        .eq('clinic_id', clinicId)
        .order(sortBy, { ascending: sortAsc, nullsFirst: false })
        .range(from, to)

      // 필터 적용 (data 쿼리)
      if (filters?.campaign_id) {
        dataQuery = dataQuery.eq('campaign_id', filters.campaign_id)
      }
      if (filters?.status && filters.status !== 'all') {
        dataQuery = dataQuery.eq('status', filters.status)
      }
      if (filters?.search) {
        dataQuery = dataQuery.or(`patient_name.ilike.%${filters.search}%,phone_number.ilike.%${filters.search}%,chart_number.ilike.%${filters.search}%`)
      }
      if (filters?.dateFrom) {
        dataQuery = dataQuery.gte('created_at', filters.dateFrom)
      }
      if (filters?.dateTo) {
        dataQuery = dataQuery.lte('created_at', filters.dateTo)
      }
      // 제외 환자 필터링
      if (filters?.showExcluded) {
        dataQuery = dataQuery.not('exclude_reason', 'is', null)
        if (filters?.excludeReason && filters.excludeReason !== 'all') {
          dataQuery = dataQuery.eq('exclude_reason', filters.excludeReason)
        }
      } else {
        dataQuery = dataQuery.is('exclude_reason', null)
      }

      // 최종 내원일 필터 (data 쿼리)
      dataQuery = applyLastVisitFilter(dataQuery, filters)

      const { data, error } = await dataQuery

      if (error) throw error

      return {
        success: true,
        data: {
          data: data as RecallPatient[],
          total,
          page,
          pageSize,
          totalPages
        }
      }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 단일 환자 조회
  async getPatientById(id: string): Promise<{ success: boolean; data?: RecallPatient; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { data, error } = await supabase
        .from('recall_patients')
        .select('*, campaign:recall_campaigns(*)')
        .eq('id', id)
        .single()

      if (error) throw error
      return { success: true, data: data as RecallPatient }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 환자 추가 (단일)
  async addPatient(formData: RecallPatientFormData, campaignId?: string): Promise<{ success: boolean; data?: RecallPatient; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      const { data, error } = await supabase
        .from('recall_patients')
        .insert([{
          ...formData,
          clinic_id: clinicId,
          campaign_id: campaignId
        }])
        .select()
        .single()

      if (error) throw error

      // 캠페인 통계 업데이트
      if (campaignId) {
        await recallCampaignService.updateCampaignStats(campaignId)
      }

      return { success: true, data: data as RecallPatient }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 환자 일괄 추가 (파일 업로드)
  async addPatientsBulk(
    patients: RecallPatientUploadData[],
    campaignId: string,
    filename?: string
  ): Promise<{ success: boolean; insertedCount?: number; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      // 환자 데이터 준비
      const patientRecords = patients.map(p => ({
        ...p,
        clinic_id: clinicId,
        campaign_id: campaignId,
        status: 'pending' as PatientRecallStatus
      }))

      // 일괄 삽입
      const { data, error } = await supabase
        .from('recall_patients')
        .insert(patientRecords)
        .select()

      if (error) throw error

      // 캠페인 업데이트
      await supabase
        .from('recall_campaigns')
        .update({
          total_patients: patients.length,
          original_filename: filename
        })
        .eq('id', campaignId)

      return { success: true, insertedCount: data?.length || 0 }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 환자 정보 수정
  async updatePatient(id: string, updates: Partial<RecallPatient>): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_patients')
        .update(updates)
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 환자 상태 업데이트
  async updatePatientStatus(
    id: string,
    status: PatientRecallStatus,
    appointmentInfo?: {
      appointment_date?: string
      appointment_time?: string
      appointment_notes?: string
    }
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const updates: Partial<RecallPatient> = {
        status,
        recall_datetime: new Date().toISOString(), // 상태 변경 시 리콜 일시 기록
        ...appointmentInfo
      }

      const { error } = await supabase
        .from('recall_patients')
        .update(updates)
        .eq('id', id)

      if (error) throw error

      // 환자의 캠페인 ID 조회 및 통계 업데이트
      const { data: patient } = await supabase
        .from('recall_patients')
        .select('campaign_id')
        .eq('id', id)
        .single()

      if (patient?.campaign_id) {
        await recallCampaignService.updateCampaignStats(patient.campaign_id)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 일괄 상태 업데이트
  async updatePatientStatusBulk(ids: string[], status: PatientRecallStatus): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_patients')
        .update({
          status,
          recall_datetime: new Date().toISOString() // 상태 변경 시 리콜 일시 기록
        })
        .in('id', ids)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 환자 리콜 제외 설정/해제
  async updateExcludeReason(
    id: string,
    excludeReason: RecallExcludeReason | null
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_patients')
        .update({ exclude_reason: excludeReason })
        .eq('id', id)

      if (error) throw error

      // 캠페인 통계 업데이트
      const { data: patient } = await supabase
        .from('recall_patients')
        .select('campaign_id')
        .eq('id', id)
        .single()

      if (patient?.campaign_id) {
        await recallCampaignService.updateCampaignStats(patient.campaign_id)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 일괄 리콜 제외 설정
  async updateExcludeReasonBulk(
    ids: string[],
    excludeReason: RecallExcludeReason | null
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_patients')
        .update({ exclude_reason: excludeReason })
        .in('id', ids)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 환자 삭제
  async deletePatient(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      // 환자의 캠페인 ID 먼저 조회
      const { data: patient } = await supabase
        .from('recall_patients')
        .select('campaign_id')
        .eq('id', id)
        .single()

      const { error } = await supabase
        .from('recall_patients')
        .delete()
        .eq('id', id)

      if (error) throw error

      // 캠페인 통계 업데이트
      if (patient?.campaign_id) {
        await recallCampaignService.updateCampaignStats(patient.campaign_id)
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 오늘 활동 통계 조회 (recall_datetime 기반)
  async getTodayActivity(campaignId?: string): Promise<{
    success: boolean;
    data?: {
      totalChanges: number;
      appointmentsMade: number;
      statusChanges: { status: PatientRecallStatus; count: number }[];
      recentPatients: RecallPatient[];
    };
    error?: string
  }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    const today = new Date().toISOString().split('T')[0]

    try {
      const baseFilter = campaignId
        ? { clinic_id: clinicId, campaign_id: campaignId }
        : { clinic_id: clinicId }

      // 오늘 상태 변경된 총 환자 수
      const { count: totalChanges } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .gte('recall_datetime', `${today}T00:00:00`)
        .lte('recall_datetime', `${today}T23:59:59`)

      // 오늘 예약 완료된 환자 수
      const { count: appointmentsMade } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .eq('status', 'appointment_made')
        .gte('recall_datetime', `${today}T00:00:00`)
        .lte('recall_datetime', `${today}T23:59:59`)

      // 오늘 부재중 수
      const { count: noAnswerCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .eq('status', 'no_answer')
        .gte('recall_datetime', `${today}T00:00:00`)
        .lte('recall_datetime', `${today}T23:59:59`)

      // 오늘 통화거부 수
      const { count: callRejectedCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .eq('status', 'call_rejected')
        .gte('recall_datetime', `${today}T00:00:00`)
        .lte('recall_datetime', `${today}T23:59:59`)

      // 오늘 내원거부 수
      const { count: visitRefusedCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .eq('status', 'visit_refused')
        .gte('recall_datetime', `${today}T00:00:00`)
        .lte('recall_datetime', `${today}T23:59:59`)

      // 오늘 없는번호 수
      const { count: invalidNumberCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .eq('status', 'invalid_number')
        .gte('recall_datetime', `${today}T00:00:00`)
        .lte('recall_datetime', `${today}T23:59:59`)

      // 최근 상태 변경된 환자 목록 (최대 10명)
      let recentQuery = supabase
        .from('recall_patients')
        .select('*')
        .match(baseFilter)
        .gte('recall_datetime', `${today}T00:00:00`)
        .lte('recall_datetime', `${today}T23:59:59`)
        .order('recall_datetime', { ascending: false })
        .limit(10)

      const { data: recentPatients } = await recentQuery

      const statusChanges = [
        { status: 'appointment_made' as PatientRecallStatus, count: appointmentsMade || 0 },
        { status: 'no_answer' as PatientRecallStatus, count: noAnswerCount || 0 },
        { status: 'call_rejected' as PatientRecallStatus, count: callRejectedCount || 0 },
        { status: 'visit_refused' as PatientRecallStatus, count: visitRefusedCount || 0 },
        { status: 'invalid_number' as PatientRecallStatus, count: invalidNumberCount || 0 }
      ].filter(s => s.count > 0)

      return {
        success: true,
        data: {
          totalChanges: totalChanges || 0,
          appointmentsMade: appointmentsMade || 0,
          statusChanges,
          recentPatients: (recentPatients as RecallPatient[]) || []
        }
      }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 환자 통계 조회 (정확한 count 쿼리 사용)
  async getStats(campaignId?: string): Promise<{ success: boolean; data?: RecallStats; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      // 각 상태별로 count 쿼리 실행
      const baseFilter = campaignId
        ? { clinic_id: clinicId, campaign_id: campaignId }
        : { clinic_id: clinicId }

      // 전체 환자 수 (제외 환자 미포함)
      const { count: totalCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)

      // 대기중
      const { count: pendingCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)
        .eq('status', 'pending')

      // 문자발송
      const { count: smsSentCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)
        .eq('status', 'sms_sent')

      // 예약완료
      const { count: appointmentCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)
        .eq('status', 'appointment_made')

      // 부재중
      const { count: noAnswerCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)
        .eq('status', 'no_answer')

      // 통화거부
      const { count: callRejectedCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)
        .eq('status', 'call_rejected')

      // 내원거부
      const { count: visitRefusedCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)
        .eq('status', 'visit_refused')

      // 없는번호
      const { count: invalidCount } = await supabase
        .from('recall_patients')
        .select('*', { count: 'exact', head: true })
        .match(baseFilter)
        .is('exclude_reason', null)
        .eq('status', 'invalid_number')

      const total = totalCount || 0
      const pending = pendingCount || 0
      const appointment = appointmentCount || 0
      const contacted = (smsSentCount || 0) + appointment + (noAnswerCount || 0)
      const rejected = (callRejectedCount || 0) + (visitRefusedCount || 0)

      // 총처리 = 전체 - 대기중 (상태 변경된 환자만)
      const processed = total - pending

      const stats: RecallStats = {
        total_patients: total,
        pending_count: pending,
        contacted_count: contacted,
        appointment_count: appointment,
        rejected_count: rejected,
        invalid_count: invalidCount || 0,
        // 성공률 = 예약성공 / 총처리
        success_rate: processed > 0 ? Math.round((appointment / processed) * 100) : 0
      }

      return { success: true, data: stats }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// Recall Contact Log Service
// ========================================

export const recallContactLogService = {
  // 연락 이력 조회
  async getContactLogs(patientId?: string, campaignId?: string): Promise<{ success: boolean; data?: RecallContactLog[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      let query = supabase
        .from('recall_contact_logs')
        .select('*, patient:recall_patients(*)')
        .eq('clinic_id', clinicId)
        .order('contact_date', { ascending: false })

      if (patientId) {
        query = query.eq('patient_id', patientId)
      }
      if (campaignId) {
        query = query.eq('campaign_id', campaignId)
      }

      const { data, error } = await query

      if (error) throw error
      return { success: true, data: data as RecallContactLog[] }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 연락 이력 추가
  async addContactLog(formData: RecallContactLogFormData): Promise<{ success: boolean; data?: RecallContactLog; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    const currentUser = await getCurrentUser()

    try {
      const { data, error } = await supabase
        .from('recall_contact_logs')
        .insert([{
          ...formData,
          clinic_id: clinicId,
          contacted_by: currentUser?.id,
          contacted_by_name: currentUser?.name
        }])
        .select()
        .single()

      if (error) throw error

      // 환자 연락 정보 업데이트
      await supabase
        .from('recall_patients')
        .update({
          last_contact_date: new Date().toISOString(),
          last_contact_type: formData.contact_type,
          contact_count: supabase.rpc('increment', { row_id: formData.patient_id }),
          status: formData.result_status
        })
        .eq('id', formData.patient_id)

      // 캠페인 통계 업데이트
      if (formData.campaign_id) {
        await recallCampaignService.updateCampaignStats(formData.campaign_id)
      }

      return { success: true, data: data as RecallContactLog }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 오늘 연락 이력 조회
  async getTodayContactLogs(): Promise<{ success: boolean; data?: RecallContactLog[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    const today = new Date().toISOString().split('T')[0]

    try {
      const { data, error } = await supabase
        .from('recall_contact_logs')
        .select('*, patient:recall_patients(*)')
        .eq('clinic_id', clinicId)
        .gte('contact_date', `${today}T00:00:00`)
        .lte('contact_date', `${today}T23:59:59`)
        .order('contact_date', { ascending: false })

      if (error) throw error
      return { success: true, data: data as RecallContactLog[] }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// SMS Template Service
// ========================================

export const recallSmsTemplateService = {
  // 템플릿 목록 조회
  async getTemplates(): Promise<{ success: boolean; data?: RecallSmsTemplate[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      const { data, error } = await supabase
        .from('recall_sms_templates')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error
      return { success: true, data: data as RecallSmsTemplate[] }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 템플릿 생성
  async createTemplate(formData: RecallSmsTemplateFormData): Promise<{ success: boolean; data?: RecallSmsTemplate; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    const currentUser = await getCurrentUser()

    try {
      // 기본 템플릿으로 설정하는 경우 기존 기본 템플릿 해제
      if (formData.is_default) {
        await supabase
          .from('recall_sms_templates')
          .update({ is_default: false })
          .eq('clinic_id', clinicId)
      }

      const { data, error } = await supabase
        .from('recall_sms_templates')
        .insert([{
          ...formData,
          clinic_id: clinicId,
          created_by: currentUser?.id
        }])
        .select()
        .single()

      if (error) throw error
      return { success: true, data: data as RecallSmsTemplate }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 템플릿 수정
  async updateTemplate(id: string, updates: Partial<RecallSmsTemplate>): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      // 기본 템플릿으로 설정하는 경우 기존 기본 템플릿 해제
      if (updates.is_default) {
        await supabase
          .from('recall_sms_templates')
          .update({ is_default: false })
          .eq('clinic_id', clinicId)
      }

      const { error } = await supabase
        .from('recall_sms_templates')
        .update(updates)
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 템플릿 삭제
  async deleteTemplate(id: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_sms_templates')
        .update({ is_active: false })
        .eq('id', id)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// Aligo Settings Service
// ========================================

export const aligoSettingsService = {
  // 설정 조회
  async getSettings(): Promise<{ success: boolean; data?: AligoSettings | null; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      const { data, error } = await supabase
        .from('aligo_settings')
        .select('*')
        .eq('clinic_id', clinicId)
        .maybeSingle()

      if (error) throw error
      return { success: true, data: data as AligoSettings | null }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 설정 저장/업데이트
  async saveSettings(formData: AligoSettingsFormData): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      // 기존 설정 확인
      const { data: existing } = await supabase
        .from('aligo_settings')
        .select('id')
        .eq('clinic_id', clinicId)
        .maybeSingle()

      if (existing) {
        // 업데이트
        const { error } = await supabase
          .from('aligo_settings')
          .update(formData)
          .eq('clinic_id', clinicId)

        if (error) throw error
      } else {
        // 새로 생성
        const { error } = await supabase
          .from('aligo_settings')
          .insert([{
            ...formData,
            clinic_id: clinicId
          }])

        if (error) throw error
      }

      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // API 테스트
  async testConnection(): Promise<{ success: boolean; message?: string; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      // 설정 조회
      const { data: settings } = await supabase
        .from('aligo_settings')
        .select('*')
        .eq('clinic_id', clinicId)
        .single()

      if (!settings) {
        return { success: false, error: '알리고 API 설정이 없습니다.' }
      }

      // 실제 API 테스트는 API 라우트에서 수행
      // 여기서는 설정이 있는지만 확인
      return { success: true, message: 'API 설정이 확인되었습니다.' }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// Combined Export
// ========================================

export const recallService = {
  campaigns: recallCampaignService,
  patients: recallPatientService,
  contactLogs: recallContactLogService,
  smsTemplates: recallSmsTemplateService,
  aligoSettings: aligoSettingsService
}

export default recallService
