// ============================================
// DentWeb 매출 동기화 API
// POST: 매출 집계 쿼리를 dentweb_query_requests에 등록
// GET: 쿼리 결과 확인 후 revenue_records 업데이트
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}

// DentWeb TB_진료비내역에서 월별 매출을 집계하는 SQL 쿼리
function buildRevenueQuery(startDate: string): string {
  return `SELECT
  LEFT(sz진료일, 4) AS [year],
  SUBSTRING(sz진료일, 5, 2) AS [month],
  SUM(ISNULL(n공단부담금, 0) + ISNULL(n본인부담금, 0)) AS insurance_revenue,
  SUM(ISNULL(n비급여진료비, 0)) AS non_insurance_revenue,
  COUNT(*) AS record_count
FROM TB_진료비내역
WHERE sz진료일 >= '${startDate}'
  AND sz진료일 <= CONVERT(char(8), GETDATE(), 112)
GROUP BY LEFT(sz진료일, 4), SUBSTRING(sz진료일, 5, 2)
ORDER BY LEFT(sz진료일, 4), SUBSTRING(sz진료일, 5, 2)`
}

// POST: 매출 동기화 쿼리 등록
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinicId, startDate } = body

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // dentweb_sync_config에서 브릿지 에이전트 연결 상태 확인
    const { data: config } = await supabase
      .from('dentweb_sync_config')
      .select('is_active, last_sync_at, last_sync_status')
      .eq('clinic_id', clinicId)
      .single()

    if (!config) {
      return NextResponse.json(
        { error: '덴트웹 브릿지 에이전트가 설정되지 않았습니다.' },
        { status: 404 }
      )
    }

    // 기본 시작일: 올해 1월 1일
    const now = new Date()
    const defaultStartDate = `${now.getFullYear()}0101`
    const queryStartDate = startDate || defaultStartDate

    const queryText = buildRevenueQuery(queryStartDate)

    // dentweb_query_requests에 쿼리 등록
    const { data: queryRequest, error: insertError } = await supabase
      .from('dentweb_query_requests')
      .insert({
        clinic_id: clinicId,
        query_type: 'read',
        query_text: queryText,
        params: { purpose: 'revenue_sync', start_date: queryStartDate },
        status: 'pending',
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5분 후 만료
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('[dentweb/revenue-sync] Insert error:', insertError)
      return NextResponse.json(
        { error: '쿼리 등록에 실패했습니다: ' + insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      requestId: queryRequest.id,
      message: '매출 동기화 쿼리가 등록되었습니다. 브릿지 에이전트가 처리합니다.',
    })
  } catch (error) {
    console.error('[dentweb/revenue-sync POST]', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

// GET: 쿼리 결과 확인 및 revenue_records 업데이트
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const clinicId = searchParams.get('clinicId')
    const requestId = searchParams.get('requestId')

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // requestId가 있으면 특정 쿼리 결과 확인
    if (requestId) {
      return await checkAndProcessResult(supabase, clinicId, requestId)
    }

    // requestId가 없으면 최신 revenue_sync 쿼리 결과 확인
    const { data: latestRequest } = await supabase
      .from('dentweb_query_requests')
      .select('id, status, created_at')
      .eq('clinic_id', clinicId)
      .contains('params', { purpose: 'revenue_sync' })
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!latestRequest) {
      return NextResponse.json({
        success: true,
        status: 'no_request',
        message: '매출 동기화 요청이 없습니다.',
      })
    }

    return await checkAndProcessResult(supabase, clinicId, latestRequest.id)
  } catch (error) {
    console.error('[dentweb/revenue-sync GET]', error)
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}

async function checkAndProcessResult(
  supabase: ReturnType<typeof getServiceClient>,
  clinicId: string,
  requestId: string
) {
  // 쿼리 요청 상태 확인
  const { data: queryReq } = await supabase
    .from('dentweb_query_requests')
    .select('id, status, created_at')
    .eq('id', requestId)
    .single()

  if (!queryReq) {
    return NextResponse.json({ error: '쿼리 요청을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (queryReq.status === 'pending') {
    return NextResponse.json({
      success: true,
      status: 'pending',
      requestId,
      message: '브릿지 에이전트가 쿼리를 처리 중입니다...',
    })
  }

  // 결과 조회
  const { data: queryResult } = await supabase
    .from('dentweb_query_results')
    .select('data, row_count, error_message')
    .eq('request_id', requestId)
    .single()

  if (!queryResult) {
    return NextResponse.json({
      success: true,
      status: 'no_result',
      requestId,
      message: '쿼리 결과가 아직 없습니다.',
    })
  }

  if (queryResult.error_message) {
    return NextResponse.json({
      success: false,
      status: 'error',
      error: queryResult.error_message,
    })
  }

  // 결과 데이터 처리 → revenue_records 업데이트
  const rows = queryResult.data as Array<{
    year: string
    month: string
    insurance_revenue: number
    non_insurance_revenue: number
    record_count: number
  }>

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      success: true,
      status: 'completed',
      message: '매출 데이터가 없습니다.',
      updated: 0,
    })
  }

  let updatedCount = 0
  let insertedCount = 0

  for (const row of rows) {
    const year = parseInt(row.year)
    const month = parseInt(row.month)
    const insuranceRevenue = Number(row.insurance_revenue) || 0
    const nonInsuranceRevenue = Number(row.non_insurance_revenue) || 0

    if (!year || !month || month < 1 || month > 12) continue

    // 기존 레코드 확인
    const { data: existing } = await supabase
      .from('revenue_records')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('year', year)
      .eq('month', month)
      .single()

    if (existing) {
      // UPDATE
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
      // INSERT
      const { error } = await supabase
        .from('revenue_records')
        .insert({
          clinic_id: clinicId,
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
    status: 'completed',
    message: `매출 동기화 완료: ${insertedCount}건 생성, ${updatedCount}건 갱신`,
    inserted: insertedCount,
    updated: updatedCount,
    totalMonths: rows.length,
    data: rows,
  })
}
