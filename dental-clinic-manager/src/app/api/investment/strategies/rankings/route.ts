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
 * 통계 출처: strategy_ranking_stats — backtest_runs 변경 시 trigger 로 사전 집계된 테이블.
 *           backtest_runs 70k+ rows 를 매 요청마다 JS 로 aggregate 하던 종전 방식 대비
 *           수 초 → 100ms 미만으로 단축. 최소 3회 이상 백테스트 기록만 노출.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { PRESET_STRATEGIES } from '@/components/Investment/StrategyBuilder/presets'

export const dynamic = 'force-dynamic'

const SORT_KEYS = new Set([
  'avgReturn', 'bestReturn', 'avgWinRate', 'avgSharpe',
  'avgPF', 'avgMDD', 'totalTrades', 'cloneCount',
])
type SortKey =
  | 'avgReturn' | 'bestReturn' | 'avgWinRate' | 'avgSharpe'
  | 'avgPF' | 'avgMDD' | 'totalTrades' | 'cloneCount'

interface RankingItem {
  /** 'shared' = 공유된 user strategy, 'preset' = 시스템 프리셋 */
  type: 'shared' | 'preset'
  strategyId?: string  // type='shared' 일 때
  presetId?: string    // type='preset' 일 때
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

interface StatRow {
  entry_type: 'shared' | 'preset'
  entry_id: string
  market: 'KR' | 'US'
  runs: number
  ticker_count: number
  avg_return: number | null
  best_return: number | null
  worst_return: number | null
  avg_win_rate: number | null
  avg_sharpe: number | null
  avg_mdd: number | null
  avg_pf: number | null
  total_trades: number
  last_run_at: string | null
}

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

  // 1. 사전 집계 테이블에서 stats 조회 — runs >= 3 인 행만
  let statsQ = supabase
    .from('strategy_ranking_stats')
    .select('entry_type, entry_id, market, runs, ticker_count, avg_return, best_return, worst_return, avg_win_rate, avg_sharpe, avg_mdd, avg_pf, total_trades, last_run_at')
    .gte('runs', MIN_RUNS_FOR_RANKING)
  if (market === 'KR' || market === 'US') {
    statsQ = statsQ.eq('market', market)
  }
  const { data: statsRaw, error: statsErr } = await statsQ.limit(500)
  if (statsErr) {
    return NextResponse.json({ error: statsErr.message }, { status: 500 })
  }
  const stats = (statsRaw ?? []) as StatRow[]

  // 2. shared 항목용 메타 (investment_strategies + users) 일괄 조회
  const sharedIds = Array.from(new Set(
    stats.filter(s => s.entry_type === 'shared').map(s => s.entry_id),
  ))
  type StratRow = {
    id: string
    user_id: string
    name: string
    description: string | null
    target_market: 'KR' | 'US'
    shared_at: string | null
    share_alias: string | null
    clone_count: number | null
    is_shared: boolean
  }
  let sharedStrats: StratRow[] = []
  if (sharedIds.length > 0) {
    const { data: stratsRaw } = await supabase
      .from('investment_strategies')
      .select('id, user_id, name, description, target_market, shared_at, share_alias, clone_count, is_shared')
      .in('id', sharedIds)
      .eq('is_shared', true)
    sharedStrats = (stratsRaw ?? []) as StratRow[]
  }
  const stratMap = new Map(sharedStrats.map(s => [s.id, s]))

  const userIds = Array.from(new Set(sharedStrats.map(s => s.user_id)))
  type UserRow = { id: string; name: string | null; hospital_name: string | null }
  let userRows: UserRow[] = []
  if (userIds.length > 0) {
    const { data: usersRaw } = await supabase
      .from('users')
      .select('id, name, hospital_name')
      .in('id', userIds)
    userRows = (usersRaw ?? []) as UserRow[]
  }
  const userMap = new Map(userRows.map(u => [u.id, u]))

  // 3. preset clone count 일괄 조회
  const { data: clonesRaw } = await supabase
    .from('investment_strategies')
    .select('source_preset_id')
    .not('source_preset_id', 'is', null)
  const cloneCountByPreset = new Map<string, number>()
  for (const c of (clonesRaw ?? []) as Array<{ source_preset_id: string | null }>) {
    if (!c.source_preset_id) continue
    cloneCountByPreset.set(c.source_preset_id, (cloneCountByPreset.get(c.source_preset_id) ?? 0) + 1)
  }

  // 4. stats + 메타 머지 → RankingItem
  const items: RankingItem[] = []
  for (const s of stats) {
    const base = {
      runs: s.runs,
      tickerCount: s.ticker_count,
      avgReturn: numOr0(s.avg_return),
      bestReturn: numOr0(s.best_return),
      worstReturn: numOr0(s.worst_return),
      avgWinRate: numOr0(s.avg_win_rate),
      avgSharpe: numOr0(s.avg_sharpe),
      avgMDD: numOr0(s.avg_mdd),
      avgPF: numOr0(s.avg_pf),
      totalTrades: s.total_trades,
      lastRunAt: s.last_run_at,
    }
    if (s.entry_type === 'shared') {
      const strat = stratMap.get(s.entry_id)
      if (!strat) continue   // 공유 해제됐거나 삭제된 전략
      const user = userMap.get(strat.user_id)
      items.push({
        type: 'shared',
        strategyId: strat.id,
        name: strat.name,
        description: strat.description,
        targetMarket: strat.target_market,
        authorAlias: anonymize(strat.share_alias, user?.name, user?.hospital_name),
        sharedAt: strat.shared_at,
        cloneCount: Number(strat.clone_count ?? 0),
        isMine: strat.user_id === auth.user.id,
        ...base,
      })
    } else {
      const preset = PRESET_STRATEGIES.find(p => p.id === s.entry_id)
      if (!preset) continue
      items.push({
        type: 'preset',
        presetId: preset.id,
        name: preset.name,
        description: preset.description,
        targetMarket: s.market,
        authorAlias: '공식 프리셋',
        sharedAt: null,
        cloneCount: cloneCountByPreset.get(preset.id) ?? 0,
        isMine: false,
        ...base,
      })
    }
  }

  // 5. 정렬 (sortBy 기준 내림차순. avgMDD 만 오름차순(낮을수록 좋음))
  const dir = sortBy === 'avgMDD' ? 1 : -1
  items.sort((a, b) => {
    const av = (a as unknown as Record<string, number>)[sortBy] ?? 0
    const bv = (b as unknown as Record<string, number>)[sortBy] ?? 0
    return (av - bv) * dir
  })

  const presetItemsCount = items.filter(i => i.type === 'preset').length
  const sharedItemsCount = items.filter(i => i.type === 'shared').length

  return NextResponse.json({
    data: items.slice(0, limit),
    totalShared: sharedStrats.length,
    totalPresets: PRESET_STRATEGIES.length,
    rankedCount: items.length,
    sharedItemsCount,
    presetItemsCount,
  })
}

// ============================================
// 유틸
// ============================================

function numOr0(v: number | null | undefined): number {
  if (v === null || v === undefined) return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
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
