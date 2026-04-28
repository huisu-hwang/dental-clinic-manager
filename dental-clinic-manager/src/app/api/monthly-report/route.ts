import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchMonthlyReport, fetchAvailableReportMonths } from '@/lib/monthlyReportService'

const ALLOWED_ROLES = ['owner', 'manager', 'vice_director', 'master_admin']

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return NextResponse.json({ error: '사용자 정보를 불러올 수 없습니다' }, { status: 403 })
  }

  if (!ALLOWED_ROLES.includes(profile.role as string)) {
    return NextResponse.json({ error: '접근 권한이 없습니다' }, { status: 403 })
  }

  if (!profile.clinic_id) {
    return NextResponse.json({ error: '소속 클리닉 정보가 없습니다' }, { status: 400 })
  }

  const url = new URL(request.url)
  const yearStr = url.searchParams.get('year')
  const monthStr = url.searchParams.get('month')

  // 사용 가능한 보고서 월 목록 요청
  if (url.searchParams.get('list') === '1') {
    const months = await fetchAvailableReportMonths(supabase, profile.clinic_id as string, 24)
    return NextResponse.json({ months })
  }

  let year: number
  let month: number
  if (yearStr && monthStr) {
    year = parseInt(yearStr, 10)
    month = parseInt(monthStr, 10)
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'year/month 파라미터가 잘못되었습니다' }, { status: 400 })
    }
  } else {
    // 가장 최근 보고서 자동 선택
    const months = await fetchAvailableReportMonths(supabase, profile.clinic_id as string, 1)
    if (months.length === 0) {
      return NextResponse.json({ report: null, available_months: [] })
    }
    year = months[0].year
    month = months[0].month
  }

  const report = await fetchMonthlyReport(supabase, profile.clinic_id as string, year, month)
  const availableMonths = await fetchAvailableReportMonths(supabase, profile.clinic_id as string, 24)

  return NextResponse.json({ report, available_months: availableMonths })
}
