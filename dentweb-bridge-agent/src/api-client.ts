import { config } from './config'
import { logger } from './logger'

interface SyncResponse {
  success: boolean
  sync_log_id?: string
  total_records: number
  new_records: number
  updated_records: number
  error?: string
}

interface StatusResponse {
  success: boolean
  data?: {
    is_active: boolean
    sync_interval_seconds: number
    last_sync_at: string | null
    last_sync_status: string | null
    total_patients: number
  }
  error?: string
}

const MAX_RETRIES = 3
const RETRY_DELAYS = [2000, 4000, 8000]

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 8000
        logger.warn(`네트워크 오류, ${delay / 1000}초 후 재시도 (${attempt + 1}/${retries})...`, {
          error: lastError.message,
        })
        await sleep(delay)
      }
    }
  }

  throw lastError || new Error('All retries failed')
}

// Supabase API로 환자 데이터 동기화 전송
export async function syncPatients(
  patients: Record<string, unknown>[],
  syncType: 'full' | 'incremental'
): Promise<SyncResponse> {
  const url = `${config.supabase.url}/api/dentweb/sync`

  try {
    logger.info(`Sending ${patients.length} patients to sync API (${syncType})...`)

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clinic_id: config.supabase.clinicId,
        api_key: config.supabase.apiKey,
        sync_type: syncType,
        patients,
        agent_version: config.agentVersion,
      }),
    })

    const data = await response.json() as SyncResponse

    if (!response.ok) {
      logger.error(`Sync API responded with ${response.status}`, data)
      return {
        success: false,
        total_records: patients.length,
        new_records: 0,
        updated_records: 0,
        error: data.error || `HTTP ${response.status}`,
      }
    }

    logger.info('Sync completed', {
      total: data.total_records,
      new: data.new_records,
      updated: data.updated_records,
    })

    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    logger.error('Sync API call failed (all retries exhausted)', { error: message })
    return {
      success: false,
      total_records: patients.length,
      new_records: 0,
      updated_records: 0,
      error: message,
    }
  }
}

// 동기화 상태 확인 (heartbeat)
export async function checkStatus(): Promise<StatusResponse> {
  const url = `${config.supabase.url}/api/dentweb/status?clinic_id=${config.supabase.clinicId}&api_key=${config.supabase.apiKey}`

  try {
    const response = await fetchWithRetry(url, undefined, 1)
    const data = await response.json() as StatusResponse

    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` }
    }

    return data
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}
