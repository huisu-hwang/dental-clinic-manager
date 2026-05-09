/**
 * 공유 전략 랭킹 — 항목별 상위 N
 *
 * GET /api/investment/strategies/rankings?market=KR|US|ALL&sortBy=...&limit=50
 *
 * sortBy 종류:
 *   avgReturn (평균 수익률, default), bestReturn (최고 수익률),
 *   avgWinRate, avgSharpe, profitFactor, avgMDD (낮은 순),
 *   totalTrades (안정성 — 거래 많은 순), cloneCount (인기)
 *
 * 통계 출처: backtest_runs (status=completed) — 원본 작성자의 모든 백테스트 기록 집계.
 *           최소 3회 이상 백테스트 기록이 있는 전략만 노출 (의미있는 통계 확보).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const SORT_KEYS = new Set([
  'avgReturn', 'bestReturn', 'avgWinRate', 'avgSharpe',
  'avgPF', 'avgMDD', 'totalTrades', 'cloneCount',
])
type SortKey =
  | 'avgReturn' | 'bestReturn' | 'avgWinRate' | 'avgSharpe'
  | 'avgPF' | 'avgMDD' | 'totalTrades' | 'cloneCount'

interface SharedStrategyRanking {
  strategyId: string
  name: string
  description: string | null
  targetMarket: 'KR' | 'US'
  authorAlias: string
  sharedAt: string | null
  cloneCount: number
  isMine: boolean
  // 백테스트 집계 통계
  runs: number
  tickerCount: number
  avgReturn: number
  bestReturn: number
  worstReturn: number
  avgWinRate: number
  avgSharpe: number
  avgMDD: number
  avgPF: number
  totalTrades: number
  lastRunAt: string | null
}

const MIN_RUNS_FOR_RANKING = 3

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  const { searchParams } = new URL(req.url)
  const market = (searchParams.get('market') ?? 'ALL').toUpperCase()
  const sortByRaw = (searchParams.get('sortBy') ?? 'avgReturn').toString()
  const sortBy: SortKey = (SORT_KEYS.has(sortByRaw) ? sortByRaw : 'avgReturn') as SortKey
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 5), 200)

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  // 1. 공유된 전략 + 작성자 정보 조회
  let q = supabase
    .from('investment_strategies')
    .select('id, user_id, name, description, target_market, indicators, shared_at, share_alias, clone_count')
    .eq('is_shared', true)
  if (market === 'KR' || market === 'US') {
    q = q.eq('target_market', market)
  }
  const { data: sharedRaw, error: shareErr } = await q.limit(500)
  if (shareErr) {
    return NextResponse.json({ error: shareErr.message }, { status: 500 })
  }
  const shared = (sharedRaw ?? []) as Array<{
    id: string
    user_id: string
    name: string
    description: string | null
    target_market: 'KR' | 'US'
    indicators: unknown
    shared_at: string | null
    share_alias: string | null
    clone_count: number | null
  }>

  if (shared.length === 0) {
    return NextResponse.json({ data: [], totalShared: 0 })
  }

  // 2. 작성자 이름 매핑 (users.name)
  const userIds = Array.from(new Set(shared.map(s => s.user_id)))
  const { data: usersRaw } = await supabase
    .from('users')
    .select('id, name, hospital_name')
    .in('id', userIds)
  const userMap = new Map<string, { name: string | null; hospital_name: string | null }>()
  for (const u of (usersRaw ?? []) as Array<{ id: string; name: string | null; hospital_name: string | null }>) {
    userMap.set(u.id, { name: u.name, hospital_name: u.hospital_name })
  }

  // 3. 백테스트 통계 집계 — strategy_id 가 공유 전략 ID 인 모든 run
  const strategyIds = shared.map(s => s.id)
  const { data: runsRaw } = await supabase
    .from('backtest_runs')
    .select('strategy_id, ticker, total_return, win_rate, max_drawdown, sharpe_ratio, profit_factor, total_trades, executed_at')
    .in('strategy_id', strategyIds)
    .eq('status', 'completed')
    .limit(20000)

  type RunRow = {
    strategy_id: string
    ticker: string
    total_return: number | null
    win_rate: number | null
    max_drawdown: number | null
    sharpe_ratio: number | null
    profit_factor: number | null
    total_trades: number | null
    executed_at: string | null
  }
  const runs = (runsRaw ?? []) as RunRow[]

  const byStrategy = new Map<string, RunRow[]>()
  for (const r of runs) {
    const arr = byStrategy.get(r.strategy_id) ?? []
    arr.push(r)
    byStrategy.set(r.strategy_id, arr)
  }

  // 4. 랭킹 항목 빌드
  const items: SharedStrategyRanking[] = []
  for (const s of shared) {
    const sRuns = byStrategy.get(s.id) ?? []
    if (sRuns.length < MIN_RUNS_FOR_RANKING) continue

    const returns = sRuns.map(r => Number(r.total_return ?? 0))
    const winRates = sRuns.map(r => Number(r.win_rate ?? 0))
    const sharpes = sRuns.map(r => Number(r.sharpe_ratio ?? 0))
    const mdds = sRuns.map(r => Number(r.max_drawdown ?? 0))
    const pfs = sRuns.map(r => Number(r.profit_factor ?? 0)).filter(v => isFinite(v) && v > 0)
    const trades = sRuns.reduce((sum, r) => sum + Number(r.total_trades ?? 0), 0)
    const tickers = new Set(sRuns.map(r => r.ticker))
    const lastRunAt = sRuns
      .map(r => r.executed_at)
      .filter((x): x is string => Boolean(x))
      .sort()
      .pop() ?? null

    const userInfo = userMap.get(s.user_id)
    const authorAlias = anonymize(s.share_alias, userInfo?.name, userInfo?.hospital_name)

    items.push({
      strategyId: s.id,
      name: s.name,
      description: s.description,
      targetMarket: s.target_market,
      authorAlias,
      sharedAt: s.shared_at,
      cloneCount: Number(s.clone_count ?? 0),
      isMine: s.user_id === auth.user.id,
      runs: sRuns.length,
      tickerCount: tickers.size,
      avgReturn: avg(returns),
      bestReturn: returns.length > 0 ? Math.max(...returns) : 0,
      worstReturn: returns.length > 0 ? Math.min(...returns) : 0,
      avgWinRate: avg(winRates),
      avgSharpe: avg(sharpes),
      avgMDD: avg(mdds),
      avgPF: avg(pfs),
      totalTrades: trades,
      lastRunAt,
    })
  }

  // 5. 정렬 (sortBy 기준 내림차순. avgMDD 만 오름차순(낮을수록 좋음))
  const dir = sortBy === 'avgMDD' ? 1 : -1
  items.sort((a, b) => {
    const av = (a as unknown as Record<string, number>)[sortBy] ?? 0
    const bv = (b as unknown as Record<string, number>)[sortBy] ?? 0
    return (av - bv) * dir
  })

  return NextResponse.json({
    data: items.slice(0, limit),
    totalShared: shared.length,
    rankedCount: items.length,
  })
}

// ============================================
// 유틸
// ============================================

function avg(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((s, v) => s + v, 0) / nums.length
}

/** 작성자 이름 익명화. share_alias 우선, 없으면 users.name → 마스킹, 없으면 hospital_name → 마스킹, 없으면 '익명'. */
function anonymize(
  alias: string | null,
  userName: string | null | undefined,
  hospitalName: string | null | undefined,
): string {
  if (alias && alias.trim()) return alias.trim()
  const candidate = userName?.trim() || hospitalName?.trim() || ''
  if (!candidate) return '익명'
  if (candidate.length <= 1) return candidate + '**'
  // 한글: 첫 글자만 노출 + ** (예: "황희수" → "황**", "원장" → "원*")
  return candidate.slice(0, 1) + '*'.repeat(Math.min(2, candidate.length - 1))
}
