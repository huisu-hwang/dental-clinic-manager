import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET: 워커의 Bearer 토큰으로 DentWeb 동기화 설정 조회/자동생성
export async function GET(request: NextRequest) {
  try {
    // 1. Bearer 토큰 추출
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: '인증 토큰이 필요합니다.' },
        { status: 401 }
      )
    }
    const token = authHeader.slice(7)

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 2. 토큰으로 clinic_id 조회
    const { data: worker, error: workerError } = await supabase
      .from('marketing_worker_control')
      .select('clinic_id')
      .eq('worker_api_key', token)
      .limit(1)
      .single()

    if (workerError || !worker) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 인증 토큰입니다.' },
        { status: 401 }
      )
    }

    const clinicId = worker.clinic_id

    // 3. dentweb_sync_config 조회
    let { data: config, error: configError } = await supabase
      .from('dentweb_sync_config')
      .select('*')
      .eq('clinic_id', clinicId)
      .limit(1)
      .single()

    // 4. 없으면 자동 생성
    if (configError || !config) {
      const apiKey = `dw_${crypto.randomUUID().replace(/-/g, '')}`

      const { data: newConfig, error: insertError } = await supabase
        .from('dentweb_sync_config')
        .insert({
          clinic_id: clinicId,
          api_key: apiKey,
          is_active: true,
          sync_interval_seconds: 300,
        })
        .select()
        .single()

      if (insertError || !newConfig) {
        console.error('[dentweb/worker-config] Insert error:', insertError)
        return NextResponse.json(
          { success: false, error: 'DentWeb 설정 생성에 실패했습니다.' },
          { status: 500 }
        )
      }

      config = newConfig
    }

    // 5. 응답
    return NextResponse.json({
      success: true,
      clinic_id: config.clinic_id,
      api_key: config.api_key,
      sync_interval_seconds: config.sync_interval_seconds,
      is_active: config.is_active,
    })
  } catch (error) {
    console.error('[dentweb/worker-config] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
