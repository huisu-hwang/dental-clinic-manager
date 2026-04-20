/**
 * 전략 감시 종목 (Watchlist) CRUD API
 *
 * GET    /api/investment/watchlist?strategyId=xxx - 전략별 감시 종목 목록
 * POST   /api/investment/watchlist - 감시 종목 추가
 * DELETE /api/investment/watchlist?id=xxx - 감시 종목 제거
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const KR_TICKER = /^\d{6}$/
const US_TICKER = /^[A-Z]{1,5}[.]?[A-Z]?$/

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const strategyId = new URL(request.url).searchParams.get('strategyId')
  if (!strategyId) return NextResponse.json({ error: 'strategyId가 필요합니다' }, { status: 400 })

  // 전략 소유권 확인
  const { data: strategy } = await supabase
    .from('investment_strategies')
    .select('id')
    .eq('id', strategyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!strategy) return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })

  const { data, error } = await supabase
    .from('strategy_watchlist')
    .select('*')
    .eq('strategy_id', strategyId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { strategyId, ticker, tickerName, market } = body
  if (!strategyId || typeof strategyId !== 'string') {
    return NextResponse.json({ error: 'strategyId가 필요합니다' }, { status: 400 })
  }
  if (!ticker || typeof ticker !== 'string') {
    return NextResponse.json({ error: 'ticker가 필요합니다' }, { status: 400 })
  }
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바른 시장을 선택해주세요' }, { status: 400 })
  }

  const tickerUpper = ticker.trim().toUpperCase()
  if (market === 'KR' && !KR_TICKER.test(tickerUpper)) {
    return NextResponse.json({ error: '국내 종목 코드는 6자리 숫자여야 합니다' }, { status: 400 })
  }
  if (market === 'US' && !US_TICKER.test(tickerUpper)) {
    return NextResponse.json({ error: '미국 종목 코드가 올바르지 않습니다' }, { status: 400 })
  }

  // 전략 소유권 확인
  const { data: strategy } = await supabase
    .from('investment_strategies')
    .select('id')
    .eq('id', strategyId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!strategy) return NextResponse.json({ error: '전략을 찾을 수 없습니다' }, { status: 404 })

  // 중복 체크
  const { data: existing } = await supabase
    .from('strategy_watchlist')
    .select('id')
    .eq('strategy_id', strategyId)
    .eq('ticker', tickerUpper)
    .eq('market', market)
    .maybeSingle()
  if (existing) return NextResponse.json({ error: '이미 추가된 종목입니다' }, { status: 400 })

  // 최대 20개 제한
  const { count } = await supabase
    .from('strategy_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('strategy_id', strategyId)
  if ((count ?? 0) >= 20) {
    return NextResponse.json({ error: '감시 종목은 최대 20개까지 추가 가능합니다' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('strategy_watchlist')
    .insert({
      strategy_id: strategyId,
      ticker: tickerUpper,
      ticker_name: typeof tickerName === 'string' ? tickerName : null,
      market,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '추가 실패' }, { status: 500 })
  return NextResponse.json({ data }, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) return NextResponse.json({ error: 'Server error' }, { status: 500 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 })

  // 소유권 확인 (전략 → 사용자)
  const { data: item } = await supabase
    .from('strategy_watchlist')
    .select('id, strategy_id, investment_strategies!inner(user_id)')
    .eq('id', id)
    .maybeSingle()

  const strategy = item?.investment_strategies as unknown as { user_id: string } | null
  if (!item || strategy?.user_id !== userId) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  const { error } = await supabase
    .from('strategy_watchlist')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ success: true })
}
