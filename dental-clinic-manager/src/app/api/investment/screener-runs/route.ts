/**
 * 종목 스크리너 실행 히스토리 CRUD.
 *
 *   GET    /api/investment/screener-runs              → 목록 (직전 100개)
 *   GET    /api/investment/screener-runs?id=...       → 단건
 *   POST   /api/investment/screener-runs              → 저장
 *   DELETE /api/investment/screener-runs?id=...       → 삭제
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth/requireAuth'

interface MatchEntry {
  ticker: string
  market: 'KR' | 'US'
  name: string
  price: number
  asOfDate: string
  matchedConditions: string[]
  indicators: Record<string, unknown>
}

interface FailedEntry {
  ticker: string
  market: 'KR' | 'US'
  reason: string
}

interface RunBody {
  started_at?: string
  finished_at?: string
  status?: 'completed' | 'cancelled' | 'error'
  as_of_date: string
  universe: string
  universe_label?: string | null
  realtime?: boolean
  total_tickers?: number
  total_matches?: number
  strategy_keys: string[]
  strategy_names: Record<string, string>
  matches_by_strategy: Record<string, MatchEntry[]>
  failed_by_strategy: Record<string, FailedEntry[]>
  error_message?: string | null
}

const LIST_LIMIT = 100

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 필요' }, { status: auth.status || 401 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  const supabase = await createClient()

  if (id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('screener_runs')
      .select('*')
      .eq('id', id)
      .single()
    if (error) {
      if (error.code === 'PGRST116') {
        return NextResponse.json({ error: '존재하지 않습니다' }, { status: 404 })
      }
      console.error('[screener-runs] GET single error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ item: data })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('screener_runs')
    .select('id, started_at, finished_at, status, as_of_date, universe, universe_label, realtime, total_tickers, total_matches, strategy_keys, strategy_names')
    .order('started_at', { ascending: false })
    .limit(LIST_LIMIT)

  if (error) {
    console.error('[screener-runs] GET list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ items: data ?? [] })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 필요' }, { status: auth.status || 401 })
  }

  let body: RunBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '본문 파싱 실패' }, { status: 400 })
  }

  if (!body.as_of_date || !body.universe || !Array.isArray(body.strategy_keys)) {
    return NextResponse.json({ error: '필수 필드 누락 (as_of_date / universe / strategy_keys)' }, { status: 400 })
  }

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('screener_runs')
    .insert({
      user_id: auth.user.id,
      started_at: body.started_at ?? new Date().toISOString(),
      finished_at: body.finished_at ?? new Date().toISOString(),
      status: body.status ?? 'completed',
      as_of_date: body.as_of_date,
      universe: body.universe,
      universe_label: body.universe_label ?? null,
      realtime: body.realtime ?? false,
      total_tickers: body.total_tickers ?? 0,
      total_matches: body.total_matches ?? 0,
      strategy_keys: body.strategy_keys,
      strategy_names: body.strategy_names ?? {},
      matches_by_strategy: body.matches_by_strategy ?? {},
      failed_by_strategy: body.failed_by_strategy ?? {},
      error_message: body.error_message ?? null,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[screener-runs] POST error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data.id })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 필요' }, { status: auth.status || 401 })
  }
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 누락' }, { status: 400 })

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('screener_runs')
    .delete()
    .eq('id', id)
    .eq('user_id', auth.user.id)

  if (error) {
    console.error('[screener-runs] DELETE error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
