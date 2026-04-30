import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

/**
 * POST: 특정 월 또는 전체 과거 데이터 수입 동기화 요청
 * - mode: 'single' (단일 월), 'backfill' (직전 N개월), 'all' (덴트웹의 모든 과거 매출)
 * - months_back: backfill 모드에서 직전 몇 개월을 채울지 (1~360, default 24)
 *   * all 모드는 360개월(30년) 윈도우로 자동 확장하여 사실상 모든 데이터를 끌어온다
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { clinic_id, mode, year, month, months_back } = body

    if (!clinic_id) {
      return NextResponse.json({ success: false, error: 'clinic_id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // dentweb_sync_config 확인
    const { data: syncConfig } = await supabase
      .from('dentweb_sync_config')
      .select('id, pending_revenue_months, is_active')
      .eq('clinic_id', clinic_id)
      .eq('is_active', true)
      .maybeSingle()

    if (!syncConfig) {
      return NextResponse.json({ success: false, error: '덴트웹 연동이 활성화되지 않았습니다.' }, { status: 404 })
    }

    const existing = (syncConfig.pending_revenue_months || []) as Array<{ year: number; month: number }>

    let newMonths: Array<{ year: number; month: number }> = []

    if (mode === 'backfill' || mode === 'all') {
      // backfill: 직전 N개월 (default 24, 최대 360 = 30년)
      // all: 360개월 강제 (덴트웹에 있는 사실상 모든 매출)
      const defaultBack = mode === 'all' ? 360 : 24
      const requestedBack = Number.isFinite(Number(months_back)) ? parseInt(months_back) : defaultBack
      const monthsBack = Math.max(1, Math.min(360, requestedBack))
      const now = new Date()
      for (let i = monthsBack; i >= 1; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        newMonths.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
      }
      // 현재월도 포함 (덴트웹 워커가 진행 중인 월의 누적 매출 갱신)
      newMonths.push({ year: now.getFullYear(), month: now.getMonth() + 1 })
    } else {
      // 단일 월
      if (!year || !month) {
        return NextResponse.json({ success: false, error: 'year와 month가 필요합니다.' }, { status: 400 })
      }
      newMonths = [{ year: parseInt(year), month: parseInt(month) }]
    }

    // 이미 revenue_records에 있는 월은 제외
    const { data: existingRevenues } = await supabase
      .from('revenue_records')
      .select('year, month')
      .eq('clinic_id', clinic_id)

    const existingSet = new Set(
      (existingRevenues || []).map((r: { year: number; month: number }) => `${r.year}-${r.month}`)
    )

    // 기존 pending + 새 요청 합치기 (중복 제거)
    const allPending = [...existing]
    for (const m of newMonths) {
      const key = `${m.year}-${m.month}`
      if (existingSet.has(key)) continue // 이미 데이터 있음
      if (allPending.some(p => p.year === m.year && p.month === m.month)) continue // 이미 pending
      allPending.push(m)
    }

    await supabase
      .from('dentweb_sync_config')
      .update({ pending_revenue_months: allPending })
      .eq('id', syncConfig.id)

    const addedCount = allPending.length - existing.length

    return NextResponse.json({
      success: true,
      data: {
        added_count: addedCount,
        total_pending: allPending.length,
        pending_months: allPending,
      },
    })
  } catch (error) {
    console.error('[dentweb/request-revenue-sync] Error:', error)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
