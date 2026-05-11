import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { KR_TICKER_DICT } from '@/lib/krTickerDict'

const WATCHLIST_LIMIT = 10

/** ticker → 종목명 lookup (한국 종목용). 못 찾으면 null. */
const krNameByTicker: Map<string, string> = new Map(
  KR_TICKER_DICT.map((e) => [e.ticker, e.name] as const),
)
function resolveKrName(ticker: string): string | null {
  return krNameByTicker.get(ticker) ?? null
}

interface RawWatchlistRow {
  id: string
  user_id: string
  ticker: string
  name: string | null
  market: 'KR' | 'US'
  monitoring_enabled: boolean
  trigger_price_change_pct: number | null
  trigger_volume_multiplier: number | null
  created_at: string
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  const admin = getSupabaseAdmin()!
  const { data: items } = await admin
    .from('psychology_watchlist')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })

  const rows = (items ?? []) as RawWatchlistRow[]

  // 기존 데이터 백필: name이 비어있는 한국 종목은 사전(dictionary)으로 채워서 DB도 업데이트.
  // (US 종목명은 사전 lookup 정확도가 낮아 fallback 없이 ticker 표시)
  const backfillTargets = rows.filter((r) => !r.name && r.market === 'KR')
  if (backfillTargets.length > 0) {
    await Promise.all(
      backfillTargets.map(async (r) => {
        const resolved = resolveKrName(r.ticker)
        if (!resolved) return
        r.name = resolved
        await admin.from('psychology_watchlist').update({ name: resolved }).eq('id', r.id)
      }),
    )
  }

  const tickers = rows.map((r) => r.ticker)
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

  const out = rows.map((r) => ({
    ...r,
    latest_analysis: latestMap.get(`${r.ticker}:${r.market}`) ?? null,
  }))
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => null) as { ticker?: string; name?: string; market?: string } | null
  const ticker = body?.ticker?.trim().toUpperCase()
  const market = body?.market === 'KR' || body?.market === 'US' ? body.market : null
  if (!ticker || !market) return NextResponse.json({ error: 'ticker, market 필수' }, { status: 400 })

  // name: 클라이언트가 전달한 값 우선 → 없으면 KR 사전 lookup → 그래도 없으면 NULL.
  const providedName = body?.name?.trim()
  const resolvedName = providedName || (market === 'KR' ? resolveKrName(ticker) : null)

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
    .insert({ user_id: auth.user.id, ticker, market, name: resolvedName })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
  const admin = getSupabaseAdmin()!
  const { error } = await admin.from('psychology_watchlist').delete()
    .eq('id', id).eq('user_id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
