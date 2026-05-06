/**
 * 사용자 즐겨찾기 종목 CRUD.
 *
 *   GET    /api/investment/favorites
 *   POST   /api/investment/favorites          { ticker, market, ticker_name? }
 *   DELETE /api/investment/favorites?ticker=...&market=KR|US
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'

interface Row {
  ticker: string
  market: 'KR' | 'US'
  ticker_name: string | null
  created_at: string
  sort_order: number
}

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
    .from('investment_favorites')
    .select('ticker, market, ticker_name, created_at, sort_order')
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[favorites] GET error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const items = ((data ?? []) as Row[]).map((r) => ({
    ticker: r.ticker,
    market: r.market,
    tickerName: r.ticker_name,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 필요' }, { status: auth.status || 401 })
  }

  let body: { ticker?: string; market?: string; ticker_name?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '본문 파싱 실패' }, { status: 400 })
  }

  const ticker = (body.ticker ?? '').trim().toUpperCase()
  const market = body.market
  if (!ticker) return NextResponse.json({ error: 'ticker 누락' }, { status: 400 })
  if (!isMarket(market)) return NextResponse.json({ error: 'market 잘못됨' }, { status: 400 })

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('investment_favorites')
    .upsert(
      { user_id: auth.user.id, ticker, market, ticker_name: body.ticker_name ?? null },
      { onConflict: 'user_id,ticker,market', ignoreDuplicates: false },
    )
    .select('ticker, market, ticker_name, created_at')
    .single()

  if (error) {
    console.error('[favorites] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    item: {
      ticker: data.ticker,
      market: data.market,
      tickerName: data.ticker_name,
      createdAt: data.created_at,
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
    .from('investment_favorites')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('ticker', ticker)
    .eq('market', market)

  if (error) {
    console.error('[favorites] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
