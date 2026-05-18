import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const body = (await req.json().catch(() => ({}))) as { ticker?: string }
  const raw = (body.ticker ?? '').trim().toUpperCase()
  if (!raw || raw.length > 12) {
    return NextResponse.json({ error: 'ticker 는 1~12자 필수' }, { status: 400 })
  }
  // 6자리 숫자(KR) 또는 알파벳·점·하이픈(US) 만 허용
  if (!/^([0-9]{6}|[A-Z][A-Z0-9.\-]*)$/.test(raw)) {
    return NextResponse.json({ error: 'ticker 형식 오류 (예: 005930 또는 AAPL)' }, { status: 400 })
  }

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  // 이미 학습된 결과 있으면 status='done' 으로 즉시 마킹
  const { data: existing } = await sb
    .from('regime_runs')
    .select('id, as_of_date')
    .eq('scope_type', 'ticker')
    .eq('scope_id', raw)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 진행 중 큐가 있는지 확인 (중복 방지)
  const { data: pending } = await sb
    .from('regime_jobs')
    .select('id, status')
    .eq('scope_type', 'ticker')
    .eq('scope_id', raw)
    .in('status', ['queued', 'running'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pending) {
    return NextResponse.json({
      data: { job_id: pending.id, status: pending.status, ticker: raw, already_running: true },
    })
  }

  const { data: inserted, error } = await sb
    .from('regime_jobs')
    .insert({
      user_id: auth.user.id,
      scope_type: 'ticker',
      scope_id: raw,
      job_type: 'ticker_analyze',
      status: 'queued',
    })
    .select('id, status')
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message ?? 'insert 실패' }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      job_id: inserted.id,
      status: inserted.status,
      ticker: raw,
      has_existing_result: !!existing,
    },
  })
}
