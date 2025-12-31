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
  RecallPatientFilters,
  RecallStats,
  ContactType
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
  // 환자 목록 조회
  async getPatients(filters?: RecallPatientFilters): Promise<{ success: boolean; data?: RecallPatient[]; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      let query = supabase
        .from('recall_patients')
        .select('*, campaign:recall_campaigns(*)')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })

      // 필터 적용
      if (filters?.campaign_id) {
        query = query.eq('campaign_id', filters.campaign_id)
      }
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters?.search) {
        query = query.or(`patient_name.ilike.%${filters.search}%,phone_number.ilike.%${filters.search}%,chart_number.ilike.%${filters.search}%`)
      }
      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom)
      }
      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo)
      }

      const { data, error } = await query

      if (error) throw error
      return { success: true, data: data as RecallPatient[] }
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
        .update({ status })
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

  // 환자 통계 조회
  async getStats(campaignId?: string): Promise<{ success: boolean; data?: RecallStats; error?: string }> {
    const supabase = await ensureConnection()
    if (!supabase) return { success: false, error: 'Database connection not available' }

    const clinicId = await getCurrentClinicId()
    if (!clinicId) return { success: false, error: 'Clinic ID not found' }

    try {
      let query = supabase
        .from('recall_patients')
        .select('status')
        .eq('clinic_id', clinicId)

      if (campaignId) {
        query = query.eq('campaign_id', campaignId)
      }

      const { data, error } = await query

      if (error) throw error

      const patients = (data || []) as { status: string }[]
      const stats: RecallStats = {
        total_patients: patients.length,
        pending_count: patients.filter(p => p.status === 'pending').length,
        contacted_count: patients.filter(p => ['sms_sent', 'call_attempted', 'appointment_made', 'completed'].includes(p.status)).length,
        appointment_count: patients.filter(p => ['appointment_made', 'completed'].includes(p.status)).length,
        rejected_count: patients.filter(p => ['call_rejected', 'visit_refused'].includes(p.status)).length,
        invalid_count: patients.filter(p => p.status === 'invalid_number').length,
        success_rate: patients.length > 0
          ? Math.round((patients.filter(p => ['appointment_made', 'completed'].includes(p.status)).length / patients.length) * 100)
          : 0
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
