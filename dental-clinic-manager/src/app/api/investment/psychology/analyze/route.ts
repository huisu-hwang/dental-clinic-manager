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
  const gate = await requireInvestmentSubscription(auth.user.id)
  if (gate instanceof NextResponse) return gate

  if (!rateLimit(auth.user.id)) {
    return NextResponse.json({ error: '분당 분석 요청 한도(5회) 초과' }, { status: 429 })
  }

  const body = await req.json().catch(() => null) as {
    ticker?: string; market?: Market;
    triggerKind?: PsychologyTriggerKind; triggerDetail?: string;
    asOf?: string;
  } | null
  const ticker = body?.ticker?.trim().toUpperCase()
  const market = body?.market === 'KR' || body?.market === 'US' ? body.market : null
  if (!ticker || !market) return NextResponse.json({ error: 'ticker, market 필수' }, { status: 400 })
  const triggerKind: PsychologyTriggerKind = body?.triggerKind ?? 'manual'

  // asOf — 과거 시점 분석. ISO string 파싱, 미래/너무 오래된 시점 차단
  let asOf: Date | undefined = undefined
  if (body?.asOf) {
    const d = new Date(body.asOf)
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'asOf 형식 오류 (ISO 8601 필요)' }, { status: 400 })
    }
    const now = Date.now()
    if (d.getTime() > now + 60_000) {
      return NextResponse.json({ error: 'asOf는 미래 시점일 수 없습니다' }, { status: 400 })
    }
    // yahoo 1m 차트는 7일 이내만 / KIS는 약 3거래일 — 7일 한도
    if (now - d.getTime() > 7 * 24 * 3600_000) {
      return NextResponse.json({ error: '과거 7일 이내 시점만 분석 가능합니다' }, { status: 400 })
    }
    asOf = d
  }

  let snapshot
  try {
    snapshot = await fetchPsychologySnapshot(auth.user.id, ticker, market, 60, asOf)
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
      asOf: asOf?.toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'LLM 분석 실패' }, { status: 500 })
  }

  const admin = getSupabaseAdmin()!
  // input_snapshot에 asOf 표기 (응답에서 클라이언트가 사용)
  const inputSnapshotWithAsOf = asOf
    ? { ...snapshot, as_of: asOf.toISOString() }
    : snapshot
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
      input_snapshot: inputSnapshotWithAsOf,
      llm_model: result.model,
      llm_latency_ms: result.latencyMs,
    })
    .select('*').single()
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
  return NextResponse.json(inserted)
}
