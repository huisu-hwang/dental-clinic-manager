// ========================================
// 덴트웹 데이터베이스 연동 타입 정의
// DentWeb Database Integration Types
// ========================================

// 동기화 설정
export interface DentwebSyncConfig {
  id: string
  clinic_id: string
  is_active: boolean
  sync_interval_seconds: number
  last_sync_at: string | null
  last_sync_status: 'success' | 'error' | null
  last_sync_error: string | null
  last_sync_patient_count: number
  api_key: string | null
  agent_version: string | null
  created_at: string
  updated_at: string
}

// 덴트웹 환자 데이터
export interface DentwebPatient {
  id: string
  clinic_id: string
  dentweb_patient_id: string
  chart_number: string | null
  patient_name: string
  phone_number: string | null
  birth_date: string | null
  gender: string | null
  last_visit_date: string | null
  last_treatment_type: string | null
  next_appointment_date: string | null
  registration_date: string | null
  is_active: boolean
  raw_data: Record<string, unknown> | null
  synced_at: string
  created_at: string
  updated_at: string
}

// 동기화 로그
export interface DentwebSyncLog {
  id: string
  clinic_id: string
  sync_type: 'full' | 'incremental'
  status: 'started' | 'success' | 'error'
  total_records: number
  new_records: number
  updated_records: number
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
}

// 동기화 상태 요약
export interface DentwebSyncStatus {
  isActive: boolean
  lastSyncAt: string | null
  lastSyncStatus: 'success' | 'error' | null
  lastSyncError: string | null
  lastSyncPatientCount: number
  totalPatients: number
  agentVersion: string | null
  syncIntervalSeconds: number
}

// 브릿지 에이전트에서 보내는 동기화 데이터
export interface DentwebSyncPayload {
  clinic_id: string
  api_key: string
  sync_type: 'full' | 'incremental'
  patients: DentwebPatientSyncData[]
  agent_version?: string
}

// 동기화 시 환자 데이터 형식
export interface DentwebPatientSyncData {
  dentweb_patient_id: string
  chart_number?: string
  patient_name: string
  phone_number?: string
  birth_date?: string
  gender?: string
  last_visit_date?: string
  last_treatment_type?: string
  next_appointment_date?: string
  registration_date?: string
  is_active?: boolean
  raw_data?: Record<string, unknown>
}

// 동기화 결과 응답
export interface DentwebSyncResult {
  success: boolean
  sync_log_id?: string
  total_records: number
  new_records: number
  updated_records: number
  error?: string
}

// 덴트웹 환자 검색 필터
export interface DentwebPatientFilters {
  search?: string
  lastVisitMonthsAgo?: number  // N개월 이상 미내원
  isActive?: boolean
  page?: number
  pageSize?: number
}

// 덴트웹 환자 → 리콜 환자 가져오기 결과
export interface DentwebImportResult {
  success: boolean
  importedCount: number
  skippedCount: number  // 이미 등록된 환자
  error?: string
}
