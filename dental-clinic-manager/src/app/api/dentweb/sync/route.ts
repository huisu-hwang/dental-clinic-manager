import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

interface PatientSyncData {
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

/** 날짜 문자열 유효성 검증 (PostgreSQL date 호환) */
function sanitizeDate(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const [, y, m, d] = match
  const year = parseInt(y, 10)
  const month = parseInt(m, 10)
  const day = parseInt(d, 10)
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
  return dateStr
}

// POST: 브릿지 에이전트에서 환자 데이터 동기화 수신
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, api_key, sync_type, patients, agent_version } = body

    if (!clinic_id || !api_key || !patients) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (clinic_id, api_key, patients)' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // API 키 인증
    const { data: config, error: configError } = await supabase
      .from('dentweb_sync_config')
      .select('*')
      .eq('clinic_id', clinic_id)
      .eq('api_key', api_key)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: '인증 실패: 유효하지 않은 API 키입니다.' },
        { status: 401 }
      )
    }

    if (!config.is_active) {
      return NextResponse.json(
        { success: false, error: '동기화가 비활성화되어 있습니다.' },
        { status: 403 }
      )
    }

    // 동기화 로그 시작
    const startedAt = new Date().toISOString()
    const { data: syncLog, error: logError } = await supabase
      .from('dentweb_sync_logs')
      .insert({
        clinic_id,
        sync_type: sync_type || 'incremental',
        status: 'started',
        started_at: startedAt
      })
      .select()
      .single()

    if (logError) {
      console.error('[dentweb/sync] Failed to create sync log:', logError)
    }

    // 환자 데이터 동기화 (upsert)
    let newRecords = 0
    let updatedRecords = 0
    const totalRecords = patients.length
    const batchSize = 100

    try {
      for (let i = 0; i < patients.length; i += batchSize) {
        const batch = patients.slice(i, i + batchSize) as PatientSyncData[]

        const upsertData = batch.map((p: PatientSyncData) => ({
          clinic_id,
          dentweb_patient_id: p.dentweb_patient_id,
          chart_number: p.chart_number || null,
          patient_name: p.patient_name,
          phone_number: p.phone_number || null,
          birth_date: sanitizeDate(p.birth_date),
          gender: p.gender || null,
          last_visit_date: sanitizeDate(p.last_visit_date),
          last_treatment_type: p.last_treatment_type || null,
          next_appointment_date: sanitizeDate(p.next_appointment_date),
          registration_date: sanitizeDate(p.registration_date),
          is_active: p.is_active !== false,
          raw_data: p.raw_data || null,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }))

        // 기존 데이터 확인 (신규/업데이트 구분용)
        const dentwebIds = batch.map(p => p.dentweb_patient_id)
        const { data: existingPatients } = await supabase
          .from('dentweb_patients')
          .select('dentweb_patient_id')
          .eq('clinic_id', clinic_id)
          .in('dentweb_patient_id', dentwebIds)

        const existingIdSet = new Set(
          (existingPatients || []).map(p => p.dentweb_patient_id)
        )

        for (const p of batch) {
          if (existingIdSet.has(p.dentweb_patient_id)) {
            updatedRecords++
          } else {
            newRecords++
          }
        }

        // Upsert 실행
        const { error: upsertError } = await supabase
          .from('dentweb_patients')
          .upsert(upsertData, {
            onConflict: 'clinic_id,dentweb_patient_id'
          })

        if (upsertError) {
          throw new Error(`Batch upsert failed: ${upsertError.message}`)
        }
      }

      // 동기화 성공 - 설정 업데이트
      const completedAt = new Date().toISOString()
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()

      await supabase
        .from('dentweb_sync_config')
        .update({
          last_sync_at: completedAt,
          last_sync_status: 'success',
          last_sync_error: null,
          last_sync_patient_count: totalRecords,
          agent_version: agent_version || null,
          updated_at: completedAt
        })
        .eq('clinic_id', clinic_id)

      // 동기화 로그 업데이트
      if (syncLog) {
        await supabase
          .from('dentweb_sync_logs')
          .update({
            status: 'success',
            total_records: totalRecords,
            new_records: newRecords,
            updated_records: updatedRecords,
            completed_at: completedAt,
            duration_ms: durationMs
          })
          .eq('id', syncLog.id)
      }

      return NextResponse.json({
        success: true,
        sync_log_id: syncLog?.id,
        total_records: totalRecords,
        new_records: newRecords,
        updated_records: updatedRecords
      })

    } catch (syncError: unknown) {
      // 동기화 실패
      const errorMessage = syncError instanceof Error ? syncError.message : 'Unknown sync error'
      const completedAt = new Date().toISOString()
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime()

      await supabase
        .from('dentweb_sync_config')
        .update({
          last_sync_at: completedAt,
          last_sync_status: 'error',
          last_sync_error: errorMessage,
          updated_at: completedAt
        })
        .eq('clinic_id', clinic_id)

      if (syncLog) {
        await supabase
          .from('dentweb_sync_logs')
          .update({
            status: 'error',
            error_message: errorMessage,
            total_records: totalRecords,
            new_records: newRecords,
            updated_records: updatedRecords,
            completed_at: completedAt,
            duration_ms: durationMs
          })
          .eq('id', syncLog.id)
      }

      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: 500 }
      )
    }

  } catch (error) {
    console.error('[dentweb/sync] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
