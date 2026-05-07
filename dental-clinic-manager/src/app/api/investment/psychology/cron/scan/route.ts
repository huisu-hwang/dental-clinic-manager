// src/app/api/investment/psychology/cron/scan/route.ts
// 매분 실행. 활성 자동매매 구독자의 monitoring_enabled 워치리스트 종목만 폴링/트리거.

import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { isMarketOpen } from '@/lib/psychology/marketHours'
import { fetchPsychologySnapshot } from '@/lib/psychology/marketDataFetcher'
import { analyzePsychology } from '@/lib/psychology/llmClient'
import type { Market } from '@/types/investment'

const ENABLED = process.env.PSYCHOLOGY_CRON_ENABLED !== 'false'
const GLOBAL_LLM_PER_MINUTE = 30

export async function GET(req: Request) {
  if (!ENABLED) return NextResponse.json({ skipped: 'disabled' })

  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    if (process.env.NODE_ENV === 'production') {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const krOpen = isMarketOpen('KR')
  const usOpen = isMarketOpen('US')
  if (!krOpen && !usOpen) return NextResponse.json({ skipped: 'market closed' })

  const admin = getSupabaseAdmin()!

  const { data: rows } = await admin
    .from('psychology_watchlist')
    .select(`
      id, user_id, ticker, market,
      trigger_price_change_pct, trigger_volume_multiplier,
      sub:user_subscriptions!inner(status, plan:user_subscription_plans!inner(feature_id))
    `)
    .eq('monitoring_enabled', true)
    .eq('sub.status', 'active')
    .eq('sub.plan.feature_id', 'investment')

  type Row = {
    id: string; user_id: string; ticker: string; market: Market;
    trigger_price_change_pct: number | null;
    trigger_volume_multiplier: number | null;
  }
  const items = (rows ?? []) as unknown as Row[]
  const filtered = items.filter(r => (r.market === 'KR' && krOpen) || (r.market === 'US' && usOpen))

  const userIds = Array.from(new Set(filtered.map(r => r.user_id)))
  const { data: settingRows } = await admin
    .from('psychology_settings').select('*').in('user_id', userIds)
  const settings = new Map<string, { default_price_change_pct: number; default_volume_multiplier: number; cooldown_minutes: number; push_notify_enabled: boolean }>()
  for (const s of (settingRows ?? []) as Array<{ user_id: string; default_price_change_pct: number; default_volume_multiplier: number; cooldown_minutes: number; push_notify_enabled: boolean }>) {
    settings.set(s.user_id, s)
  }
  const defaults = { default_price_change_pct: 2.0, default_volume_multiplier: 3.0, cooldown_minutes: 10, push_notify_enabled: true }

  const cache = new Map<string, Awaited<ReturnType<typeof fetchPsychologySnapshot>>>()
  const cooldownCutoff = (cooldownMin: number) => new Date(Date.now() - cooldownMin * 60_000).toISOString()

  const triggered: Array<{ row: Row; reason: 'price_change' | 'volume_spike'; detail: string }> = []
  for (const r of filtered) {
    const s = settings.get(r.user_id) ?? defaults
    const priceTh = r.trigger_price_change_pct ?? s.default_price_change_pct
    const volTh = r.trigger_volume_multiplier ?? s.default_volume_multiplier

    const key = `${r.ticker}:${r.market}`
    let snapshot = cache.get(key)
    if (!snapshot) {
      try {
        snapshot = await fetchPsychologySnapshot(r.user_id, r.ticker, r.market, 6)
        cache.set(key, snapshot)
      } catch { continue }
    }
    const candles = snapshot.candles
    if (candles.length < 2) continue

    const last = candles[candles.length - 1]
    const priceChange = Math.abs(last.close - last.open) / last.open
    const recent5 = candles.slice(-6, -1)
    const avgVol = recent5.length ? recent5.reduce((a, c) => a + c.volume, 0) / recent5.length : 0
    const volMul = avgVol > 0 ? last.volume / avgVol : 0

    let reason: 'price_change' | 'volume_spike' | null = null
    let detail = ''
    if (priceChange * 100 >= priceTh) {
      reason = 'price_change'
      detail = `${(priceChange * 100).toFixed(2)}%`
    } else if (volMul >= volTh) {
      reason = 'volume_spike'
      detail = `×${volMul.toFixed(2)}`
    }
    if (!reason) continue

    const { data: recent } = await admin
      .from('psychology_analyses')
      .select('id')
      .eq('user_id', r.user_id).eq('ticker', r.ticker).eq('market', r.market)
      .gte('created_at', cooldownCutoff(s.cooldown_minutes))
      .limit(1)
    if (recent && recent.length > 0) continue

    triggered.push({ row: r, reason, detail })
  }

  triggered.sort((a, b) => Number(b.detail.replace(/[^0-9.]/g, '')) - Number(a.detail.replace(/[^0-9.]/g, '')))
  const toRun = triggered.slice(0, GLOBAL_LLM_PER_MINUTE)

  let analyzed = 0
  for (const t of toRun) {
    const { row, reason, detail } = t
    let snapshot
    try {
      snapshot = await fetchPsychologySnapshot(row.user_id, row.ticker, row.market, 60)
    } catch { continue }

    let result
    try {
      result = await analyzePsychology({
        ticker: row.ticker, market: row.market,
        triggerKind: reason, triggerDetail: detail,
        snapshot,
      })
    } catch { continue }

    const { data: inserted } = await admin
      .from('psychology_analyses').insert({
        user_id: row.user_id, ticker: row.ticker, market: row.market,
        trigger_kind: reason,
        psychology_score: result.output.psychology_score,
        score_label: result.output.score_label,
        tags: result.output.tags, narrative: result.output.narrative,
        markers: result.output.markers,
        orderbook_pressure: result.output.orderbook_pressure,
        input_snapshot: snapshot,
        llm_model: result.model, llm_latency_ms: result.latencyMs,
      }).select('id').single()

    const s = settings.get(row.user_id) ?? defaults
    if (s.push_notify_enabled && inserted) {
      await admin.from('user_notifications').insert({
        user_id: row.user_id,
        type: 'psychology_trigger',
        title: `${row.ticker} ${reason === 'price_change' ? '가격 변동' : '거래량 폭증'} 감지`,
        message: `${reason === 'price_change' ? '가격 ' : '거래량 '}${detail} — 공포·탐욕 점수 ${result.output.psychology_score}`,
        link: `/investment/psychology?ticker=${encodeURIComponent(row.ticker)}&market=${row.market}`,
        is_read: false,
      })
    }
    analyzed++
  }

  return NextResponse.json({ scanned: filtered.length, triggered: triggered.length, analyzed })
}
