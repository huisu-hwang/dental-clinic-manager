import { createClient } from './supabase/client'
import { ensureConnection } from './supabase/connectionCheck'
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
      if (!supabase) return { success: false, importedCount: 0, skippedCount: 0, error: 'Database connection not available' }

      const clinicId = await getCurrentClinicId()
      if (!clinicId) return { success: false, importedCount: 0, skippedCount: 0, error: 'Clinic ID not found' }

      // 선택된 덴트웹 환자 데이터 조회
      const { data: dentwebPatients, error: fetchError } = await supabase
        .from('dentweb_patients')
        .select('*')
        .eq('clinic_id', clinicId)
        .in('id', patientIds)

      if (fetchError) return { success: false, importedCount: 0, skippedCount: 0, error: fetchError.message }
      if (!dentwebPatients || dentwebPatients.length === 0) {
        return { success: false, importedCount: 0, skippedCount: 0, error: 'No patients found' }
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

      return { success: true, importedCount, skippedCount }
    } catch (error) {
      return { success: false, importedCount: 0, skippedCount: 0, error: extractErrorMessage(error) }
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
