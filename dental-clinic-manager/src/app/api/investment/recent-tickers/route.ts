/**
 * 사용자 최근 사용 종목 — 서버 영속(투자 모듈 공용).
 *
 *   GET    /api/investment/recent-tickers
 *   POST   /api/investment/recent-tickers          { ticker, market, ticker_name? }
 *                                                  (upsert: last_used_at = now())
 *   POST   /api/investment/recent-tickers          { items: [...] }   (배치 업로드 — 마이그레이션용)
 *   DELETE /api/investment/recent-tickers?ticker=...&market=KR|US
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'

interface Row {
  ticker: string
  market: 'KR' | 'US'
  ticker_name: string | null
  last_used_at: string
}

const MAX_ITEMS = 24

function isMarket(v: unknown): v is 'KR' | 'US' {
  return v === 'KR' || v === 'US'
}

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 필요' }, { status: auth.status || 401 })
  }

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('investment_recent_tickers')
    .select('ticker, market, ticker_name, last_used_at')
    .order('last_used_at', { ascending: false })
    .limit(MAX_ITEMS)

  if (error) {
    console.error('[recent-tickers] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = ((data ?? []) as Row[]).map((r) => ({
    ticker: r.ticker,
    market: r.market,
    name: r.ticker_name ?? r.ticker,
    lastUsed: new Date(r.last_used_at).getTime(),
  }))
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 필요' }, { status: auth.status || 401 })
  }

  let body: { ticker?: string; market?: string; ticker_name?: string | null; items?: Array<{ ticker: string; market: string; ticker_name?: string | null; last_used_at?: string }> }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '본문 파싱 실패' }, { status: 400 })
  }

  const supabase = await createClient()
  const userId = auth.user.id

  // 배치 업로드 — localStorage 마이그레이션용
  if (Array.isArray(body.items)) {
    const rows = body.items
      .map((it) => ({
        ticker: (it.ticker ?? '').trim().toUpperCase(),
        market: it.market,
        ticker_name: it.ticker_name ?? null,
        last_used_at: it.last_used_at ?? new Date().toISOString(),
      }))
      .filter((r) => r.ticker && isMarket(r.market))
      .map((r) => ({ user_id: userId, ...r }))
      .slice(0, MAX_ITEMS * 4)
    if (rows.length === 0) return NextResponse.json({ ok: true, imported: 0 })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('investment_recent_tickers')
      .upsert(rows, { onConflict: 'user_id,ticker,market', ignoreDuplicates: false })
    if (error) {
      console.error('[recent-tickers] batch upsert error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, imported: rows.length })
  }

  const ticker = (body.ticker ?? '').trim().toUpperCase()
  const market = body.market
  if (!ticker) return NextResponse.json({ error: 'ticker 누락' }, { status: 400 })
  if (!isMarket(market)) return NextResponse.json({ error: 'market 잘못됨' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('investment_recent_tickers')
    .upsert(
      {
        user_id: userId,
        ticker,
        market,
        ticker_name: body.ticker_name ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,ticker,market', ignoreDuplicates: false },
    )
    .select('ticker, market, ticker_name, last_used_at')
    .single()

  if (error) {
    console.error('[recent-tickers] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    item: {
      ticker: data.ticker,
      market: data.market,
      name: data.ticker_name ?? data.ticker,
      lastUsed: new Date(data.last_used_at).getTime(),
    },
  })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 필요' }, { status: auth.status || 401 })
  }

  const { searchParams } = new URL(req.url)
  const ticker = (searchParams.get('ticker') ?? '').trim().toUpperCase()
  const market = searchParams.get('market')
  if (!ticker) return NextResponse.json({ error: 'ticker 누락' }, { status: 400 })
  if (!isMarket(market)) return NextResponse.json({ error: 'market 잘못됨' }, { status: 400 })

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('investment_recent_tickers')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('ticker', ticker)
    .eq('market', market)

  if (error) {
    console.error('[recent-tickers] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
