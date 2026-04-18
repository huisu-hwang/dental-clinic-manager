import { ensureConnection } from './supabase/connectionCheck'
import { recallExcludeRulesService } from './recallService'
import type {
  DentwebSyncConfig,
  DentwebPatient,
  DentwebSyncLog,
  DentwebSyncStatus,
  DentwebPatientFilters,
  DentwebImportResult,
} from '@/types/dentweb'
import type { PaginatedResponse } from '@/types/recall'

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
          console.warn('[dentwebSyncService] Failed to parse cached user data:', e)
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
    console.error('[dentwebSyncService] Error getting clinic id:', error)
    return null
  }
}

const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return (error as { message: string }).message
  }
  return 'Unknown error occurred'
}

// ========================================
// 동기화 설정 서비스
// ========================================
export const dentwebConfigService = {
  // 설정 조회
  async getConfig(): Promise<{ success: boolean; data?: DentwebSyncConfig; error?: string }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, error: 'Clinic ID not found' }

      const { data, error } = await supabase
        .from('dentweb_sync_config')
        .select('*')
        .eq('clinic_id', clinicId)
        .single()

      if (error && error.code !== 'PGRST116') {
        return { success: false, error: error.message }
      }

      return { success: true, data: data || undefined }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 설정 저장/업데이트
  async saveConfig(config: {
    is_active?: boolean
    sync_interval_seconds?: number
  }): Promise<{ success: boolean; data?: DentwebSyncConfig; error?: string }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, error: 'Clinic ID not found' }

      const { data: existing } = await supabase
        .from('dentweb_sync_config')
        .select('id')
        .eq('clinic_id', clinicId)
        .single()

      if (existing) {
        const { data, error } = await supabase
          .from('dentweb_sync_config')
          .update({
            ...config,
            updated_at: new Date().toISOString()
          })
          .eq('clinic_id', clinicId)
          .select()
          .single()

        if (error) return { success: false, error: error.message }
        return { success: true, data }
      } else {
        const { data, error } = await supabase
          .from('dentweb_sync_config')
          .insert({
            clinic_id: clinicId,
            ...config
          })
          .select()
          .single()

        if (error) return { success: false, error: error.message }
        return { success: true, data }
      }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // API 키 생성/재생성
  async generateApiKey(): Promise<{ success: boolean; apiKey?: string; error?: string }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, error: 'Clinic ID not found' }

      // 간단한 API 키 생성 (crypto.randomUUID + prefix)
      const apiKey = `dw_${crypto.randomUUID().replace(/-/g, '')}`

      const { data: existing } = await supabase
        .from('dentweb_sync_config')
        .select('id')
        .eq('clinic_id', clinicId)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('dentweb_sync_config')
          .update({
            api_key: apiKey,
            updated_at: new Date().toISOString()
          })
          .eq('clinic_id', clinicId)

        if (error) return { success: false, error: error.message }
      } else {
        const { error } = await supabase
          .from('dentweb_sync_config')
          .insert({
            clinic_id: clinicId,
            api_key: apiKey
          })

        if (error) return { success: false, error: error.message }
      }

      return { success: true, apiKey }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// 덴트웹 환자 서비스
// ========================================
export const dentwebPatientService = {
  // 환자 목록 조회 (검색, 필터, 페이지네이션)
  async getPatients(
    filters?: DentwebPatientFilters
  ): Promise<{ success: boolean; data?: PaginatedResponse<DentwebPatient>; error?: string }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, error: 'Clinic ID not found' }

      const page = filters?.page || 1
      const pageSize = filters?.pageSize || 20
      const from = (page - 1) * pageSize
      const to = from + pageSize - 1

      let query = supabase
        .from('dentweb_patients')
        .select('*', { count: 'exact' })
        .eq('clinic_id', clinicId)

      // 검색 필터
      if (filters?.search) {
        const searchTerm = `%${filters.search}%`
        query = query.or(
          `patient_name.ilike.${searchTerm},chart_number.ilike.${searchTerm},phone_number.ilike.${searchTerm}`
        )
      }

      // 미내원 기간 필터
      if (filters?.lastVisitMonthsAgo && filters.lastVisitMonthsAgo > 0) {
        const cutoffDate = new Date()
        cutoffDate.setMonth(cutoffDate.getMonth() - filters.lastVisitMonthsAgo)
        query = query.lte('last_visit_date', cutoffDate.toISOString().split('T')[0])
        query = query.not('last_visit_date', 'is', null)
      }

      // 활성 환자 필터
      if (filters?.isActive !== undefined) {
        query = query.eq('is_active', filters.isActive)
      }

      // 정렬 및 페이지네이션
      query = query
        .order('last_visit_date', { ascending: true, nullsFirst: false })
        .range(from, to)

      const { data, error, count } = await query

      if (error) return { success: false, error: error.message }

      const total = count || 0
      return {
        success: true,
        data: {
          data: data || [],
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 덴트웹 환자 수 조회
  async getPatientCount(): Promise<{ success: boolean; count?: number; error?: string }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, error: 'Clinic ID not found' }

      const { count, error } = await supabase
        .from('dentweb_patients')
        .select('*', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)

      if (error) return { success: false, error: error.message }
      return { success: true, count: count || 0 }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  },

  // 덴트웹 환자를 리콜 환자로 가져오기
  async importToRecall(
    patientIds: string[],
    campaignId?: string
  ): Promise<DentwebImportResult> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: 'Clinic ID not found' }

      // 선택된 덴트웹 환자 데이터 조회
      const { data: dentwebPatients, error: fetchError } = await supabase
        .from('dentweb_patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .in('id', patientIds)

      if (fetchError) return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: fetchError.message }
      if (!dentwebPatients || dentwebPatients.length === 0) {
        return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: 'No patients found' }
      }

      let importedCount = 0
      let skippedCount = 0

      for (const dp of dentwebPatients) {
        // 전화번호로 이미 등록된 환자인지 확인
        const phoneToCheck = dp.phone_number?.replace(/[^0-9]/g, '') || ''

        if (phoneToCheck) {
          const { data: existing } = await supabase
            .from('recall_patients')
            .select('id')
            .eq('clinic_id', clinicId)
            .or(`phone_number.eq.${phoneToCheck},phone_number.eq.${dp.phone_number}`)
            .is('exclude_reason', null)
            .limit(1)

          if (existing && existing.length > 0) {
            skippedCount++
            continue
          }
        }

        // 리콜 환자로 등록
        const { error: insertError } = await supabase
          .from('recall_patients')
          .insert({
            clinic_id: clinicId,
            campaign_id: campaignId || null,
            patient_name: dp.patient_name,
            phone_number: dp.phone_number || '',
            chart_number: dp.chart_number,
            birth_date: dp.birth_date,
            gender: dp.gender === '남' || dp.gender === 'M' ? 'male' : dp.gender === '여' || dp.gender === 'F' ? 'female' : null,
            last_visit_date: dp.last_visit_date,
            treatment_type: dp.last_treatment_type,
            status: 'pending',
            contact_count: 0
          })

        if (insertError) {
          console.error('[dentwebSyncService] Failed to import patient:', dp.patient_name, insertError)
          skippedCount++
        } else {
          importedCount++
        }
      }

      return { success: true, importedCount, updatedCount: 0, skippedCount, totalProcessed: dentwebPatients.length }
    } catch (error) {
      return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: extractErrorMessage(error) }
    }
  },

  // 덴트웹 전체 환자를 리콜 환자로 동기화 (모달 없이 즉시 실행)
  async syncToRecall(): Promise<DentwebImportResult> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: 'Clinic ID not found' }

      const BATCH_SIZE = 500
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

      // 전화번호 정규화
      const normalizePhone = (phone: string | null | undefined): string => {
        if (!phone) return ''
        const digits = phone.toString().replace(/[^0-9]/g, '')
        if (digits.length === 10 && !digits.startsWith('0')) {
          return '0' + digits
        }
        return digits
      }

      // 1. 덴트웹 활성 환자 전체 조회 (배치)
      const allDentwebPatients: DentwebPatient[] = []
      let offset = 0
      while (true) {
        const { data, error } = await supabase
          .from('dentweb_patients')
          .select('*')
          .eq('clinic_id', clinicId)
          .eq('is_active', true)
          .range(offset, offset + BATCH_SIZE - 1)

        if (error) return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: error.message }
        if (!data || data.length === 0) break
        allDentwebPatients.push(...data)
        if (data.length < BATCH_SIZE) break
        offset += BATCH_SIZE
      }

      if (allDentwebPatients.length === 0) {
        return { success: true, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0 }
      }

      // 2. 기존 recall_patients 전체 조회 (배치)
      type RecallPatientRow = {
        id: string
        chart_number: string | null
        phone_number: string
        patient_name: string
        last_visit_date: string | null
        treatment_type: string | null
        birth_date: string | null
        exclude_reason: string | null
      }
      const allRecallPatients: RecallPatientRow[] = []
      let recallOffset = 0
      while (true) {
        const { data, error } = await supabase
          .from('recall_patients')
          .select('id, chart_number, phone_number, patient_name, last_visit_date, treatment_type, birth_date, exclude_reason')
          .eq('clinic_id', clinicId)
          .range(recallOffset, recallOffset + BATCH_SIZE - 1)

        if (error) return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: error.message }
        if (!data || data.length === 0) break
        allRecallPatients.push(...data)
        if (data.length < BATCH_SIZE) break
        recallOffset += BATCH_SIZE
      }

      // 3. 매칭 Map 생성
      // chartMap: chart_number → recall_patient (exclude_reason null 우선)
      const chartMap = new Map<string, RecallPatientRow>()
      for (const rp of allRecallPatients) {
        if (rp.chart_number) {
          const key = rp.chart_number.trim()
          const existing = chartMap.get(key)
          if (!existing || (existing.exclude_reason !== null && rp.exclude_reason === null)) {
            chartMap.set(key, rp)
          }
        }
      }

      // phoneMap: normalized_phone → recall_patient[] (fallback)
      const phoneMap = new Map<string, RecallPatientRow[]>()
      for (const rp of allRecallPatients) {
        const normalizedPhone = normalizePhone(rp.phone_number)
        if (normalizedPhone) {
          const list = phoneMap.get(normalizedPhone) || []
          list.push(rp)
          phoneMap.set(normalizedPhone, list)
        }
      }

      // 4. 덴트웹 환자별 매칭 및 분류
      const newPatients: DentwebPatient[] = []
      const updateTargets: { id: string; data: DentwebPatient }[] = []
      let skippedCount = 0
      const matchedRecallIds = new Set<string>() // 동일 recall_patient에 중복 매칭 방지

      // 성별 매핑
      const mapGender = (g: string | null): string | null => {
        if (!g) return null
        if (g === '남' || g === 'M') return 'male'
        if (g === '여' || g === 'F') return 'female'
        return null
      }

      for (const dp of allDentwebPatients) {
        let matched: RecallPatientRow | null = null

        // 1순위: chart_number 매칭
        if (dp.chart_number) {
          const chartKey = dp.chart_number.trim()
          const candidate = chartMap.get(chartKey)
          if (candidate && !matchedRecallIds.has(candidate.id)) {
            matched = candidate
          }
        }

        // 2순위: phone_number 매칭 (chart_number 매칭 실패 시)
        if (!matched && dp.phone_number) {
          const normalizedPhone = normalizePhone(dp.phone_number)
          if (normalizedPhone) {
            const candidates = phoneMap.get(normalizedPhone) || []
            // 단일 매칭만 허용 (오매칭 방지)
            const unmatched = candidates.filter(c => !matchedRecallIds.has(c.id))
            if (unmatched.length === 1) {
              matched = unmatched[0]
            }
          }
        }

        if (matched) {
          matchedRecallIds.add(matched.id)

          // 변경 여부 비교
          const hasChanged =
            (dp.last_visit_date && dp.last_visit_date !== matched.last_visit_date) ||
            (dp.last_treatment_type && dp.last_treatment_type !== matched.treatment_type) ||
            (dp.phone_number && normalizePhone(dp.phone_number) !== normalizePhone(matched.phone_number)) ||
            (dp.birth_date && !matched.birth_date) ||
            (dp.chart_number && !matched.chart_number)

          if (hasChanged) {
            updateTargets.push({ id: matched.id, data: dp })
          } else {
            skippedCount++
          }
        } else {
          newPatients.push(dp)
        }
      }

      // 5. 신규 환자 일괄 삽입
      let importedCount = 0
      const newPatientIds: string[] = []

      if (newPatients.length > 0) {
        const newRecords = newPatients.map(dp => ({
          clinic_id: clinicId,
          patient_name: dp.patient_name,
          phone_number: dp.phone_number || '',
          chart_number: dp.chart_number,
          birth_date: dp.birth_date,
          gender: mapGender(dp.gender),
          last_visit_date: dp.last_visit_date,
          treatment_type: dp.last_treatment_type,
          status: 'pending' as const,
          contact_count: 0
        }))

        const insertResults = await runBatchesParallel(newRecords, BATCH_SIZE, async (batch) => {
          const { data, error: insertError } = await supabase
            .from('recall_patients')
            .insert(batch)
            .select('id')

          if (insertError) throw insertError
          if (data) data.forEach((p: { id: string }) => newPatientIds.push(p.id))
          return batch.length
        })
        importedCount = insertResults.reduce((sum, n) => sum + n, 0)
      }

      // 5-1. 신규 환자에 제외 규칙 자동 적용
      if (newPatientIds.length > 0) {
        await recallExcludeRulesService.applyRulesToPatients(newPatientIds)
      }

      // 6. 기존 환자 정보 배치 upsert (개별 update 대신 일괄 처리)
      let updatedCount = 0

      if (updateTargets.length > 0) {
        const upsertRecords = updateTargets.map(target => {
          const dp = target.data
          const record: Record<string, unknown> = {
            id: target.id,
            clinic_id: clinicId,
            patient_name: dp.patient_name,
            phone_number: dp.phone_number || '',
          }
          if (dp.last_visit_date) record.last_visit_date = dp.last_visit_date
          if (dp.last_treatment_type) record.treatment_type = dp.last_treatment_type
          if (dp.birth_date) record.birth_date = dp.birth_date
          if (dp.chart_number) record.chart_number = dp.chart_number
          return record
        })

        const updateResults = await runBatchesParallel(upsertRecords, BATCH_SIZE, async (batch) => {
          const { error: upsertError } = await supabase
            .from('recall_patients')
            .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })

          if (upsertError) throw upsertError
          return batch.length
        })
        updatedCount = updateResults.reduce((sum, n) => sum + n, 0)
      }

      return {
        success: true,
        importedCount,
        updatedCount,
        skippedCount,
        totalProcessed: allDentwebPatients.length
      }
    } catch (error) {
      return { success: false, importedCount: 0, updatedCount: 0, skippedCount: 0, totalProcessed: 0, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// 동기화 로그 서비스
// ========================================
export const dentwebSyncLogService = {
  // 최근 동기화 로그 조회
  async getRecentLogs(limit: number = 10): Promise<{ success: boolean; data?: DentwebSyncLog[]; error?: string }> {
    try {
      const supabase = await ensureConnection()
      if (!supabase) return { success: false, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, error: 'Clinic ID not found' }

      const { data, error } = await supabase
        .from('dentweb_sync_logs')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('started_at', { ascending: false })
        .limit(limit)

      if (error) return { success: false, error: error.message }
      return { success: true, data: data || [] }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// ========================================
// 동기화 상태 서비스
// ========================================
export const dentwebStatusService = {
  // 전체 동기화 상태 조회
  async getStatus(): Promise<{ success: boolean; data?: DentwebSyncStatus; error?: string }> {
    try {
      const configResult = await dentwebConfigService.getConfig()
      const countResult = await dentwebPatientService.getPatientCount()

      const config = configResult.data

      return {
        success: true,
        data: {
          isActive: config?.is_active || false,
          lastSyncAt: config?.last_sync_at || null,
          lastSyncStatus: config?.last_sync_status || null,
          lastSyncError: config?.last_sync_error || null,
          lastSyncPatientCount: config?.last_sync_patient_count || 0,
          totalPatients: countResult.count || 0,
          agentVersion: config?.agent_version || null,
          syncIntervalSeconds: config?.sync_interval_seconds || 300,
        }
      }
    } catch (error) {
      return { success: false, error: extractErrorMessage(error) }
    }
  }
}

// 통합 서비스 객체
export const dentwebService = {
  config: dentwebConfigService,
  patients: dentwebPatientService,
  syncLogs: dentwebSyncLogService,
  status: dentwebStatusService,
}
