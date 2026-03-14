import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET: 동기화 상태 조회 (브릿지 에이전트 heartbeat용)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinic_id = searchParams.get('clinic_id')
    const api_key = searchParams.get('api_key')

    if (!clinic_id || !api_key) {
      return NextResponse.json(
        { success: false, error: 'clinic_id and api_key are required' },
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
        { success: false, error: '인증 실패' },
        { status: 401 }
      )
    }

    // 환자 수 조회
    const { count } = await supabase
      .from('dentweb_patients')
      .select('*', { count: 'exact', head: true })
      .eq('clinic_id', clinic_id)

    return NextResponse.json({
      success: true,
      data: {
        is_active: config.is_active,
        sync_interval_seconds: config.sync_interval_seconds,
        last_sync_at: config.last_sync_at,
        last_sync_status: config.last_sync_status,
        total_patients: count || 0
      }
    })

  } catch (error) {
    console.error('[dentweb/status] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
