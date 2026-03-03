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
  PaginatedResponse,
  BulkUploadResult
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

  // 환자 일괄 추가 (파일 업로드) — 중복 제거 로직 (배치 병렬 처리)
  async addPatientsBulk(
    patients: RecallPatientUploadData[],
    campaignId: string,
    filename?: string
  ): Promise<BulkUploadResult> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, newCount: 0, updatedCount: 0, skippedCount: 0, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, newCount: 0, updatedCount: 0, skippedCount: 0, error: 'Clinic ID not found' }

    // 배치 크기 (GET: URL 길이 제한 고려, POST/UPSERT: body 기반이라 더 크게)
    const FETCH_BATCH_SIZE = 500
    const WRITE_BATCH_SIZE = 500
    const MAX_CONCURRENT = 5

    // 병렬 배치 실행 헬퍼
    const runBatchesParallel = async <T, R>(
      items: T[],
      batchSize: number,
      fn: (batch: T[]) => Promise<R>
    ): Promise<R[]> => {
      const batches: T[][] = []
      for (let i = 0; i < items.length; i += batchSize) {
        batches.push(items.slice(i, i + batchSize))
      }
      const results: R[] = []
      for (let i = 0; i < batches.length; i += MAX_CONCURRENT) {
        const concurrent = batches.slice(i, i + MAX_CONCURRENT)
        const batchResults = await Promise.all(concurrent.map(fn))
        results.push(...batchResults)
      }
      return results
    }

    try {
      // 1. 업로드 데이터에서 유효한 phone_number 목록 추출
      const validPatients = patients.filter(p => p.phone_number && p.patient_name)
      const skippedCount = patients.length - validPatients.length
      const phoneNumbers = validPatients.map(p => p.phone_number)

      // 2. DB에서 같은 clinic_id + phone_number를 가진 기존 환자 조회 (병렬 배치)
      const existingPatients: { id: string; phone_number: string; patient_name: string; exclude_reason: string | null }[] = []
      await runBatchesParallel(phoneNumbers, FETCH_BATCH_SIZE, async (batch) => {
        const { data, error: fetchError } = await supabase
          .from('recall_patients')
          .select('id, phone_number, patient_name, exclude_reason')
          .eq('clinic_id', clinicId)
          .in('phone_number', batch)

        if (fetchError) throw fetchError
        if (data) existingPatients.push(...data)
        return data
      })

      // 3. (phone_number + patient_name) 복합키 기준 기존 환자 Map 생성
      const compositeKey = (phone: string, name: string) => `${phone}::${name}`
      const existingMap = new Map<string, { id: string; exclude_reason: string | null }>()
      for (const ep of existingPatients) {
        const key = compositeKey(ep.phone_number, ep.patient_name)
        const current = existingMap.get(key)
        if (!current || (current.exclude_reason !== null && ep.exclude_reason === null)) {
          existingMap.set(key, { id: ep.id, exclude_reason: ep.exclude_reason })
        }
      }

      // 4. 신규 vs 기존 분류 (동일 phone_number+patient_name 중복 시 마지막 행 우선)
      const newPatientsMap = new Map<string, RecallPatientUploadData>()
      const updateTargetsMap = new Map<string, { id: string; data: RecallPatientUploadData }>()

      for (const p of validPatients) {
        const key = compositeKey(p.phone_number, p.patient_name)
        const existing = existingMap.get(key)
        if (existing) {
          // 같은 id로 중복 upsert 시 "cannot affect row a second time" 방지
          updateTargetsMap.set(existing.id, { id: existing.id, data: p })
        } else {
          // 신규 환자도 (phone_number + patient_name) 기준 중복 제거 (마지막 행 우선)
          newPatientsMap.set(key, p)
        }
      }

      const newPatients = Array.from(newPatientsMap.values())
      const updateTargets = Array.from(updateTargetsMap.values())

      // 5. 신규 환자 일괄 삽입 (병렬 배치)
      let newCount = 0
      const newPatientIds: string[] = []
      if (newPatients.length > 0) {
        const newRecords = newPatients.map(p => ({
          ...p,
          clinic_id: clinicId,
          campaign_id: campaignId,
          status: 'pending' as PatientRecallStatus
        }))

        const insertResults = await runBatchesParallel(newRecords, WRITE_BATCH_SIZE, async (batch) => {
          const { data, error: insertError } = await supabase
            .from('recall_patients')
            .insert(batch)
            .select('id')

          if (insertError) throw insertError
          if (data) data.forEach((p: { id: string }) => newPatientIds.push(p.id))
          return batch.length
        })
        newCount = insertResults.reduce((sum, n) => sum + n, 0)
      }

      // 5-1. 신규 환자에 제외 규칙 자동 적용
      if (newPatientIds.length > 0) {
        await recallExcludeRulesService.applyRulesToPatients(newPatientIds)
      }

      // 6. 기존 환자 정보 배치 업데이트 (병렬)
      let updatedCount = 0
      if (updateTargets.length > 0) {
        const fieldKeys = ['patient_name', 'chart_number', 'birth_date', 'gender', 'last_visit_date', 'treatment_type', 'notes'] as const
        const activeFields = fieldKeys.filter(key => updateTargets.some(t => t.data[key] !== undefined))

        const upsertResults = await runBatchesParallel(updateTargets, WRITE_BATCH_SIZE, async (batch) => {
          const upsertRecords = batch.map(t => {
            // NOT NULL 컬럼(phone_number, patient_name)을 반드시 포함 (upsert INSERT 시도 시 필요)
            const record: Record<string, unknown> = {
              id: t.id,
              clinic_id: clinicId,
              campaign_id: campaignId,
              phone_number: t.data.phone_number,
              patient_name: t.data.patient_name
            }
            for (const key of activeFields) {
              if (t.data[key] !== undefined) record[key] = t.data[key]
            }
            return record
          })

          const { error: updateError } = await supabase
            .from('recall_patients')
            .upsert(upsertRecords, { onConflict: 'id', ignoreDuplicates: false })

          if (updateError) throw updateError
          return batch.length
        })
        updatedCount = upsertResults.reduce((sum, n) => sum + n, 0)
      }

      // 7. 캠페인 업데이트
      await supabase
        .from('recall_campaigns')
        .update({
          total_patients: newCount + updatedCount,
          original_filename: filename
        })
        .eq('id', campaignId)

      return { success: true, newCount, updatedCount, skippedCount }
    } catch (error) {
      return { success: false, newCount: 0, updatedCount: 0, skippedCount: 0, error: extractErrorMessage(error) }
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

  // 제외 환자 파일 업로드 전용 (기존 환자 제외 + 미등록 환자는 수동 매칭용 반환)
  // 업로드 데이터의 전화번호, 환자명, 차트번호를 모두 활용하여 매칭
  async excludeFromFile(
    uploadData: RecallPatientUploadData[],
    excludeReason: RecallExcludeReason
  ): Promise<{ success: boolean; matchedCount: number; newCount: number; savedRulesCount?: number; unmatchedPatients?: RecallPatientUploadData[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, matchedCount: 0, newCount: 0, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, matchedCount: 0, newCount: 0, error: 'Clinic ID not found' }

    const BATCH_SIZE = 500

    // 전화번호 정규화 (숫자만 추출)
    const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '')

    // 전화번호의 다양한 형식 생성 (DB 형식 불일치 대비)
    const phoneVariants = (phone: string): string[] => {
      const digits = normalizePhone(phone)
      if (!digits) return []
      const variants = new Set<string>()
      variants.add(digits) // 01012345678
      variants.add(phone)  // 원본
      // 하이픈 형식 생성
      if (digits.length === 11) {
        variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`)
      } else if (digits.length === 10) {
        variants.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`)
      }
      return Array.from(variants)
    }

    try {
      // 1. 업로드 데이터에서 검색 키 수집
      const rawPhones = [...new Set(uploadData.filter(p => p.phone_number).map(p => p.phone_number))]
      // 전화번호의 모든 형식 변형을 포함하여 검색
      const phoneSearchSet = new Set<string>()
      rawPhones.forEach(p => phoneVariants(p).forEach(v => phoneSearchSet.add(v)))
      const phoneSearchList = Array.from(phoneSearchSet)

      const names = [...new Set(uploadData.filter(p => p.patient_name).map(p => p.patient_name))]
      const chartNumbers = [...new Set(uploadData.filter(p => p.chart_number).map(p => p.chart_number!))]

      // 2. 기존 환자 조회 (전화번호 OR 이름 OR 차트번호로 후보 조회)
      const existingPatients: { id: string; phone_number: string; patient_name: string; chart_number?: string }[] = []

      // 전화번호로 조회 (다양한 형식 포함)
      for (let i = 0; i < phoneSearchList.length; i += BATCH_SIZE) {
        const batch = phoneSearchList.slice(i, i + BATCH_SIZE)
        const { data } = await supabase
          .from('recall_patients')
          .select('id, phone_number, patient_name, chart_number')
          .eq('clinic_id', clinicId)
          .in('phone_number', batch)
        if (data) existingPatients.push(...data)
      }

      // 이름으로 조회 (전화번호로 이미 찾은 환자 제외)
      const foundIds = new Set(existingPatients.map(p => p.id))
      for (let i = 0; i < names.length; i += BATCH_SIZE) {
        const batch = names.slice(i, i + BATCH_SIZE)
        const { data } = await supabase
          .from('recall_patients')
          .select('id, phone_number, patient_name, chart_number')
          .eq('clinic_id', clinicId)
          .in('patient_name', batch)
        if (data) {
          for (const p of data) {
            if (!foundIds.has(p.id)) {
              existingPatients.push(p)
              foundIds.add(p.id)
            }
          }
        }
      }

      // 차트번호로 조회 (이미 찾은 환자 제외)
      for (let i = 0; i < chartNumbers.length; i += BATCH_SIZE) {
        const batch = chartNumbers.slice(i, i + BATCH_SIZE)
        const { data } = await supabase
          .from('recall_patients')
          .select('id, phone_number, patient_name, chart_number')
          .eq('clinic_id', clinicId)
          .in('chart_number', batch)
        if (data) {
          for (const p of data) {
            if (!foundIds.has(p.id)) {
              existingPatients.push(p)
              foundIds.add(p.id)
            }
          }
        }
      }

      // 3. 업로드 데이터별 매칭 (업로드에 포함된 모든 필드가 일치해야 매칭)
      const matchedIds = new Set<string>()
      const unmatchedPatientsData: RecallPatientUploadData[] = []

      for (const uploaded of uploadData) {
        if (!uploaded.phone_number && !uploaded.patient_name && !uploaded.chart_number) continue

        // 업로드 데이터에 포함된 모든 필드가 일치하는 기존 환자만 매칭
        // 전화번호는 숫자만 추출, 이름은 trim, 차트번호는 String 변환하여 비교
        const candidates = existingPatients.filter(p => {
          if (uploaded.phone_number && normalizePhone(p.phone_number) !== normalizePhone(uploaded.phone_number)) return false
          if (uploaded.patient_name && p.patient_name.trim() !== String(uploaded.patient_name).trim()) return false
          if (uploaded.chart_number && String(p.chart_number || '').trim() !== String(uploaded.chart_number).trim()) return false
          return true
        })

        if (candidates.length > 0) {
          candidates.forEach(p => matchedIds.add(p.id))
        } else {
          unmatchedPatientsData.push(uploaded)
        }
      }

      // 4. 매칭된 환자 일괄 제외 처리
      let matchedCount = 0
      const matchedIdArray = Array.from(matchedIds)
      for (let i = 0; i < matchedIdArray.length; i += BATCH_SIZE) {
        const batch = matchedIdArray.slice(i, i + BATCH_SIZE)
        const { data, error } = await supabase
          .from('recall_patients')
          .update({ exclude_reason: excludeReason })
          .eq('clinic_id', clinicId)
          .in('id', batch)
          .select('id')

        if (error) throw error
        matchedCount += data?.length || 0
      }

      // 5. 미매칭 환자를 제외 규칙으로 저장 (추후 자동 매칭용)
      let savedRulesCount = 0
      if (unmatchedPatientsData.length > 0) {
        const rulesResult = await recallExcludeRulesService.saveRules(unmatchedPatientsData, excludeReason)
        if (rulesResult.success) {
          savedRulesCount = rulesResult.savedCount
        }
      }

      return {
        success: true,
        matchedCount,
        newCount: 0,
        savedRulesCount,
        unmatchedPatients: unmatchedPatientsData.length > 0 ? unmatchedPatientsData : undefined
      }
    } catch (error) {
      return { success: false, matchedCount: 0, newCount: 0, error: extractErrorMessage(error) }
    }
  },

  // 환자 검색 (수동 매칭용 - 제외 환자 포함 전체 검색)
  async searchPatientsForMatching(
    searchQuery: string,
    limit: number = 10
  ): Promise<{ success: boolean; data?: RecallPatient[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      const query = searchQuery.trim()
      if (!query) return { success: true, data: [] }

      // 개별 필드별 검색 후 합치기 (or 필터 파싱 이슈 방지)
      const results = new Map<string, RecallPatient>()

      // 이름 검색
      const { data: nameData } = await supabase
        .from('recall_patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .ilike('patient_name', `%${query}%`)
        .limit(limit)
      if (nameData) nameData.forEach((p: RecallPatient) => results.set(p.id, p))

      // 전화번호 검색 (다양한 포맷 대응: 숫자만, 하이픈 포함)
      const digits = query.replace(/[^0-9]/g, '')
      const phoneQueries = new Set<string>()
      phoneQueries.add(query)
      if (digits.length >= 3) {
        phoneQueries.add(digits)
        if (digits.length === 11) {
          phoneQueries.add(`${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`)
        } else if (digits.length === 10) {
          phoneQueries.add(`${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`)
        }
      }
      for (const pq of phoneQueries) {
        const { data: phoneData } = await supabase
          .from('recall_patients')
          .select('*')
          .eq('clinic_id', clinicId)
          .ilike('phone_number', `%${pq}%`)
          .limit(limit)
        if (phoneData) phoneData.forEach((p: RecallPatient) => results.set(p.id, p))
      }

      // 차트번호 검색
      const { data: chartData } = await supabase
        .from('recall_patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .ilike('chart_number', `%${query}%`)
        .limit(limit)
      if (chartData) chartData.forEach((p: RecallPatient) => results.set(p.id, p))

      return { success: true, data: Array.from(results.values()).slice(0, limit) }
    } catch (error) {
      console.error('searchPatientsForMatching error:', error)
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 수동 매칭 제외 처리 (기존 환자의 exclude_reason 업데이트, null로 제외 해제 가능)
  async manualMatchExclude(
    existingPatientId: string,
    excludeReason: RecallExcludeReason | null
  ): Promise<{ success: boolean; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    try {
      const { error } = await supabase
        .from('recall_patients')
        .update({ exclude_reason: excludeReason })
        .eq('id', existingPatientId)

      if (error) throw error
      return { success: true }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 전화번호 기준 일괄 리콜 제외 설정 (엑셀 업로드용)
  async excludeByPhoneNumbers(
    phoneNumbers: string[],
    excludeReason: RecallExcludeReason
  ): Promise<{ success: boolean; count: number; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, count: 0, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, count: 0, error: 'Clinic ID not found' }

    const BATCH_SIZE = 500
    let totalCount = 0

    try {
      for (let i = 0; i < phoneNumbers.length; i += BATCH_SIZE) {
        const batch = phoneNumbers.slice(i, i + BATCH_SIZE)
        const { data, error } = await supabase
          .from('recall_patients')
          .update({ exclude_reason: excludeReason })
          .eq('clinic_id', clinicId)
          .in('phone_number', batch)
          .select('id')

        if (error) throw error
        totalCount += data?.length || 0
      }

      return { success: true, count: totalCount }
    } catch (error) {
      return { success: false, count: 0, error: extractErrorMessage(error) }
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

      // COUNT 쿼리 + 최근 환자 목록을 병렬 실행
      const buildTodayQuery = (status?: string) => {
        let q = supabase
          .from('recall_patients')
          .select('*', { count: 'exact', head: true })
          .match(baseFilter)
          .gte('recall_datetime', `${today}T00:00:00`)
          .lte('recall_datetime', `${today}T23:59:59`)
        if (status) q = q.eq('status', status)
        return q
      }

      const [
        totalResult,
        appointmentResult,
        noAnswerResult,
        callRejectedResult,
        visitRefusedResult,
        invalidResult,
        recentResult
      ] = await Promise.all([
        buildTodayQuery(),
        buildTodayQuery('appointment_made'),
        buildTodayQuery('no_answer'),
        buildTodayQuery('call_rejected'),
        buildTodayQuery('visit_refused'),
        buildTodayQuery('invalid_number'),
        // 최근 상태 변경된 환자 목록 (최대 10명)
        supabase
          .from('recall_patients')
          .select('*')
          .match(baseFilter)
          .gte('recall_datetime', `${today}T00:00:00`)
          .lte('recall_datetime', `${today}T23:59:59`)
          .order('recall_datetime', { ascending: false })
          .limit(10)
      ])

      const totalChanges = totalResult.count || 0
      const appointmentsMade = appointmentResult.count || 0

      const statusChanges = [
        { status: 'appointment_made' as PatientRecallStatus, count: appointmentsMade },
        { status: 'no_answer' as PatientRecallStatus, count: noAnswerResult.count || 0 },
        { status: 'call_rejected' as PatientRecallStatus, count: callRejectedResult.count || 0 },
        { status: 'visit_refused' as PatientRecallStatus, count: visitRefusedResult.count || 0 },
        { status: 'invalid_number' as PatientRecallStatus, count: invalidResult.count || 0 }
      ].filter(s => s.count > 0)

      return {
        success: true,
        data: {
          totalChanges,
          appointmentsMade,
          statusChanges,
          recentPatients: (recentResult.data as RecallPatient[]) || []
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
      const baseFilter = campaignId
        ? { clinic_id: clinicId, campaign_id: campaignId }
        : { clinic_id: clinicId }

      // 8개 COUNT 쿼리를 병렬 실행 (순차 → Promise.all)
      // 주의: select('status')로 실제 행을 가져오면 Supabase 기본 1000행 제한에 걸림
      const buildQuery = (status?: string) => {
        let q = supabase
          .from('recall_patients')
          .select('*', { count: 'exact', head: true })
          .match(baseFilter)
          .is('exclude_reason', null)
        if (status) q = q.eq('status', status)
        return q
      }

      const [
        totalResult,
        pendingResult,
        smsSentResult,
        appointmentResult,
        noAnswerResult,
        callRejectedResult,
        visitRefusedResult,
        invalidResult
      ] = await Promise.all([
        buildQuery(),
        buildQuery('pending'),
        buildQuery('sms_sent'),
        buildQuery('appointment_made'),
        buildQuery('no_answer'),
        buildQuery('call_rejected'),
        buildQuery('visit_refused'),
        buildQuery('invalid_number')
      ])

      const total = totalResult.count || 0
      const pending = pendingResult.count || 0
      const appointment = appointmentResult.count || 0
      const contacted = (smsSentResult.count || 0) + appointment + (noAnswerResult.count || 0)
      const rejected = (callRejectedResult.count || 0) + (visitRefusedResult.count || 0)
      const processed = total - pending

      const stats: RecallStats = {
        total_patients: total,
        pending_count: pending,
        contacted_count: contacted,
        appointment_count: appointment,
        rejected_count: rejected,
        invalid_count: invalidResult.count || 0,
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

// ========================================
// Recall Exclude Rules Service
// ========================================
export const recallExcludeRulesService = {
  // 미매칭 제외 환자를 규칙으로 저장
  async saveRules(
    unmatchedPatients: RecallPatientUploadData[],
    excludeReason: RecallExcludeReason
  ): Promise<{ success: boolean; savedCount: number; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, savedCount: 0, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, savedCount: 0, error: 'Clinic ID not found' }

    try {
      const rules = unmatchedPatients
        .filter(p => p.patient_name || p.phone_number || p.chart_number)
        .map(p => ({
          clinic_id: clinicId,
          patient_name: p.patient_name || null,
          phone_number: p.phone_number || null,
          chart_number: p.chart_number || null,
          exclude_reason: excludeReason
        }))

      if (rules.length === 0) return { success: true, savedCount: 0 }

      const { error } = await supabase
        .from('recall_exclude_rules')
        .insert(rules)

      if (error) throw error
      return { success: true, savedCount: rules.length }
    } catch (error) {
      return { success: false, savedCount: 0, error: extractErrorMessage(error) }
    }
  },

  // 새로 등록된 환자들에 대해 제외 규칙 적용
  async applyRulesToPatients(
    patientIds: string[]
  ): Promise<{ success: boolean; appliedCount: number; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, appliedCount: 0, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, appliedCount: 0, error: 'Clinic ID not found' }

    try {
      // 1. 활성 규칙 조회
      const { data: rules, error: rulesError } = await supabase
        .from('recall_exclude_rules')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('is_active', true)

      if (rulesError) throw rulesError
      if (!rules || rules.length === 0) return { success: true, appliedCount: 0 }

      // 2. 새로 등록된 환자 정보 조회
      const BATCH_SIZE = 500
      const newPatients: { id: string; patient_name: string; phone_number: string; chart_number?: string }[] = []
      for (let i = 0; i < patientIds.length; i += BATCH_SIZE) {
        const batch = patientIds.slice(i, i + BATCH_SIZE)
        const { data } = await supabase
          .from('recall_patients')
          .select('id, patient_name, phone_number, chart_number')
          .in('id', batch)
        if (data) newPatients.push(...data)
      }

      // 3. 규칙별 매칭 (규칙의 모든 필드가 환자와 일치해야 적용)
      // 전화번호 정규화 (숫자만 추출하여 형식 차이 무시)
      const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '')

      let appliedCount = 0
      for (const rule of rules) {
        for (const patient of newPatients) {
          let allMatch = true
          if (rule.patient_name && patient.patient_name.trim() !== String(rule.patient_name).trim()) allMatch = false
          if (rule.phone_number && normalizePhone(patient.phone_number) !== normalizePhone(rule.phone_number)) allMatch = false
          if (rule.chart_number && String(patient.chart_number || '').trim() !== String(rule.chart_number).trim()) allMatch = false

          if (allMatch) {
            // 환자 제외 처리
            const { error: updateError } = await supabase
              .from('recall_patients')
              .update({ exclude_reason: rule.exclude_reason })
              .eq('id', patient.id)

            if (!updateError) {
              // 규칙 매칭 완료 처리
              await supabase
                .from('recall_exclude_rules')
                .update({ is_active: false, matched_at: new Date().toISOString(), matched_patient_id: patient.id })
                .eq('id', rule.id)

              appliedCount++
            }
          }
        }
      }

      return { success: true, appliedCount }
    } catch (error) {
      return { success: false, appliedCount: 0, error: extractErrorMessage(error) }
    }
  }
}

export const recallService = {
  campaigns: recallCampaignService,
  patients: recallPatientService,
  contactLogs: recallContactLogService,
  smsTemplates: recallSmsTemplateService,
  aligoSettings: aligoSettingsService,
  excludeRules: recallExcludeRulesService
}

export default recallService
