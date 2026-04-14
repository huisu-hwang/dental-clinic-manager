import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// POST: 브릿지 에이전트 heartbeat
// - 브릿지 에이전트가 살아있음을 주기적으로 통지한다.
// - 실제 환자 동기화가 없어도(또는 DB 연결 실패 상황이어도) last_sync_at을 갱신하여
//   /api/workers/status 의 online 판정이 올바르게 동작하도록 한다.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, api_key, agent_version, db_connected, last_error } = body as {
      clinic_id?: string
      api_key?: string
      agent_version?: string
      db_connected?: boolean
      last_error?: string | null
    }

    if (!clinic_id || !api_key) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (clinic_id, api_key)' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // API 키 인증
    const { data: config, error: configError } = await supabase
      .from('dentweb_sync_config')
      .select('id, is_active, last_sync_status')
      .eq('clinic_id', clinic_id)
      .eq('api_key', api_key)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: '인증 실패: 유효하지 않은 API 키입니다.' },
        { status: 401 }
      )
    }

    // last_sync_status 값은 CHECK 제약(IN 'success','error') 때문에 이 두 값 외의
    // 값으로 overwrite 하지 않는다. heartbeat는 원칙적으로 last_sync_at을 갱신하여
    // 워커 online 판정만 유지하고, 실제 sync 성공 여부는 /api/dentweb/sync 가 기록한다.
    //
    // 단, DB 연결 실패나 명시적 오류 상황은 'error'로 표시해 사용자가 즉시 인지할 수 있게 한다.
    const now = new Date().toISOString()
    const updatePayload: Record<string, unknown> = {
      last_sync_at: now,
      agent_version: agent_version || null,
      updated_at: now,
    }

    if (db_connected === false || last_error) {
      updatePayload.last_sync_status = 'error'
      updatePayload.last_sync_error = last_error || 'DB 연결 실패'
    }

    const { error: updateError } = await supabase
      .from('dentweb_sync_config')
      .update(updatePayload)
      .eq('id', config.id)

    if (updateError) {
      console.error('[dentweb/heartbeat] Update error:', updateError)
      return NextResponse.json(
        { success: false, error: '상태 갱신에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      is_active: config.is_active,
    })
  } catch (error) {
    console.error('[dentweb/heartbeat] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
