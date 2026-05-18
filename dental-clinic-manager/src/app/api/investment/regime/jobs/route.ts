import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

interface JobRow {
  id: number
  scope_type: string
  scope_id: string
  status: string
  requested_at: string
  finished_at: string | null
  error: string | null
}

interface RunRow {
  scope_id: string
  current_state: string
  current_confidence: number
  as_of_date: string
}

export async function GET(req: Request) {
  const auth = await requireAuth(['owner', 'vice_director', 'manager'])
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const url = new URL(req.url)
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '30', 10) || 30, 1), 100)

  const sb = getSupabaseAdmin()
  if (!sb) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const { data: jobs, error: jobsErr } = await sb
    .from('regime_jobs')
    .select('id, scope_type, scope_id, status, requested_at, finished_at, error')
    .eq('user_id', auth.user.id)
    .eq('scope_type', 'ticker')
    .order('requested_at', { ascending: false })
    .limit(limit)

  if (jobsErr) {
    return NextResponse.json({ error: jobsErr.message }, { status: 500 })
  }

  const tickers = Array.from(new Set((jobs ?? []).map(j => j.scope_id)))
  let runs: RunRow[] = []
  if (tickers.length > 0) {
    const { data, error } = await sb
      .from('regime_runs')
      .select('scope_id, current_state, current_confidence, as_of_date')
      .eq('scope_type', 'ticker')
      .in('scope_id', tickers)
      .order('as_of_date', { ascending: false })
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    runs = (data ?? []) as RunRow[]
  }
  // 각 ticker 별 최신 run 만
  const latestByTicker = new Map<string, RunRow>()
  for (const r of runs) {
    if (!latestByTicker.has(r.scope_id)) latestByTicker.set(r.scope_id, r)
  }

  const merged = (jobs ?? []).map((j: JobRow) => {
    const run = latestByTicker.get(j.scope_id)
    return {
      job_id: j.id,
      ticker: j.scope_id,
      status: j.status,
      requested_at: j.requested_at,
      finished_at: j.finished_at,
      error: j.error,
      result: run ? {
        state: run.current_state,
        confidence: run.current_confidence,
        as_of_date: run.as_of_date,
      } : null,
    }
  })

  return NextResponse.json({ data: merged })
}
