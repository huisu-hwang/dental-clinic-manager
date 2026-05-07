import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const WATCHLIST_LIMIT = 10

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const admin = getSupabaseAdmin()!
  const { data: items } = await admin
    .from('psychology_watchlist')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })

  const tickers = (items ?? []).map(i => (i as { ticker: string }).ticker)
  const { data: latestAnalyses } = tickers.length
    ? await admin
        .from('psychology_analyses')
        .select('id, ticker, market, psychology_score, score_label, tags, created_at')
        .eq('user_id', auth.user.id)
        .in('ticker', tickers)
        .order('created_at', { ascending: false })
    : { data: [] }

  const latestMap = new Map<string, unknown>()
  for (const a of (latestAnalyses ?? []) as Array<{ ticker: string; market: string }>) {
    const key = `${a.ticker}:${a.market}`
    if (!latestMap.has(key)) latestMap.set(key, a)
  }

  const out = (items ?? []).map((it) => {
    const item = it as { ticker: string; market: string }
    return { ...item, latest_analysis: latestMap.get(`${item.ticker}:${item.market}`) ?? null }
  })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const body = await req.json().catch(() => null) as { ticker?: string; market?: string } | null
  const ticker = body?.ticker?.trim().toUpperCase()
  const market = body?.market === 'KR' || body?.market === 'US' ? body.market : null
  if (!ticker || !market) return NextResponse.json({ error: 'ticker, market 필수' }, { status: 400 })

  const admin = getSupabaseAdmin()!
  const { count } = await admin
    .from('psychology_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
  if ((count ?? 0) >= WATCHLIST_LIMIT) {
    return NextResponse.json({ error: `워치리스트는 최대 ${WATCHLIST_LIMIT}개까지 등록 가능합니다.` }, { status: 400 })
  }

  const { data, error } = await admin
    .from('psychology_watchlist')
    .insert({ user_id: auth.user.id, ticker, market })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
  const admin = getSupabaseAdmin()!
  const { error } = await admin.from('psychology_watchlist').delete()
    .eq('id', id).eq('user_id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
