import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { fetchPsychologySnapshot } from '@/lib/psychology/marketDataFetcher'
import { analyzePsychology } from '@/lib/psychology/llmClient'
import type { Market } from '@/types/investment'
import type { PsychologyTriggerKind } from '@/types/psychology'

const RATE_BUCKET = new Map<string, { count: number; windowStart: number }>()
const WINDOW_MS = 60_000
const LIMIT = 5

function rateLimit(userId: string): boolean {
  const now = Date.now()
  const b = RATE_BUCKET.get(userId)
  if (!b || now - b.windowStart > WINDOW_MS) {
    RATE_BUCKET.set(userId, { count: 1, windowStart: now })
    return true
  }
  b.count++
  return b.count <= LIMIT
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  if (!rateLimit(auth.user.id)) {
    return NextResponse.json({ error: '분당 분석 요청 한도(5회) 초과' }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as {
    ticker?: string; market?: Market;
    triggerKind?: PsychologyTriggerKind; triggerDetail?: string;
  } | null
  const ticker = body?.ticker?.trim().toUpperCase()
  const market = body?.market === 'KR' || body?.market === 'US' ? body.market : null
  if (!ticker || !market) return NextResponse.json({ error: 'ticker, market 필수' }, { status: 400 })
  const triggerKind: PsychologyTriggerKind = body?.triggerKind ?? 'manual'

  let snapshot
  try {
    snapshot = await fetchPsychologySnapshot(auth.user.id, ticker, market, 60)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '데이터 수집 실패'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
  if (!snapshot.candles?.length) {
    return NextResponse.json({ error: '분봉 데이터가 없습니다 (휴장 또는 데이터 미공개)' }, { status: 502 })
  }

  let result
  try {
    result = await analyzePsychology({
      ticker, market, triggerKind, triggerDetail: body?.triggerDetail,
      snapshot,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'LLM 분석 실패' }, { status: 500 })
  }

  const admin = getSupabaseAdmin()!
  const { data: inserted, error: insertErr } = await admin
    .from('psychology_analyses')
    .insert({
      user_id: auth.user.id,
      ticker, market, trigger_kind: triggerKind,
      psychology_score: result.output.psychology_score,
      score_label: result.output.score_label,
      tags: result.output.tags,
      narrative: result.output.narrative,
      markers: result.output.markers,
      orderbook_pressure: result.output.orderbook_pressure,
      input_snapshot: snapshot,
      llm_model: result.model,
      llm_latency_ms: result.latencyMs,
    })
    .select('*').single()
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json(inserted)
}
