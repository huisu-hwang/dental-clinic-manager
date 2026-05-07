# 군중심리 분석 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 자동매매 사용자가 워치리스트에 등록한 종목의 군중심리(공포·탐욕·FOMO 등)를 LLM이 분석해 점수·태그·서술·차트 마커로 보여주고, 급등/급락/거래량 폭증 이벤트가 감지되면 자동 분석 + 푸시 알림을 발송한다.

**Architecture:** 워치리스트(상한 10개) + 종목 클릭 시 온디맨드 분석 + Vercel Cron 1분 주기 이벤트 감시. 분봉 60개 + 호가 스냅샷(KR만)을 Anthropic Claude haiku 4.5에 전달하여 JSON 스키마 잠긴 응답을 받고, recharts로 차트 + ReferenceDot 마커를 표시. 게이팅은 Plan 1의 `requireInvestmentSubscription` 헬퍼 단일 사용.

**Tech Stack:** Next.js 15, TypeScript, Supabase, Anthropic SDK (claude-haiku-4-5-20251001), recharts, KIS API, yahoo-finance2, Vercel Cron.

**Spec:** [docs/superpowers/specs/2026-05-07-investment-personal-subscription-and-psychology-design.md](../specs/2026-05-07-investment-personal-subscription-and-psychology-design.md)

**Prerequisite:** Plan 1(`2026-05-07-investment-personal-subscription-transition.md`) 완료 후 시작. `requireInvestmentSubscription` 헬퍼 사용.

---

## File Map

### 신설
- `supabase/migrations/20260507_psychology_analysis.sql` — 3개 테이블 + RLS
- `src/types/psychology.ts` — 타입 정의
- `src/lib/psychology/llmClient.ts` — Anthropic 호출 + JSON 스키마 검증
- `src/lib/psychology/marketDataFetcher.ts` — 분봉/호가 수집 (KR/US)
- `src/lib/psychology/marketHours.ts` — 시장 시간 체크
- `src/app/api/investment/psychology/watchlist/route.ts` (GET, POST, DELETE)
- `src/app/api/investment/psychology/watchlist/[id]/route.ts` (PATCH)
- `src/app/api/investment/psychology/settings/route.ts` (GET, PUT)
- `src/app/api/investment/psychology/analyze/route.ts` (POST)
- `src/app/api/investment/psychology/analyses/route.ts` (GET)
- `src/app/api/investment/psychology/cron/scan/route.ts` (GET — Vercel Cron)
- `src/app/investment/psychology/page.tsx` — 메인 페이지
- `src/components/Investment/Psychology/Watchlist.tsx`
- `src/components/Investment/Psychology/AnalysisDetail.tsx`
- `src/components/Investment/Psychology/ScoreGauge.tsx`
- `src/components/Investment/Psychology/PsychologyChart.tsx`
- `src/components/Investment/Psychology/OrderbookPressureBar.tsx`
- `src/components/Investment/Psychology/AnalysisHistory.tsx`
- `src/components/Investment/Psychology/AddTickerModal.tsx`

### 수정
- `src/app/investment/layout.tsx` — 사이드바에 "심리 분석" 자식 메뉴 추가
- `vercel.json` — Cron 등록 (`/api/investment/psychology/cron/scan` 매분)

---

## Task 1: 데이터베이스 마이그레이션

**Files:**
- Create: `supabase/migrations/20260507_psychology_analysis.sql`

- [ ] **Step 1: SQL 작성**

```sql
-- ============================================
-- 군중심리 분석 (psychology_*)
-- ============================================

CREATE TABLE IF NOT EXISTS psychology_watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR','US')),
  monitoring_enabled BOOLEAN NOT NULL DEFAULT true,
  trigger_price_change_pct NUMERIC NULL,
  trigger_volume_multiplier NUMERIC NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, ticker, market)
);

CREATE TABLE IF NOT EXISTS psychology_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  default_price_change_pct NUMERIC NOT NULL DEFAULT 2.0,
  default_volume_multiplier NUMERIC NOT NULL DEFAULT 3.0,
  push_notify_enabled BOOLEAN NOT NULL DEFAULT true,
  cooldown_minutes INT NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS psychology_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  market TEXT NOT NULL CHECK (market IN ('KR','US')),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual','price_change','volume_spike')),
  psychology_score INT NOT NULL CHECK (psychology_score BETWEEN 0 AND 100),
  score_label TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  narrative TEXT NOT NULL,
  markers JSONB NOT NULL,
  orderbook_pressure JSONB NULL,
  input_snapshot JSONB NOT NULL,
  llm_model TEXT NOT NULL,
  llm_latency_ms INT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_psy_analyses_user_ticker_time
  ON psychology_analyses (user_id, ticker, created_at DESC);

ALTER TABLE psychology_watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychology_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychology_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY psy_watchlist_select_own ON psychology_watchlist
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY psy_watchlist_insert_own ON psychology_watchlist
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY psy_watchlist_update_own ON psychology_watchlist
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY psy_watchlist_delete_own ON psychology_watchlist
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY psy_settings_select_own ON psychology_settings
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY psy_settings_upsert_own ON psychology_settings
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY psy_analyses_select_own ON psychology_analyses
  FOR SELECT USING (user_id = auth.uid());
-- INSERT는 service_role만
```

- [ ] **Step 2: Supabase MCP로 마이그레이션 적용**

`mcp__supabase__apply_migration` (project_id=`beahjntkmkfhpcbhfnrr`, name=`20260507_psychology_analysis`).

- [ ] **Step 3: 검증**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('psychology_watchlist','psychology_settings','psychology_analyses');
```
Expected: 3 rows. `mcp__supabase__execute_sql` 사용.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260507_psychology_analysis.sql
git commit -m "feat(psychology): 워치리스트/설정/분석 이력 테이블 신설"
```

---

## Task 2: 타입 정의

**Files:**
- Create: `src/types/psychology.ts`

- [ ] **Step 1: 타입 작성**

```typescript
// src/types/psychology.ts
import type { Market } from '@/types/investment'

export type PsychologyTriggerKind = 'manual' | 'price_change' | 'volume_spike'

export type PsychologyMarkerKind =
  | 'panic_sell'
  | 'fomo_entry'
  | 'accumulation'
  | 'distribution'
  | 'capitulation'
  | 'indecision'

export const PSYCHOLOGY_TAG_OPTIONS = [
  '패닉 셀링', 'FOMO 매수', '익절 압력', '누적 매집',
  '분산 매도', '관망', '반등 시도', '투매',
] as const
export type PsychologyTag = typeof PSYCHOLOGY_TAG_OPTIONS[number]

export interface PsychologyMarker {
  ts: string
  kind: PsychologyMarkerKind
  label: string
  candle_index: number
}

export interface PsychologyOrderbookPressure {
  bid_pct: number
  ask_pct: number
  interpretation: string
}

export interface PsychologyAnalysisOutput {
  psychology_score: number
  score_label: string
  tags: string[]
  narrative: string
  markers: PsychologyMarker[]
  orderbook_pressure: PsychologyOrderbookPressure | null
}

export interface PsychologyWatchlistItem {
  id: string
  user_id: string
  ticker: string
  market: Market
  monitoring_enabled: boolean
  trigger_price_change_pct: number | null
  trigger_volume_multiplier: number | null
  created_at: string
}

export interface PsychologySettings {
  user_id: string
  default_price_change_pct: number
  default_volume_multiplier: number
  push_notify_enabled: boolean
  cooldown_minutes: number
  updated_at: string
}

export interface PsychologyAnalysisRecord extends PsychologyAnalysisOutput {
  id: string
  user_id: string
  ticker: string
  market: Market
  trigger_kind: PsychologyTriggerKind
  input_snapshot: PsychologyInputSnapshot
  llm_model: string
  llm_latency_ms: number | null
  created_at: string
}

export interface MinuteCandle {
  ts: string  // ISO8601
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderbookSnapshot {
  bids: Array<{ price: number; qty: number }>
  asks: Array<{ price: number; qty: number }>
  totalBidQty: number
  totalAskQty: number
}

export interface PsychologyInputSnapshot {
  candles: MinuteCandle[]
  orderbook: OrderbookSnapshot | null
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add src/types/psychology.ts
git commit -m "feat(psychology): 타입 정의"
```

---

## Task 3: 시장 시간 헬퍼

**Files:**
- Create: `src/lib/psychology/marketHours.ts`

- [ ] **Step 1: 헬퍼 작성**

```typescript
// src/lib/psychology/marketHours.ts
// 한국/미국 정규장 시간 체크 (Intl.DateTimeFormat으로 서머타임 처리)
import type { Market } from '@/types/investment'

function getZonedHourMinute(date: Date, timeZone: string): { h: number; m: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    h: Number(get('hour')),
    m: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  }
}

export function isMarketOpen(market: Market, now = new Date()): boolean {
  if (market === 'KR') {
    const z = getZonedHourMinute(now, 'Asia/Seoul')
    if (z.weekday === 0 || z.weekday === 6) return false
    const minutes = z.h * 60 + z.m
    return minutes >= 9 * 60 && minutes <= 15 * 60 + 30
  }
  // US
  const z = getZonedHourMinute(now, 'America/New_York')
  if (z.weekday === 0 || z.weekday === 6) return false
  const minutes = z.h * 60 + z.m
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add src/lib/psychology/marketHours.ts
git commit -m "feat(psychology): 시장 시간 체크 헬퍼"
```

---

## Task 4: 분봉/호가 수집 헬퍼

**Files:**
- Create: `src/lib/psychology/marketDataFetcher.ts`

- [ ] **Step 1: 수집 헬퍼 작성**

KR은 KIS API, US는 yahoo-finance2. KIS 호가는 `inquire-asking-price-exp-ccn` 엔드포인트.

```typescript
// src/lib/psychology/marketDataFetcher.ts
import yahooFinance from 'yahoo-finance2'
import { getKRMinuteCandles, getKRAskingPrice } from '@/lib/kisApiService'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { investmentDecrypt } from '@/lib/investmentCrypto'
import type { Market } from '@/types/investment'
import type { MinuteCandle, OrderbookSnapshot, PsychologyInputSnapshot } from '@/types/psychology'

interface KisCredentialResolved {
  credentialId: string
  appKey: string
  appSecret: string
  isPaperTrading: boolean
}

async function getUserKisCredential(userId: string): Promise<KisCredentialResolved | null> {
  const admin = getSupabaseAdmin()
  if (!admin) return null
  const { data } = await admin
    .from('user_broker_credentials')
    .select('id, app_key_encrypted, app_secret_encrypted, is_paper_trading')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('broker', ['kis', 'kis_kr', 'KIS', 'KIS_KR'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const row = data as { id: string; app_key_encrypted: string; app_secret_encrypted: string; is_paper_trading: boolean }
  return {
    credentialId: row.id,
    appKey: investmentDecrypt(row.app_key_encrypted),
    appSecret: investmentDecrypt(row.app_secret_encrypted),
    isPaperTrading: !!row.is_paper_trading,
  }
}

async function fetchKRSnapshot(userId: string, ticker: string, count = 60): Promise<PsychologyInputSnapshot> {
  const cred = await getUserKisCredential(userId)
  if (!cred) throw new Error('KIS 계좌 연결이 필요합니다')

  const candles = await getKRMinuteCandles({
    credentialId: cred.credentialId,
    credential: cred,
    ticker,
    count,
  })
  let orderbook: OrderbookSnapshot | null = null
  try {
    orderbook = await getKRAskingPrice({ credentialId: cred.credentialId, credential: cred, ticker })
  } catch {
    orderbook = null  // 호가 실패는 전체 실패로 이어지지 않음
  }
  return { candles, orderbook }
}

async function fetchUSSnapshot(ticker: string, count = 60): Promise<PsychologyInputSnapshot> {
  const period2 = new Date()
  const period1 = new Date(period2.getTime() - count * 60 * 1000)
  const result = await yahooFinance.chart(ticker, {
    period1, period2, interval: '1m',
  })
  const quotes = result.quotes ?? []
  const candles: MinuteCandle[] = quotes
    .filter(q => q.open != null && q.close != null)
    .slice(-count)
    .map(q => ({
      ts: new Date(q.date as Date).toISOString(),
      open: q.open as number,
      high: q.high as number,
      low: q.low as number,
      close: q.close as number,
      volume: q.volume as number,
    }))
  return { candles, orderbook: null }
}

export async function fetchPsychologySnapshot(
  userId: string,
  ticker: string,
  market: Market,
  count = 60
): Promise<PsychologyInputSnapshot> {
  if (market === 'KR') return fetchKRSnapshot(userId, ticker, count)
  return fetchUSSnapshot(ticker, count)
}
```

- [ ] **Step 2: KIS 호가 함수 확인**

Run: `grep -n "getKRAskingPrice\|getKRMinuteCandles" src/lib/kisApiService.ts`

`getKRMinuteCandles`는 존재하지만 `getKRAskingPrice`가 없으면 추가 필요.

해당 함수가 없으면 `src/lib/kisApiService.ts`에 다음을 export로 추가:

```typescript
// KIS 호가 (10단계 매수/매도) — inquire-asking-price-exp-ccn TR ID: FHKST01010200
export async function getKRAskingPrice(params: {
  credentialId: string
  credential: { appKey: string; appSecret: string; isPaperTrading: boolean }
  ticker: string
}): Promise<{ bids: Array<{price:number;qty:number}>, asks: Array<{price:number;qty:number}>, totalBidQty: number, totalAskQty: number }> {
  const token = await ensureKRToken(params.credentialId, params.credential)
  const baseUrl = params.credential.isPaperTrading ? 'https://openapivts.koreainvestment.com:29443' : 'https://openapi.koreainvestment.com:9443'
  const url = `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn?fid_cond_mrkt_div_code=J&fid_input_iscd=${params.ticker}`
  const res = await fetch(url, {
    headers: {
      'authorization': `Bearer ${token}`,
      'appkey': params.credential.appKey,
      'appsecret': params.credential.appSecret,
      'tr_id': 'FHKST01010200',
      'content-type': 'application/json; charset=utf-8',
    },
  })
  if (!res.ok) throw new Error(`KIS 호가 조회 실패: ${res.status}`)
  const json = await res.json() as { output1?: Record<string, string> }
  const o = json.output1 ?? {}
  const bids: Array<{price:number;qty:number}> = []
  const asks: Array<{price:number;qty:number}> = []
  for (let i = 1; i <= 10; i++) {
    const bp = Number(o[`bidp${i}`] ?? 0); const bq = Number(o[`bidp_rsqn${i}`] ?? 0)
    const ap = Number(o[`askp${i}`] ?? 0); const aq = Number(o[`askp_rsqn${i}`] ?? 0)
    if (bp > 0) bids.push({ price: bp, qty: bq })
    if (ap > 0) asks.push({ price: ap, qty: aq })
  }
  const totalBidQty = bids.reduce((s, x) => s + x.qty, 0)
  const totalAskQty = asks.reduce((s, x) => s + x.qty, 0)
  return { bids, asks, totalBidQty, totalAskQty }
}
```

KIS API 헬퍼(`ensureKRToken` 등)는 기존 파일에 이미 있을 것. 없으면 기존 `getKRRealtimeQuote` 패턴 따라 작성.

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add src/lib/psychology/marketDataFetcher.ts src/lib/kisApiService.ts
git commit -m "feat(psychology): 분봉/호가 수집 헬퍼 (KR/US)"
```

---

## Task 5: LLM 호출 헬퍼

**Files:**
- Create: `src/lib/psychology/llmClient.ts`

- [ ] **Step 1: LLM 클라이언트 작성**

```typescript
// src/lib/psychology/llmClient.ts
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Market } from '@/types/investment'
import type {
  PsychologyAnalysisOutput,
  PsychologyInputSnapshot,
  PsychologyTriggerKind,
} from '@/types/psychology'

const MODEL_ID = 'claude-haiku-4-5-20251001'

const ZAnalysis = z.object({
  psychology_score: z.number().int().min(0).max(100),
  score_label: z.string().min(1),
  tags: z.array(z.string()).max(8),
  narrative: z.string().min(1),
  markers: z.array(z.object({
    ts: z.string(),
    kind: z.enum(['panic_sell','fomo_entry','accumulation','distribution','capitulation','indecision']),
    label: z.string().min(1),
    candle_index: z.number().int().min(0),
  })).max(5),
  orderbook_pressure: z.object({
    bid_pct: z.number().min(0).max(100),
    ask_pct: z.number().min(0).max(100),
    interpretation: z.string(),
  }).nullable(),
})

const TOOL_DEFINITION = {
  name: 'submit_psychology_analysis',
  description: '주식 군중심리 분석 결과를 제출합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      psychology_score: { type: 'integer', minimum: 0, maximum: 100 },
      score_label: { type: 'string', enum: ['극공포','공포','중립','탐욕','극탐욕'] },
      tags: {
        type: 'array',
        items: { type: 'string', enum: ['패닉 셀링','FOMO 매수','익절 압력','누적 매집','분산 매도','관망','반등 시도','투매'] },
        maxItems: 5,
      },
      narrative: { type: 'string' },
      markers: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            ts: { type: 'string' },
            kind: { type: 'string', enum: ['panic_sell','fomo_entry','accumulation','distribution','capitulation','indecision'] },
            label: { type: 'string' },
            candle_index: { type: 'integer', minimum: 0 },
          },
          required: ['ts','kind','label','candle_index'],
        },
      },
      orderbook_pressure: {
        oneOf: [
          { type: 'null' },
          {
            type: 'object',
            properties: {
              bid_pct: { type: 'number', minimum: 0, maximum: 100 },
              ask_pct: { type: 'number', minimum: 0, maximum: 100 },
              interpretation: { type: 'string' },
            },
            required: ['bid_pct','ask_pct','interpretation'],
          },
        ],
      },
    },
    required: ['psychology_score','score_label','tags','narrative','markers','orderbook_pressure'],
  },
}

const SYSTEM_PROMPT = `당신은 주식 시장 군중심리 분석 전문가입니다. 주어진 분봉 시계열과 호가 스냅샷을 보고, 호가창과 차트를 수시로 보고 있는 일반 투자자(대중)가 지금 이 순간 느낄 심리를 분석합니다. 출력은 반드시 submit_psychology_analysis 도구를 통해 제출하며, 한국어로 작성합니다. 추측이 아닌 데이터에서 직접 관찰 가능한 패턴 위주로 분석하고, 단정적 매매 권유 표현은 사용하지 않습니다.`

export interface AnalyzeArgs {
  ticker: string
  market: Market
  triggerKind: PsychologyTriggerKind
  triggerDetail?: string
  snapshot: PsychologyInputSnapshot
}

export interface AnalyzeResult {
  output: PsychologyAnalysisOutput
  model: string
  latencyMs: number
}

function buildUserPrompt(args: AnalyzeArgs): string {
  const { ticker, market, triggerKind, triggerDetail, snapshot } = args
  const candleLines = snapshot.candles.map((c, i) =>
    `[${i}] ${c.ts} O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`
  ).join('\n')
  const orderbookSummary = snapshot.orderbook
    ? `호가 (10단계): 매수총잔량=${snapshot.orderbook.totalBidQty}, 매도총잔량=${snapshot.orderbook.totalAskQty}\n` +
      `매수: ${snapshot.orderbook.bids.map(b => `${b.price}@${b.qty}`).join(', ')}\n` +
      `매도: ${snapshot.orderbook.asks.map(a => `${a.price}@${a.qty}`).join(', ')}`
    : '호가 데이터 없음 (해외 종목)'
  return [
    `종목: ${ticker} (${market})`,
    `분석 요청 사유: ${triggerKind}${triggerDetail ? ` - ${triggerDetail}` : ''}`,
    `최근 ${snapshot.candles.length}개 1분봉:`,
    candleLines,
    orderbookSummary,
    '',
    '위 데이터를 바탕으로 군중심리를 분석하여 submit_psychology_analysis 도구를 호출해주세요.',
    `markers의 candle_index는 위 분봉 배열의 [N] 번호와 정확히 일치해야 합니다. 최대 5개.`,
  ].join('\n')
}

export async function analyzePsychology(args: AnalyzeArgs): Promise<AnalyzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수 누락')
  const client = new Anthropic({ apiKey })

  const userPrompt = buildUserPrompt(args)
  const start = Date.now()

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 1200,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'tool', name: TOOL_DEFINITION.name },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = res.content.find(c => c.type === 'tool_use') as
      | { type: 'tool_use'; name: string; input: unknown }
      | undefined
    if (!toolUse) {
      if (attempt === 0) continue
      throw new Error('LLM 응답에 tool_use 없음')
    }

    const parsed = ZAnalysis.safeParse(toolUse.input)
    if (!parsed.success) {
      if (attempt === 0) continue
      throw new Error(`LLM 응답 스키마 검증 실패: ${parsed.error.message}`)
    }

    return {
      output: parsed.data,
      model: MODEL_ID,
      latencyMs: Date.now() - start,
    }
  }
  throw new Error('LLM 분석 실패 (재시도 한도 초과)')
}
```

- [ ] **Step 2: 의존성 확인**

```bash
npm ls @anthropic-ai/sdk zod 2>&1 | head -5
```

둘 다 설치되어 있어야 함. 없으면 추가:
```bash
npm install @anthropic-ai/sdk zod
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add src/lib/psychology/llmClient.ts package.json package-lock.json
git commit -m "feat(psychology): Claude haiku 4.5 LLM 분석 클라이언트"
```

---

## Task 6: 워치리스트 라우트

**Files:**
- Create: `src/app/api/investment/psychology/watchlist/route.ts`
- Create: `src/app/api/investment/psychology/watchlist/[id]/route.ts`

- [ ] **Step 1: 목록/추가/삭제 라우트**

```typescript
// src/app/api/investment/psychology/watchlist/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

const WATCHLIST_LIMIT = 10

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const admin = getSupabaseAdmin()!
  const { data: items } = await admin
    .from('psychology_watchlist')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })

  // 각 워치리스트 항목의 최신 분석 1건씩 join
  const tickers = (items ?? []).map(i => (i as { ticker: string }).ticker)
  const { data: latestAnalyses } = tickers.length
    ? await admin
        .from('psychology_analyses')
        .select('id, ticker, market, psychology_score, score_label, tags, created_at')
        .eq('user_id', auth.user.id)
        .in('ticker', tickers)
        .order('created_at', { ascending: false })
    : { data: [] }

  const latestMap = new Map<string, unknown>()
  for (const a of (latestAnalyses ?? []) as Array<{ ticker: string; market: string }>) {
    const key = `${a.ticker}:${a.market}`
    if (!latestMap.has(key)) latestMap.set(key, a)
  }

  const out = (items ?? []).map((it) => {
    const item = it as { ticker: string; market: string }
    return { ...item, latest_analysis: latestMap.get(`${item.ticker}:${item.market}`) ?? null }
  })
  return NextResponse.json(out)
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const body = await req.json().catch(() => null) as { ticker?: string; market?: string } | null
  const ticker = body?.ticker?.trim().toUpperCase()
  const market = body?.market === 'KR' || body?.market === 'US' ? body.market : null
  if (!ticker || !market) return NextResponse.json({ error: 'ticker, market 필수' }, { status: 400 })

  const admin = getSupabaseAdmin()!
  const { count } = await admin
    .from('psychology_watchlist')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.user.id)
  if ((count ?? 0) >= WATCHLIST_LIMIT) {
    return NextResponse.json({ error: `워치리스트는 최대 ${WATCHLIST_LIMIT}개까지 등록 가능합니다.` }, { status: 400 })
  }

  const { data, error } = await admin
    .from('psychology_watchlist')
    .insert({ user_id: auth.user.id, ticker, market })
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 })
  const admin = getSupabaseAdmin()!
  const { error } = await admin.from('psychology_watchlist').delete()
    .eq('id', id).eq('user_id', auth.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: 항목 수정 라우트**

```typescript
// src/app/api/investment/psychology/watchlist/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const { id } = await ctx.params
  const body = await req.json().catch(() => null) as {
    monitoring_enabled?: boolean
    trigger_price_change_pct?: number | null
    trigger_volume_multiplier?: number | null
  } | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const update: Record<string, unknown> = {}
  if (typeof body.monitoring_enabled === 'boolean') update.monitoring_enabled = body.monitoring_enabled
  if (body.trigger_price_change_pct !== undefined) update.trigger_price_change_pct = body.trigger_price_change_pct
  if (body.trigger_volume_multiplier !== undefined) update.trigger_volume_multiplier = body.trigger_volume_multiplier

  const admin = getSupabaseAdmin()!
  const { data, error } = await admin
    .from('psychology_watchlist')
    .update(update)
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .select('*')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/investment/psychology/watchlist
git commit -m "feat(psychology): 워치리스트 CRUD API"
```

---

## Task 7: 설정 라우트

**Files:**
- Create: `src/app/api/investment/psychology/settings/route.ts`

- [ ] **Step 1: 라우트 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const admin = getSupabaseAdmin()!
  const { data } = await admin
    .from('psychology_settings').select('*')
    .eq('user_id', auth.user.id).maybeSingle()
  return NextResponse.json(data ?? {
    user_id: auth.user.id,
    default_price_change_pct: 2.0,
    default_volume_multiplier: 3.0,
    push_notify_enabled: true,
    cooldown_minutes: 10,
    updated_at: null,
  })
}

export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const update: Record<string, unknown> = { user_id: auth.user.id, updated_at: new Date().toISOString() }
  if (typeof body.default_price_change_pct === 'number' && body.default_price_change_pct >= 0) update.default_price_change_pct = body.default_price_change_pct
  if (typeof body.default_volume_multiplier === 'number' && body.default_volume_multiplier >= 0) update.default_volume_multiplier = body.default_volume_multiplier
  if (typeof body.push_notify_enabled === 'boolean') update.push_notify_enabled = body.push_notify_enabled
  if (typeof body.cooldown_minutes === 'number' && body.cooldown_minutes >= 0) update.cooldown_minutes = Math.floor(body.cooldown_minutes)

  const admin = getSupabaseAdmin()!
  const { data, error } = await admin
    .from('psychology_settings')
    .upsert(update, { onConflict: 'user_id' })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/investment/psychology/settings
git commit -m "feat(psychology): 사용자 설정 API"
```

---

## Task 8: 온디맨드 분석 라우트

**Files:**
- Create: `src/app/api/investment/psychology/analyze/route.ts`

- [ ] **Step 1: 라우트 작성**

```typescript
// src/app/api/investment/psychology/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { fetchPsychologySnapshot } from '@/lib/psychology/marketDataFetcher'
import { analyzePsychology } from '@/lib/psychology/llmClient'
import type { Market } from '@/types/investment'
import type { PsychologyTriggerKind } from '@/types/psychology'

// 사용자당 분당 5회 상한 (메모리 카운터 — 멀티 인스턴스 정확도는 보장 안 됨)
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
  const triggerKind = body.triggerKind ?? 'manual'

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
      ticker, market, triggerKind, triggerDetail: body.triggerDetail,
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
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/investment/psychology/analyze
git commit -m "feat(psychology): 온디맨드 분석 API"
```

---

## Task 9: 이력 조회 라우트

**Files:**
- Create: `src/app/api/investment/psychology/analyses/route.ts`

- [ ] **Step 1: 라우트 작성**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { requireInvestmentSubscription } from '@/lib/userSubscription'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  await requireInvestmentSubscription(auth.user.id)

  const url = new URL(req.url)
  const ticker = url.searchParams.get('ticker')
  const market = url.searchParams.get('market')
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 10)))

  const admin = getSupabaseAdmin()!
  let query = admin
    .from('psychology_analyses')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (ticker) query = query.eq('ticker', ticker.toUpperCase())
  if (market) query = query.eq('market', market)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/investment/psychology/analyses
git commit -m "feat(psychology): 분석 이력 조회 API"
```

---

## Task 10: Cron 스캔 라우트

**Files:**
- Create: `src/app/api/investment/psychology/cron/scan/route.ts`
- Modify: `vercel.json`

- [ ] **Step 1: vercel.json 확인**

Run: `cat vercel.json`
기존 cron 항목이 있다면 그 패턴을 따라 추가.

- [ ] **Step 2: vercel.json에 cron 등록**

기존 `crons` 배열에 다음 항목 추가:

```json
{
  "path": "/api/investment/psychology/cron/scan",
  "schedule": "* * * * *"
}
```

- [ ] **Step 3: cron 라우트 작성**

```typescript
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

  // Vercel Cron 호출 검증
  const authHeader = req.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Vercel Cron는 자동으로 동일 헤더 추가. 로컬 테스트에서는 우회.
    if (process.env.NODE_ENV === 'production') {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const krOpen = isMarketOpen('KR')
  const usOpen = isMarketOpen('US')
  if (!krOpen && !usOpen) return NextResponse.json({ skipped: 'market closed' })

  const admin = getSupabaseAdmin()!

  // 1. 활성 구독자의 워치리스트만 (JOIN user_subscriptions)
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

  // 2. 사용자 설정 일괄 조회
  const userIds = Array.from(new Set(filtered.map(r => r.user_id)))
  const { data: settingRows } = await admin
    .from('psychology_settings').select('*').in('user_id', userIds)
  const settings = new Map<string, { default_price_change_pct: number; default_volume_multiplier: number; cooldown_minutes: number; push_notify_enabled: boolean }>()
  for (const s of (settingRows ?? []) as Array<{ user_id: string; default_price_change_pct: number; default_volume_multiplier: number; cooldown_minutes: number; push_notify_enabled: boolean }>) {
    settings.set(s.user_id, s)
  }
  const defaults = { default_price_change_pct: 2.0, default_volume_multiplier: 3.0, cooldown_minutes: 10, push_notify_enabled: true }

  // 3. 종목별 시세 캐시 (TTL 30초 — 함수 호출 단위. 매 분 새로 시작이므로 사실상 동일 (ticker, market) 중복 호출만 방지)
  const cache = new Map<string, Awaited<ReturnType<typeof fetchPsychologySnapshot>>>()
  const cooldownCutoff = (cooldownMin: number) => new Date(Date.now() - cooldownMin * 60_000).toISOString()

  const triggered: Array<{ row: Row; reason: string; detail: string }> = []
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

    // 쿨다운 체크
    const { data: recent } = await admin
      .from('psychology_analyses')
      .select('id')
      .eq('user_id', r.user_id).eq('ticker', r.ticker).eq('market', r.market)
      .gte('created_at', cooldownCutoff(s.cooldown_minutes))
      .limit(1)
    if (recent && recent.length > 0) continue

    triggered.push({ row: r, reason, detail })
  }

  // 4. 글로벌 분당 LLM 호출 상한: 가장 큰 변동/거래량 우선
  triggered.sort((a, b) => Number(b.detail.replace(/[^0-9.]/g,'')) - Number(a.detail.replace(/[^0-9.]/g,'')))
  const toRun = triggered.slice(0, GLOBAL_LLM_PER_MINUTE)

  let analyzed = 0
  for (const t of toRun) {
    const { row, reason, detail } = t
    const key = `${row.ticker}:${row.market}`
    let snapshot = cache.get(key)
    try {
      // 분석은 60개 분봉이 필요. 트리거 감지에 6개만 받았으므로 확장 fetch.
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
      // 알림 발송: 기존 in-app 알림 시스템 재사용
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
```

`user_notifications` 테이블 스키마는 기존에 사용 중인 형태에 맞춰 컬럼 이름 검증 필수. 스키마가 다르면 해당 부분만 조정.

- [ ] **Step 4: user_notifications 스키마 확인**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name='user_notifications' ORDER BY ordinal_position;
```

스키마에 맞춰 INSERT 컬럼명 조정. 알림 시스템이 다른 형태(예: 푸시 토큰 직접 발송)면 그 패턴을 따른다. `mcp__supabase__execute_sql` 사용.

- [ ] **Step 5: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/investment/psychology/cron/scan vercel.json
git commit -m "feat(psychology): Cron 이벤트 감시 + 자동 분석"
```

---

## Task 11: 점수 게이지 컴포넌트

**Files:**
- Create: `src/components/Investment/Psychology/ScoreGauge.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/components/Investment/Psychology/ScoreGauge.tsx
// 0~100 공포·탐욕 게이지. 0=극공포(빨강) → 50=중립(회색) → 100=극탐욕(파랑) 그라데이션.

interface Props { score: number; label: string }

export default function ScoreGauge({ score, label }: Props) {
  const clamped = Math.max(0, Math.min(100, score))
  return (
    <div className="rounded-xl border bg-white p-4 space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">공포·탐욕 지수</span>
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <div className="relative h-3 rounded-full bg-gradient-to-r from-red-500 via-gray-300 to-blue-500">
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-gray-700 shadow"
          style={{ left: `calc(${clamped}% - 8px)` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-gray-500">
        <span>0 공포</span><span>50 중립</span><span>100 탐욕</span>
      </div>
      <div className="text-2xl font-bold text-center">{clamped}</div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Investment/Psychology/ScoreGauge.tsx
git commit -m "feat(psychology): 점수 게이지 컴포넌트"
```

---

## Task 12: 분봉 차트 + 마커 컴포넌트

**Files:**
- Create: `src/components/Investment/Psychology/PsychologyChart.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
// src/components/Investment/Psychology/PsychologyChart.tsx
'use client'

import { LineChart, Line, XAxis, YAxis, ReferenceDot, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { MinuteCandle, PsychologyMarker } from '@/types/psychology'

const MARKER_COLOR: Record<string, string> = {
  panic_sell: '#ef4444',
  fomo_entry: '#f59e0b',
  accumulation: '#10b981',
  distribution: '#6366f1',
  capitulation: '#7c3aed',
  indecision: '#9ca3af',
}

interface Props {
  candles: MinuteCandle[]
  markers: PsychologyMarker[]
}

export default function PsychologyChart({ candles, markers }: Props) {
  const data = candles.map((c, i) => ({ idx: i, close: c.close, ts: c.ts.slice(11, 16) }))

  return (
    <div className="rounded-xl border bg-white p-3">
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="ts" tick={{ fontSize: 10 }} interval={9} />
          <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={48} />
          <Tooltip />
          <Line type="monotone" dataKey="close" stroke="#0ea5e9" dot={false} strokeWidth={1.5} />
          {markers.map((m, i) => {
            const c = candles[m.candle_index]
            if (!c) return null
            return (
              <ReferenceDot
                key={i}
                x={c.ts.slice(11, 16)}
                y={c.close}
                r={6}
                fill={MARKER_COLOR[m.kind] ?? '#374151'}
                stroke="#fff"
                strokeWidth={1.5}
                label={{ value: m.label, position: 'top', fontSize: 10, fill: '#374151' }}
              />
            )
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Investment/Psychology/PsychologyChart.tsx
git commit -m "feat(psychology): 분봉 차트 + 심리 마커"
```

---

## Task 13: 호가 압력 바 컴포넌트

**Files:**
- Create: `src/components/Investment/Psychology/OrderbookPressureBar.tsx`

- [ ] **Step 1: 컴포넌트 작성**

```tsx
import type { PsychologyOrderbookPressure } from '@/types/psychology'

export default function OrderbookPressureBar({ data }: { data: PsychologyOrderbookPressure }) {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-2">
      <div className="text-xs font-semibold text-gray-700">호가창 압력</div>
      <div className="flex h-6 rounded-md overflow-hidden">
        <div className="bg-red-500 text-white text-xs flex items-center justify-center" style={{ width: `${data.bid_pct}%` }}>
          매수 {data.bid_pct.toFixed(0)}%
        </div>
        <div className="bg-blue-500 text-white text-xs flex items-center justify-center" style={{ width: `${data.ask_pct}%` }}>
          매도 {data.ask_pct.toFixed(0)}%
        </div>
      </div>
      <p className="text-xs text-gray-600">{data.interpretation}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Investment/Psychology/OrderbookPressureBar.tsx
git commit -m "feat(psychology): 호가 압력 바 컴포넌트"
```

---

## Task 14: 분석 상세 + 이력 + 종목 추가 모달

**Files:**
- Create: `src/components/Investment/Psychology/AnalysisDetail.tsx`
- Create: `src/components/Investment/Psychology/AnalysisHistory.tsx`
- Create: `src/components/Investment/Psychology/AddTickerModal.tsx`

- [ ] **Step 1: AnalysisDetail**

```tsx
// src/components/Investment/Psychology/AnalysisDetail.tsx
'use client'
import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import ScoreGauge from './ScoreGauge'
import PsychologyChart from './PsychologyChart'
import OrderbookPressureBar from './OrderbookPressureBar'
import type { PsychologyAnalysisRecord } from '@/types/psychology'
import type { Market } from '@/types/investment'

interface Props {
  ticker: string
  market: Market
  latest: PsychologyAnalysisRecord | null
  onAnalyzed: (record: PsychologyAnalysisRecord) => void
}

export default function AnalysisDetail({ ticker, market, latest, onAnalyzed }: Props) {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onAnalyze = async () => {
    setRunning(true); setError(null)
    try {
      const res = await fetch('/api/investment/psychology/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker, market, triggerKind: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '분석 실패'); return }
      onAnalyzed(data)
    } finally { setRunning(false) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{ticker} <span className="text-sm text-gray-500">({market})</span></h2>
          {latest && (
            <p className="text-xs text-gray-500">
              마지막 분석: {new Date(latest.created_at).toLocaleString('ko-KR')}
            </p>
          )}
        </div>
        <button onClick={onAnalyze} disabled={running}
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          지금 분석하기
        </button>
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      {!latest && (
        <div className="text-center text-gray-500 py-12 border rounded-xl bg-gray-50">
          분석 이력이 없습니다. "지금 분석하기"를 눌러주세요.
        </div>
      )}

      {latest && (
        <>
          <ScoreGauge score={latest.psychology_score} label={latest.score_label} />
          <div className="flex flex-wrap gap-2">
            {latest.tags.map((t, i) => (
              <span key={i} className="inline-block px-2 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">{t}</span>
            ))}
          </div>
          <div className="rounded-xl border bg-white p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
            {latest.narrative}
          </div>
          <PsychologyChart candles={latest.input_snapshot.candles} markers={latest.markers} />
          {market === 'KR' && latest.orderbook_pressure && (
            <OrderbookPressureBar data={latest.orderbook_pressure} />
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: AnalysisHistory**

```tsx
// src/components/Investment/Psychology/AnalysisHistory.tsx
'use client'
import type { PsychologyAnalysisRecord } from '@/types/psychology'

export default function AnalysisHistory({ records, onSelect }: {
  records: PsychologyAnalysisRecord[]
  onSelect: (r: PsychologyAnalysisRecord) => void
}) {
  if (!records.length) return null
  return (
    <div className="rounded-xl border bg-white p-4">
      <h3 className="text-sm font-semibold mb-2 text-gray-700">최근 분석 이력</h3>
      <ul className="space-y-1 max-h-48 overflow-y-auto">
        {records.map(r => (
          <li key={r.id}>
            <button onClick={() => onSelect(r)}
              className="w-full text-left text-xs flex justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
              <span>{new Date(r.created_at).toLocaleString('ko-KR', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
              <span className="text-gray-500">{r.trigger_kind}</span>
              <span className="font-mono">{r.psychology_score}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: AddTickerModal**

```tsx
// src/components/Investment/Psychology/AddTickerModal.tsx
'use client'
import { useState } from 'react'
import { Loader2 } from 'lucide-react'

export default function AddTickerModal({ onClose, onAdded }: {
  onClose: () => void
  onAdded: () => void
}) {
  const [ticker, setTicker] = useState('')
  const [market, setMarket] = useState<'KR' | 'US'>('KR')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async () => {
    if (!ticker.trim()) return
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/investment/psychology/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker.trim(), market }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '추가 실패'); return }
      onAdded()
      onClose()
    } finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold">종목 추가</h3>
        <div>
          <label className="block text-xs font-semibold mb-1">시장</label>
          <div className="flex gap-2">
            {(['KR','US'] as const).map(m => (
              <button key={m} onClick={() => setMarket(m)}
                className={`px-3 py-1.5 rounded-lg text-sm ${market === m ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
                {m === 'KR' ? '한국' : '미국'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">티커</label>
          <input value={ticker} onChange={e => setTicker(e.target.value)}
            placeholder={market === 'KR' ? '예: 005930' : '예: AAPL'}
            className="w-full border rounded-lg px-3 py-2" />
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-sm">취소</button>
          <button onClick={onSubmit} disabled={submitting}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm inline-flex items-center gap-2">
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            추가
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: 빌드 + Commit**

Run: `npm run build`. Expected: 성공.

```bash
git add src/components/Investment/Psychology/
git commit -m "feat(psychology): 분석 상세/이력/추가 모달 컴포넌트"
```

---

## Task 15: 워치리스트 컴포넌트 + 메인 페이지

**Files:**
- Create: `src/components/Investment/Psychology/Watchlist.tsx`
- Create: `src/app/investment/psychology/page.tsx`

- [ ] **Step 1: Watchlist**

```tsx
// src/components/Investment/Psychology/Watchlist.tsx
'use client'
import { Trash2, Eye, EyeOff } from 'lucide-react'
import type { PsychologyWatchlistItem } from '@/types/psychology'

interface ItemWithLatest extends PsychologyWatchlistItem {
  latest_analysis?: { psychology_score: number; score_label: string; created_at: string } | null
}

export default function Watchlist({
  items, selected, onSelect, onToggleMonitoring, onDelete,
}: {
  items: ItemWithLatest[]
  selected: { ticker: string; market: string } | null
  onSelect: (it: ItemWithLatest) => void
  onToggleMonitoring: (it: ItemWithLatest) => void
  onDelete: (id: string) => void
}) {
  if (!items.length) {
    return <div className="text-sm text-gray-500 p-4 text-center">+ 버튼으로 종목을 추가해주세요.</div>
  }
  return (
    <ul className="space-y-1">
      {items.map(it => {
        const isActive = selected?.ticker === it.ticker && selected.market === it.market
        return (
          <li key={it.id}
            className={`group rounded-lg p-2 cursor-pointer ${isActive ? 'bg-blue-50 ring-1 ring-blue-300' : 'hover:bg-gray-50'}`}
            onClick={() => onSelect(it)}>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-semibold text-sm">{it.ticker}</span>
                <span className="text-[10px] text-gray-500">{it.market}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={e => { e.stopPropagation(); onToggleMonitoring(it) }}
                  className={`p-1 rounded ${it.monitoring_enabled ? 'text-blue-600' : 'text-gray-400'}`}
                  title={it.monitoring_enabled ? '모니터링 중' : 'OFF'}>
                  {it.monitoring_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete(it.id) }}
                  className="p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
            {it.latest_analysis && (
              <div className="mt-1 flex justify-between text-[10px] text-gray-500">
                <span>{it.latest_analysis.score_label}</span>
                <span className="font-mono font-semibold">{it.latest_analysis.psychology_score}</span>
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
```

- [ ] **Step 2: 메인 페이지**

```tsx
// src/app/investment/psychology/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import Watchlist from '@/components/Investment/Psychology/Watchlist'
import AnalysisDetail from '@/components/Investment/Psychology/AnalysisDetail'
import AnalysisHistory from '@/components/Investment/Psychology/AnalysisHistory'
import AddTickerModal from '@/components/Investment/Psychology/AddTickerModal'
import type { PsychologyWatchlistItem, PsychologyAnalysisRecord } from '@/types/psychology'
import type { Market } from '@/types/investment'

interface ItemWithLatest extends PsychologyWatchlistItem {
  latest_analysis?: { psychology_score: number; score_label: string; created_at: string } | null
}

export default function PsychologyPage() {
  const searchParams = useSearchParams()
  const [items, setItems] = useState<ItemWithLatest[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ ticker: string; market: Market } | null>(null)
  const [history, setHistory] = useState<PsychologyAnalysisRecord[]>([])
  const [latest, setLatest] = useState<PsychologyAnalysisRecord | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const reloadList = useCallback(async () => {
    const r = await fetch('/api/investment/psychology/watchlist')
    if (r.ok) setItems(await r.json())
  }, [])

  const reloadHistory = useCallback(async (ticker: string, market: Market) => {
    const r = await fetch(`/api/investment/psychology/analyses?ticker=${ticker}&market=${market}&limit=10`)
    if (!r.ok) return
    const arr = (await r.json()) as PsychologyAnalysisRecord[]
    setHistory(arr)
    setLatest(arr[0] ?? null)
  }, [])

  useEffect(() => {
    reloadList().then(() => setLoading(false))
  }, [reloadList])

  // 알림 클릭으로 들어온 ticker 자동 선택
  useEffect(() => {
    const t = searchParams.get('ticker')
    const m = searchParams.get('market') as Market | null
    if (!t || !m) return
    setSelected({ ticker: t.toUpperCase(), market: m })
    reloadHistory(t.toUpperCase(), m)
  }, [searchParams, reloadHistory])

  const onSelect = (it: ItemWithLatest) => {
    setSelected({ ticker: it.ticker, market: it.market })
    reloadHistory(it.ticker, it.market)
  }

  const onToggleMonitoring = async (it: ItemWithLatest) => {
    await fetch(`/api/investment/psychology/watchlist/${it.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monitoring_enabled: !it.monitoring_enabled }),
    })
    reloadList()
  }

  const onDelete = async (id: string) => {
    if (!confirm('삭제하시겠어요?')) return
    await fetch(`/api/investment/psychology/watchlist?id=${id}`, { method: 'DELETE' })
    reloadList()
    if (selected) {
      const stillExists = items.some(i => i.id !== id && i.ticker === selected.ticker && i.market === selected.market)
      if (!stillExists) { setSelected(null); setLatest(null); setHistory([]) }
    }
  }

  if (loading) {
    return <div className="p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
      <aside className="rounded-xl border bg-white p-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold">워치리스트</h2>
          <button onClick={() => setAddOpen(true)}
            className="p-1 rounded hover:bg-gray-100" title="종목 추가">
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <Watchlist
          items={items}
          selected={selected}
          onSelect={onSelect}
          onToggleMonitoring={onToggleMonitoring}
          onDelete={onDelete}
        />
        <div className="text-[10px] text-gray-400 mt-2">{items.length}/10</div>
      </aside>

      <section className="space-y-4">
        {!selected && (
          <div className="rounded-xl border bg-gray-50 p-12 text-center text-gray-500 text-sm">
            왼쪽에서 종목을 선택하세요.
          </div>
        )}
        {selected && (
          <>
            <AnalysisDetail
              ticker={selected.ticker}
              market={selected.market}
              latest={latest}
              onAnalyzed={(rec) => {
                setLatest(rec)
                setHistory(prev => [rec, ...prev].slice(0, 10))
              }}
            />
            <AnalysisHistory records={history} onSelect={(r) => setLatest(r)} />
          </>
        )}
      </section>

      {addOpen && <AddTickerModal onClose={() => setAddOpen(false)} onAdded={reloadList} />}
    </div>
  )
}
```

- [ ] **Step 3: 빌드 확인**

Run: `npm run build`
Expected: 성공.

- [ ] **Step 4: Commit**

```bash
git add src/components/Investment/Psychology/Watchlist.tsx src/app/investment/psychology/page.tsx
git commit -m "feat(psychology): 워치리스트 컴포넌트 + 메인 페이지"
```

---

## Task 16: 사이드바에 "심리 분석" 메뉴 추가

**Files:**
- Modify: `src/app/investment/layout.tsx`

- [ ] **Step 1: NAV_ITEMS에 항목 추가**

자동매매 항목 아래에 "심리 분석" 자식 표시(시각적 indent)를 추가:

```typescript
// src/app/investment/layout.tsx 상단 import에 Users 추가
import { ..., Users } from 'lucide-react'

// NAV_ITEMS 배열에 trading 다음 위치에 삽입
const NAV_ITEMS: NavItem[] = [
  // ... 기존 항목 유지
  { id: 'trading', label: '자동매매', icon: TrendingUp, href: '/investment/trading' },
  { id: 'psychology', label: '└ 심리 분석', icon: Users, href: '/investment/psychology' },
  { id: 'portfolio', label: '포트폴리오', icon: Briefcase, href: '/investment/portfolio' },
]
```

라벨에 `└` 접두사로 시각적 indent. lucide의 `Users` 아이콘 사용.

- [ ] **Step 2: 빌드 + 브라우저 검증**

Run: `npm run build`

Chrome DevTools MCP:
1. `whitedc0902@gmail.com`로 로그인 (Plan 1 완료 후 구독 활성 가정)
2. `/investment` 진입 → 사이드바에 "└ 심리 분석" 항목 표시
3. 클릭 → `/investment/psychology` 진입

- [ ] **Step 3: Commit**

```bash
git add src/app/investment/layout.tsx
git commit -m "feat(psychology): 사이드바에 심리 분석 자식 메뉴 추가"
```

---

## Task 17: 통합 검증 + develop 푸시

- [ ] **Step 1: 빌드 + 린트**

```bash
npm run lint && npm run build
```
Expected: 둘 다 통과.

- [ ] **Step 2: 워치리스트 CRUD 검증 (Chrome DevTools MCP)**

테스트 계정 `whitedc0902@gmail.com`로 로그인 (구독 활성 상태 사전 확인).

1. `/investment/psychology` 진입
2. + 버튼 → KR/005930 추가 → 워치리스트에 표시
3. + 버튼 → US/AAPL 추가
4. 11번째 추가 시도 → "10개까지" 에러 표시
5. 모니터링 토글 → DB 반영 확인 (`SELECT monitoring_enabled FROM psychology_watchlist`)
6. 삭제 → 목록에서 제거

- [ ] **Step 3: 온디맨드 분석 검증**

1. 005930 선택 → "지금 분석하기" 클릭
2. 분석 완료 → 점수 게이지, 태그 칩, 서술, 분봉 차트 + 마커, 호가 압력 바(KR) 모두 표시
3. 차트의 ReferenceDot 좌표가 markers의 candle_index와 정확히 일치하는지 시각 확인
4. AAPL 선택 → 분석 → 호가 압력 바 미표시 (US 종목)
5. `SELECT * FROM psychology_analyses ORDER BY created_at DESC LIMIT 2;` → 2건 행 존재

- [ ] **Step 4: 분당 5회 한도 검증**

1. 1분 안에 같은 종목 "지금 분석하기" 6회 연속 → 6번째 호출 429 에러 확인

- [ ] **Step 5: Cron 트리거 시뮬**

장중 시간 + 임계값을 강제로 낮춰서 트리거:

```sql
UPDATE psychology_watchlist
SET trigger_price_change_pct = 0.001, trigger_volume_multiplier = 0.001
WHERE user_id = '<test_user_id>' AND ticker = '005930';
```

dev에서 `curl http://localhost:3000/api/investment/psychology/cron/scan` 실행 → 응답에 `analyzed >= 1` 확인 + DB 신규 분석 행 + `user_notifications` 알림 행 확인.

장외 시간이라면 응답에 `skipped: 'market closed'` 확인. 시뮬은 production 검증으로.

- [ ] **Step 6: 미구독자 차단 검증**

구독 없는 임시 계정으로 `/investment/psychology` 직접 URL 진입 → Plan 1의 layout 게이팅이 `/investment/subscribe`로 리다이렉트하는지 확인.

- [ ] **Step 7: 모바일 레이아웃 검증**

`mcp__chrome-devtools__resize_page` 375x812(iPhone) → 좌측 워치리스트가 상단 가로 스크롤로 변환되거나 적어도 페이지가 깨지지 않는지 확인. 1차에선 데스크톱 그리드를 그대로 두고 모바일에선 1-column으로 자동 스택되는 것까지 OK.

- [ ] **Step 8: develop 푸시**

```bash
git push origin develop
```

푸시 실패 시 `git pull --rebase origin develop && git push origin develop` 재시도.

- [ ] **Step 9: PR 생성 → main 머지**

```bash
gh pr create --title "feat: 군중심리 분석 기능" \
  --base main --head develop \
  --body "$(cat <<'EOF'
## Summary
- 자동매매 사용자 대상 군중심리 분석 신기능
- 워치리스트(상한 10개) + 온디맨드/Cron 이벤트 트리거 분석
- Claude haiku 4.5로 점수·태그·서술·차트 마커 생성
- KR 종목은 호가 압력 분석 추가

## Test plan
- [ ] /investment/psychology 워치리스트 CRUD
- [ ] 온디맨드 분석 → 차트 마커 + 호가 압력
- [ ] 분당 5회 rate limit
- [ ] Cron 트리거 시뮬 → DB 행 + 알림
- [ ] 미구독자 차단 게이팅
EOF
)"
```

main 머지: `gh pr merge <number> --merge --admin`.

---

## Self-Review

### Spec coverage
- 5.2 데이터 모델 → Task 1
- 8.1 메뉴/사이드바 → Task 16
- 8.2 페이지 레이아웃 → Tasks 11-15
- 8.3 API 라우트 6개 → Tasks 6-10
- 8.4 LLM 호출 + 스키마 → Tasks 5
- 8.5 Cron 이벤트 트리거 → Task 10
- 10 시장 시간/비용 가드 → Tasks 3, 8, 10
- 11.3 Plan 2 테스트 → Task 17

### 미커버 점검
- 8.6 자동매매 시그널 후크는 1차에 미포함이라고 spec에 명시. 인덱스(5.2)는 Task 1에서 생성되어 후크 마련 완료.
- spec 11.4 회귀 가드(자동매매 외 다른 메뉴)는 Task 17 Step 1 빌드+린트로 부분 커버. 추가 수동 점검은 PR 리뷰 단계에서.

### Type consistency
- `PsychologyAnalysisRecord`/`PsychologyWatchlistItem`/`PsychologyMarker` Task 2 정의 → Tasks 6, 8, 9, 11-15 일관 사용.
- `Market` 타입은 기존 `@/types/investment` import.
- LLM 출력 `markers[i].candle_index`가 `input_snapshot.candles[i]` 인덱스 일치 — 스키마(Task 5) + 차트(Task 12) 일치.

### Placeholder scan
- 모든 step에 실제 코드 또는 명령 포함.
- `user_notifications` 스키마 점검(Task 10 Step 4)은 실제 행동 지시이므로 placeholder가 아님.
