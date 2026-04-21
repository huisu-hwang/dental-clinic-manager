// ============================================
// DentWeb 매출 Push API
// POST: 워커에서 직접 매출 데이터를 전송받아 revenue_records 업데이트
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, api_key, revenue_data } = body

    if (!clinic_id || !api_key || !revenue_data) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = getServiceClient()

    // API 키 인증
    const { data: config } = await supabase
      .from('dentweb_sync_config')
      .select('clinic_id')
      .eq('clinic_id', clinic_id)
      .eq('api_key', api_key)
      .single()

    if (!config) {
      return NextResponse.json(
        { success: false, error: '인증 실패: 유효하지 않은 API 키입니다.' },
        { status: 401 }
      )
    }

    const rows = revenue_data as Array<{
      year: string | number
      month: string | number
      insurance_revenue: number
      non_insurance_revenue: number
      record_count?: number
    }>

    let insertedCount = 0
    let updatedCount = 0

    for (const row of rows) {
      const year = parseInt(String(row.year))
      const month = parseInt(String(row.month))
      const insuranceRevenue = Number(row.insurance_revenue) || 0
      const nonInsuranceRevenue = Number(row.non_insurance_revenue) || 0

      if (!year || !month || month < 1 || month > 12) continue

      // 기존 레코드 확인
      const { data: existing } = await supabase
        .from('revenue_records')
        .select('id')
        .eq('clinic_id', clinic_id)
        .eq('year', year)
        .eq('month', month)
        .single()

      if (existing) {
        const { error } = await supabase
          .from('revenue_records')
          .update({
            insurance_revenue: insuranceRevenue,
            non_insurance_revenue: nonInsuranceRevenue,
            source_type: 'dentweb',
          })
          .eq('id', existing.id)

        if (!error) updatedCount++
      } else {
        const { error } = await supabase
          .from('revenue_records')
          .insert({
            clinic_id,
            year,
            month,
            insurance_revenue: insuranceRevenue,
            non_insurance_revenue: nonInsuranceRevenue,
            other_revenue: 0,
            source_type: 'dentweb',
          })

        if (!error) insertedCount++
      }
    }

    return NextResponse.json({
      success: true,
      inserted: insertedCount,
      updated: updatedCount,
      totalMonths: rows.length,
    })
  } catch (error) {
    console.error('[dentweb/revenue-sync/push POST]', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
