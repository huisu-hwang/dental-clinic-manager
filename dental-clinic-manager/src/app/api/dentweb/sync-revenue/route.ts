import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// POST: 워커에서 덴트웹 월별 수입 데이터 수신 → revenue_records upsert
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, api_key, year, month, insurance_revenue, non_insurance_revenue, other_revenue } = body

    if (!clinic_id || !api_key || !year || !month) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // API 키 인증 + pending 조회
    const { data: config, error: configError } = await supabase
      .from('dentweb_sync_config')
      .select('id, clinic_id, api_key, is_active, pending_revenue_months')
      .eq('clinic_id', clinic_id)
      .eq('api_key', api_key)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { success: false, error: '인증 실패: 유효하지 않은 API 키입니다.' },
        { status: 401 }
      )
    }

    // revenue_records upsert (source_type='dentweb')
    const { error: upsertError } = await supabase
      .from('revenue_records')
      .upsert(
        {
          clinic_id,
          year: parseInt(year),
          month: parseInt(month),
          insurance_revenue: Math.round(insurance_revenue || 0),
          non_insurance_revenue: Math.round(non_insurance_revenue || 0),
          other_revenue: Math.round(other_revenue || 0),
          source_type: 'dentweb',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'clinic_id,year,month' }
      )

    if (upsertError) {
      console.error('[dentweb/sync-revenue] upsert error:', upsertError)
      return NextResponse.json(
        { success: false, error: `수입 데이터 저장 실패: ${upsertError.message}` },
        { status: 500 }
      )
    }

    const total = Math.round((insurance_revenue || 0) + (non_insurance_revenue || 0) + (other_revenue || 0))
    console.log(`[dentweb/sync-revenue] ${year}-${month} 수입 저장 완료: 보험=${insurance_revenue}, 비보험=${non_insurance_revenue}, 기타=${other_revenue}, 합계=${total}`)

    // 해당 월이 pending에 있으면 자동 제거
    const pending = (config.pending_revenue_months || []) as Array<{ year: number; month: number }>
    const yearNum = parseInt(year)
    const monthNum = parseInt(month)
    if (pending.some(p => p.year === yearNum && p.month === monthNum)) {
      const remaining = pending.filter(p => !(p.year === yearNum && p.month === monthNum))
      await supabase
        .from('dentweb_sync_config')
        .update({ pending_revenue_months: remaining })
        .eq('id', config.id)
    }

    return NextResponse.json({
      success: true,
      data: {
        year: parseInt(year),
        month: parseInt(month),
        insurance_revenue: Math.round(insurance_revenue || 0),
        non_insurance_revenue: Math.round(non_insurance_revenue || 0),
        other_revenue: Math.round(other_revenue || 0),
        total_revenue: total,
      },
    })
  } catch (error) {
    console.error('[dentweb/sync-revenue] Error:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

