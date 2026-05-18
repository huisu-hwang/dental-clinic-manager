import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { searchKRTicker } from '@/lib/krTickerDict'
import { searchUSTicker } from '@/lib/usTickerDict'

export const dynamic = 'force-dynamic'

const TICKER_PATTERN = /^([0-9]{6}|[A-Z][A-Z0-9.\-]*)$/

function resolveTicker(input: string): { ticker: string; resolved_name?: string } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // 1. ticker 형식이면 그대로 사용
  const upper = trimmed.toUpperCase()
  if (TICKER_PATTERN.test(upper)) {
    return { ticker: upper }
  }

  // 2. 종목 이름 → ticker dict 검색 (KR 우선, 그 다음 US)
  const krMatch = searchKRTicker(trimmed, 1)[0]
  if (krMatch) return { ticker: krMatch.ticker, resolved_name: krMatch.name }
  const usMatch = searchUSTicker(trimmed, 1)[0]
  if (usMatch) return { ticker: usMatch.ticker, resolved_name: usMatch.name }

  return null
}

export async function POST(req: Request) {
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const body = (await req.json().catch(() => ({}))) as { ticker?: string }
  const rawInput = (body.ticker ?? '').trim()
  if (!rawInput || rawInput.length > 30) {
    return NextResponse.json({ error: '종목 코드 또는 이름은 1~30자 필수' }, { status: 400 })
  }

  const resolved = resolveTicker(rawInput)
  if (!resolved) {
    return NextResponse.json({
      error: `'${rawInput}' 을 찾을 수 없습니다. 종목 코드(예: 005930, AAPL) 또는 정확한 이름(예: 삼성전자, Apple)을 입력하세요`,
    }, { status: 400 })
  }
  const raw = resolved.ticker
  const resolvedName = resolved.resolved_name

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
      data: { job_id: pending.id, status: pending.status, ticker: raw, resolved_name: resolvedName, already_running: true },
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
      resolved_name: resolvedName,
      has_existing_result: !!existing,
    },
  })
}
