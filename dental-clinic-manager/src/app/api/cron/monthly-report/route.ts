// 월간 성과 보고서 자동 생성 크론
// Vercel Cron schedule: "0 15 1 * *" → 매월 1일 KST 00:00에 실행 (UTC 15:00 = KST 00:00)
// 단, Vercel은 UTC 기준이므로 "0 15 1 * *"는 매월 1일 UTC 15:00 = 매월 1일 KST 24:00 = 매월 2일 KST 00:00
// 따라서 매월 마지막 날 UTC 15:00 = 매월 1일 KST 00:00 → "0 15 28-31 * *" + 코드 내에서 "내일이 1일인지" 체크
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateMonthlyReport } from '@/lib/monthlyReportService'
import { computePreviousMonthKst } from '@/types/monthlyReport'

export const maxDuration = 60

interface ClinicRow {
  id: string
  name: string
}

interface UserRow {
  id: string
  clinic_id: string
  role: string
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const isVercelCron = request.headers.get('x-vercel-cron') === '1'

  // 인증: Vercel Cron 또는 CRON_SECRET 헤더
  if (!isVercelCron) {
    if (!cronSecret || authHeader !== `Bearer ${cronSecret.trim()}`) {
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ success: false, error: 'Supabase configuration missing' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // 매일 실행되어도 1일 KST에만 실제 작업하도록 가드
  const url = new URL(request.url)
  const force = url.searchParams.get('force') === '1'
  const yearOverride = url.searchParams.get('year')
  const monthOverride = url.searchParams.get('month')

  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const kstDay = nowKst.getUTCDate()
  if (!force && !yearOverride && kstDay !== 1) {
    return NextResponse.json({
      success: true,
      skipped: true,
      reason: `KST day is ${kstDay}, not 1. Skipping.`,
      timestamp: new Date().toISOString(),
    })
  }

  // 직전 월 계산 (yearOverride/monthOverride 있으면 사용)
  let targetYear: number
  let targetMonth: number
  if (yearOverride && monthOverride) {
    targetYear = parseInt(yearOverride, 10)
    targetMonth = parseInt(monthOverride, 10)
  } else {
    const prev = computePreviousMonthKst(new Date())
    targetYear = prev.year
    targetMonth = prev.month
  }

  // 모든 활성 클리닉 조회
  const { data: clinics, error: clinicsError } = await supabase
    .from('clinics')
    .select('id, name')

  if (clinicsError || !clinics) {
    return NextResponse.json(
      { success: false, error: `clinics fetch error: ${clinicsError?.message ?? 'unknown'}` },
      { status: 500 },
    )
  }

  const results: Array<{ clinic_id: string; clinic_name: string; status: 'ok' | 'error'; error?: string }> = []
  let notifiedCount = 0

  for (const clinic of clinics as ClinicRow[]) {
    try {
      await generateMonthlyReport({
        supabase,
        clinicId: clinic.id,
        year: targetYear,
        month: targetMonth,
        generatedBy: 'cron',
      })

      // owner/manager에게 알림 전송
      const { data: targetUsers } = await supabase
        .from('users')
        .select('id, clinic_id, role')
        .eq('clinic_id', clinic.id)
        .in('role', ['owner', 'manager'])

      const linkPath = `/dashboard/monthly-report?year=${targetYear}&month=${targetMonth}`
      const monthLabel = `${targetYear}년 ${targetMonth}월`
      const title = `${monthLabel} 성과 보고서가 도착했습니다`
      const content = `매출, 신환 수, 유입 경로, 연령대 분석을 한눈에 확인하세요.`

      const notificationRows = (targetUsers ?? []).map((user: UserRow) => ({
        clinic_id: clinic.id,
        user_id: user.id,
        type: 'monthly_report_ready',
        title,
        content,
        link: linkPath,
        reference_type: 'monthly_report',
        is_read: false,
      }))
      if (notificationRows.length > 0) {
        const { error: notifyError, count } = await supabase
          .from('user_notifications')
          .insert(notificationRows, { count: 'exact' })
        if (!notifyError) notifiedCount += count ?? notificationRows.length
        else console.error('[monthly-report cron] notify error:', notifyError)
      }

      results.push({ clinic_id: clinic.id, clinic_name: clinic.name, status: 'ok' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[monthly-report cron] clinic ${clinic.id} failed:`, message)
      results.push({ clinic_id: clinic.id, clinic_name: clinic.name, status: 'error', error: message })
    }
  }

  return NextResponse.json({
    success: true,
    target_year: targetYear,
    target_month: targetMonth,
    clinic_count: clinics.length,
    success_count: results.filter((r) => r.status === 'ok').length,
    error_count: results.filter((r) => r.status === 'error').length,
    notified_count: notifiedCount,
    results,
    timestamp: new Date().toISOString(),
  })
}
