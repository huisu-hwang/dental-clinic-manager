/**
 * Strategy Matrix 조회 API
 *
 * GET /api/investment/matrix/query
 *   ?market=KR|US|ALL              (default ALL)
 *   &period_window=1Y|3Y|5Y|10Y     (default 5Y)
 *   &tickers=005930,000660          (optional, 콤마구분)
 *   &entry_ids=rsi-oversold,uuid    (optional, 콤마구분 — preset_id 또는 strategy UUID)
 *   &entry_type=preset|shared       (optional)
 *   &sector=반도체                   (optional, market=KR/US 조합)
 *   &limit=500                      (default 500, max 5000)
 *   &include_curve=1                (default 0 — 응답 가벼움)
 *
 * 응답: { data: MatrixRow[] }
 *
 * 사용자가 ad-hoc 백테스트 없이 사전계산 결과를 즉시 조회.
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const ALLOWED_WINDOWS = new Set(['1Y', '3Y', '5Y', '10Y'])
const MAX_LIMIT = 5000

export async function GET(req: Request) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const url = new URL(req.url)
  const market = (url.searchParams.get('market') ?? 'ALL').toUpperCase()
  const periodWindow = url.searchParams.get('period_window') ?? '5Y'
  const tickersParam = url.searchParams.get('tickers')
  const entryIdsParam = url.searchParams.get('entry_ids')
  const entryType = url.searchParams.get('entry_type')
  const sector = url.searchParams.get('sector')
  const includeCurve = url.searchParams.get('include_curve') === '1'
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') ?? '500', 10) || 500, 1), MAX_LIMIT)

  if (!ALLOWED_WINDOWS.has(periodWindow)) {
    return NextResponse.json({ error: `period_window must be one of ${[...ALLOWED_WINDOWS].join(', ')}` }, { status: 400 })
  }
  if (!['KR', 'US', 'ALL'].includes(market)) {
    return NextResponse.json({ error: 'market must be KR | US | ALL' }, { status: 400 })
  }

  const columns = [
    'id', 'entry_type', 'entry_id', 'market', 'ticker', 'sector', 'period_window',
    'start_date', 'end_date', 'initial_capital',
    'total_return', 'annualized_return', 'max_drawdown', 'sharpe_ratio',
    'win_rate', 'profit_factor', 'total_trades', 'buy_hold_return',
    'engine_version', 'computed_at',
    ...(includeCurve ? ['equity_curve_compact'] : []),
  ].join(', ')

  let q = supabase
    .from('strategy_matrix_runs')
    .select(columns)
    .eq('period_window', periodWindow)
    .order('total_return', { ascending: false })
    .limit(limit)

  if (market !== 'ALL') q = q.eq('market', market)
  if (entryType) q = q.eq('entry_type', entryType)
  if (sector) q = q.eq('sector', sector)
  if (tickersParam) {
    const tickers = tickersParam.split(',').map(s => s.trim()).filter(Boolean)
    if (tickers.length > 0) q = q.in('ticker', tickers)
  }
  if (entryIdsParam) {
    const ids = entryIdsParam.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length > 0) q = q.in('entry_id', ids)
  }

  const { data, error } = await q
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
