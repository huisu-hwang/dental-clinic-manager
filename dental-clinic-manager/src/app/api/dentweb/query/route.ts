import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET: 브릿지 에이전트가 대기 중인 쿼리 요청 폴링
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinic_id = searchParams.get('clinic_id')
    const api_key = searchParams.get('api_key')
    const action = searchParams.get('action')

    if (!clinic_id || !api_key || action !== 'poll') {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // API 키 인증
    const { data: config, error: configError } = await supabase
      .from('dentweb_sync_config')
      .select('is_active')
      .eq('clinic_id', clinic_id)
      .eq('api_key', api_key)
      .single()

    if (configError || !config || !config.is_active) {
      return NextResponse.json(
        { success: false, error: '인증 실패' },
        { status: 401 }
      )
    }

    // 대기 중인 요청 조회 (만료되지 않은 것만)
    const { data: requests } = await supabase
      .from('dentweb_query_requests')
      .select('id, query_type, query_text')
      .eq('clinic_id', clinic_id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(5)

    return NextResponse.json({
      success: true,
      requests: requests || [],
    })
  } catch (error) {
    console.error('[dentweb/query] Poll error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// POST: 브릿지 에이전트에서 쿼리 결과 수신
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, api_key, request_id, data, row_count, error_message, execution_time_ms } = body

    if (!clinic_id || !api_key || !request_id) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (clinic_id, api_key, request_id)' },
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

    // 요청 존재 여부 확인
    const { data: requestData, error: requestError } = await supabase
      .from('dentweb_query_requests')
      .select('id, clinic_id, status')
      .eq('id', request_id)
      .eq('clinic_id', clinic_id)
      .single()

    if (requestError || !requestData) {
      return NextResponse.json(
        { success: false, error: '해당 쿼리 요청을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const hasError = !!error_message
    const newStatus = hasError ? 'error' : 'completed'

    // 결과 저장
    const { error: insertError } = await supabase
      .from('dentweb_query_results')
      .insert({
        request_id,
        clinic_id,
        data: data || null,
        row_count: row_count || 0,
        error_message: error_message || null,
        execution_time_ms: execution_time_ms || null,
      })

    if (insertError) {
      console.error('[dentweb/query] Failed to insert result:', insertError)
      return NextResponse.json(
        { success: false, error: `결과 저장 실패: ${insertError.message}` },
        { status: 500 }
      )
    }

    // 요청 상태 업데이트
    const { error: updateError } = await supabase
      .from('dentweb_query_requests')
      .update({ status: newStatus })
      .eq('id', request_id)

    if (updateError) {
      console.error('[dentweb/query] Failed to update request status:', updateError)
      return NextResponse.json(
        { success: false, error: `요청 상태 업데이트 실패: ${updateError.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      request_id,
      status: newStatus,
    })
  } catch (error) {
    console.error('[dentweb/query] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
