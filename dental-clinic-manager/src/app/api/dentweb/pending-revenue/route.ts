import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * GET: 워커가 api_key로 인증하여 pending_revenue_months 목록 조회
 * 워커는 RLS 때문에 dentweb_sync_config에 직접 접근 불가하므로 이 API를 사용
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinic_id')
    const apiKey = searchParams.get('api_key')

    if (!clinicId || !apiKey) {
      return NextResponse.json({ success: false, error: 'clinic_id와 api_key가 필요합니다.' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // API 키 인증
    const { data: config, error } = await supabase
      .from('dentweb_sync_config')
      .select('pending_revenue_months')
      .eq('clinic_id', clinicId)
      .eq('api_key', apiKey)
      .single()

    if (error || !config) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 })
    }

    const pending = (config.pending_revenue_months || []) as Array<{ year: number; month: number }>

    return NextResponse.json({ success: true, data: { pending_months: pending } })
  } catch (error) {
    console.error('[dentweb/pending-revenue] GET error:', error)
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 })
  }
}

/**
 * POST: 워커가 처리 완료된 월을 pending에서 제거
 * body: { clinic_id, api_key, completed_months: [{year, month}, ...] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, api_key, completed_months } = body

    if (!clinic_id || !api_key || !completed_months) {
      return NextResponse.json({ success: false, error: '필수 파라미터 누락' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // API 키 인증 + 현재 pending 조회
    const { data: config, error } = await supabase
      .from('dentweb_sync_config')
      .select('id, pending_revenue_months')
      .eq('clinic_id', clinic_id)
      .eq('api_key', api_key)
      .single()

    if (error || !config) {
      return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 })
    }

    const pending = (config.pending_revenue_months || []) as Array<{ year: number; month: number }>
    const completed = completed_months as Array<{ year: number; month: number }>

    // 완료된 항목 제거
    const remaining = pending.filter(
      p => !completed.some(c => c.year === p.year && c.month === p.month)
    )

    await supabase
      .from('dentweb_sync_config')
      .update({ pending_revenue_months: remaining })
      .eq('id', config.id)

    return NextResponse.json({
      success: true,
      data: { removed_count: pending.length - remaining.length, remaining_count: remaining.length },
    })
  } catch (error) {
    console.error('[dentweb/pending-revenue] POST error:', error)
    return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 })
  }
}
