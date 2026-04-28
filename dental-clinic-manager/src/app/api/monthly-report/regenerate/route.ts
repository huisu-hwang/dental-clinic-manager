import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerSupabase } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { generateMonthlyReport } from '@/lib/monthlyReportService'
import { computePreviousMonthKst } from '@/types/monthlyReport'

const MANAGE_ROLES = ['owner', 'master_admin']

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('users')
    .select('id, clinic_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || !MANAGE_ROLES.includes(profile.role as string)) {
    return NextResponse.json({ error: '대표원장만 수동 재생성이 가능합니다' }, { status: 403 })
  }

  if (!profile.clinic_id) {
    return NextResponse.json({ error: '소속 클리닉 정보가 없습니다' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({})) as { year?: number; month?: number }
  let year = body.year
  let month = body.month
  if (!year || !month) {
    const prev = computePreviousMonthKst(new Date())
    year = prev.year
    month = prev.month
  }

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'year/month 값이 잘못되었습니다' }, { status: 400 })
  }

  // service role 클라이언트로 RLS 우회 (소유자 확인은 위에서 끝남)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 })
  }
  const adminClient = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const report = await generateMonthlyReport({
      supabase: adminClient,
      clinicId: profile.clinic_id as string,
      year,
      month,
      generatedBy: 'manual',
    })
    return NextResponse.json({ success: true, report })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[monthly-report regenerate] failed:', message)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
