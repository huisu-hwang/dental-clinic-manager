# 종목 상세 모달 + 즐겨찾기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 투자 모듈의 종목 입력 흐름에 (A) yahoo 펀더멘털 + 가격차트 + 시총 순위가 보이는 종목 상세 모달과 (B) Supabase에 영속되는 즐겨찾기 시스템을 추가한다.

**Architecture:** 기존 `useRecentTickers` / `RecentTickersButtons` 패턴을 그대로 답습한 `useFavorites` / `FavoritesButtons`를 신규 작성하고, 5개 페이지(전략관리/단타/전략비교/스크리너/스마트머니)의 RecentTickersButtons 바로 위에 한 줄을 삽입한다. 종목 정보는 yahoo-finance2 `quoteSummary`+`chart`를 한 번 호출하는 `/api/investment/ticker-info` 라우트로 통합 제공한다. KR 시총 순위는 `KR_TICKER_DICT` 전체에 대한 yahoo `marketCap` 스냅샷 JSON을 정렬 인덱스로 사용한다.

**Tech Stack:**
- Next.js 15 App Router (route handler) + Supabase (RLS 기반 신규 테이블 1)
- React 19 + TypeScript + Tailwind (AT Tokens)
- yahoo-finance2 (펀더멘털·차트), `BroadcastChannel`(다른 탭 동기화)
- recharts(차트)

**Spec 참조:** [docs/superpowers/specs/2026-05-06-ticker-info-modal-and-favorites-design.md](../specs/2026-05-06-ticker-info-modal-and-favorites-design.md)

---

## File Structure

### 신규
```
src/
├── app/api/investment/
│   ├── ticker-info/route.ts          # yahoo 펀더멘털 + 차트 + 시총 순위
│   └── favorites/route.ts            # GET/POST/DELETE 즐겨찾기 CRUD
├── components/Investment/
│   ├── TickerInfoModal.tsx           # 펀더멘털 패널 + 차트 + 즐겨찾기 토글
│   └── FavoritesButtons.tsx          # ★ 즐겨찾기 버튼 행 (5개 페이지 공통)
├── hooks/
│   └── useFavorites.ts               # API + BroadcastChannel + 낙관적 업데이트
├── lib/
│   └── krTickerCatalog.ts            # KR 시총 정렬 인덱스 헬퍼
├── data/
│   └── kr-tickers-marketcap.json     # KR 시총 스냅샷 (스크립트 산출물)
scripts/
└── fetch-kr-marketcap.mjs            # yahoo로 시총 일괄 수집
supabase/migrations/
└── 20260506_investment_favorites.sql
```

### 수정
| 파일 | 책임 |
|---|---|
| `src/components/Investment/ScreenerContent.tsx` | 행 클릭 = 모달 오픈 (인라인 펼침 제거) + FavoritesButtons 행 |
| `src/components/Investment/BacktestPanel.tsx` | FavoritesButtons 추가 |
| `src/components/Investment/SmartMoney/SmartMoneyContent.tsx` | FavoritesButtons 추가 |
| `src/components/Investment/CompareContent.tsx` | FavoritesButtons 추가 |
| `src/components/Investment/DayTradeContent.tsx` | FavoritesButtons 추가 |
| `src/components/Investment/InvestmentTab.tsx`(또는 그 안의 종목 입력 영역) | FavoritesButtons 추가 |

---

## 진행 원칙

- 매 task 완료마다 `npm run build` 확인 + `develop` 브랜치 commit
- 모든 task 완료 후 일괄 push
- yahoo-finance2의 데이터 누락 필드는 `null`로 응답, UI는 "—" 표시
- AT Tokens 준수 (`bg-at-surface`, `border-at-border`, `text-at-text`, `rounded-xl` 등)
- 신규 SQL은 `mcp__supabase__apply_migration`으로 적용 + `supabase/migrations/`에 동일 파일 보관

---

## Task 1: Supabase 마이그레이션 — investment_favorites 테이블

**Files:**
- Create: `supabase/migrations/20260506_investment_favorites.sql`
- Apply: Supabase MCP `apply_migration` (project_id `beahjntkmkfhpcbhfnrr`)

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/20260506_investment_favorites.sql`:

```sql
-- 투자 모듈 즐겨찾기 종목 (사용자별)
CREATE TABLE IF NOT EXISTS investment_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker      VARCHAR(20) NOT NULL,
  market      VARCHAR(2)  NOT NULL CHECK (market IN ('KR','US')),
  ticker_name TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, ticker, market)
);

CREATE INDEX IF NOT EXISTS idx_inv_fav_user
  ON investment_favorites (user_id, sort_order DESC, created_at DESC);

ALTER TABLE investment_favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inv_fav_select_own" ON investment_favorites;
CREATE POLICY "inv_fav_select_own" ON investment_favorites
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_fav_insert_own" ON investment_favorites;
CREATE POLICY "inv_fav_insert_own" ON investment_favorites
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_fav_update_own" ON investment_favorites;
CREATE POLICY "inv_fav_update_own" ON investment_favorites
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "inv_fav_delete_own" ON investment_favorites;
CREATE POLICY "inv_fav_delete_own" ON investment_favorites
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
```

- [ ] **Step 2: Supabase MCP로 적용**

```
mcp__supabase__apply_migration({
  project_id: "beahjntkmkfhpcbhfnrr",
  name: "20260506_investment_favorites",
  query: <위 SQL 전체>
})
```

- [ ] **Step 3: 적용 확인**

```
mcp__supabase__execute_sql({
  project_id: "beahjntkmkfhpcbhfnrr",
  query: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name='investment_favorites'"
})
```

응답에 `investment_favorites` 1행이 나와야 함.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260506_investment_favorites.sql
git commit -m "$(cat <<'EOF'
feat(investment): 즐겨찾기 테이블 investment_favorites 추가

- (user_id, ticker, market) UNIQUE
- RLS: 본인 행만 SELECT/INSERT/UPDATE/DELETE

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: KR 시총 스냅샷 스크립트 + 데이터 생성

**Files:**
- Create: `scripts/fetch-kr-marketcap.mjs`
- Create: `src/data/kr-tickers-marketcap.json` (스크립트 산출물)

- [ ] **Step 1: 스크립트 작성**

`scripts/fetch-kr-marketcap.mjs`:

```javascript
/**
 * KR_TICKER_DICT 전체 종목에 대해 yahoo-finance2의 marketCap을 가져와
 * src/data/kr-tickers-marketcap.json에 저장.
 *
 * 갱신이 필요할 때 수동 실행:
 *   node scripts/fetch-kr-marketcap.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import yahooFinance from 'yahoo-finance2'

const DICT_PATH = resolve(process.cwd(), 'src/lib/krTickerDict.ts')
const OUT_PATH = resolve(process.cwd(), 'src/data/kr-tickers-marketcap.json')
const CONCURRENCY = 5
const SPACING_MS = 200

function readDict() {
  const src = readFileSync(DICT_PATH, 'utf-8')
  // export const KR_TICKER_DICT: ... = [ ... ]
  // 각 entry: { ticker: '005930', name: '삼성전자', ... }
  // matchAll로 안전하게 모든 항목 추출 (RegExp.exec 루프 회피)
  const re = /\{\s*ticker:\s*'([0-9]{6})'\s*,\s*name:\s*'([^']+)'/g
  const entries = []
  for (const m of src.matchAll(re)) {
    entries.push({ ticker: m[1], name: m[2] })
  }
  return entries
}

async function fetchMarketCap(ticker) {
  // 코스피 우선, 실패 시 코스닥
  for (const suffix of ['.KS', '.KQ']) {
    try {
      const sym = ticker + suffix
      const sum = await yahooFinance.quoteSummary(sym, { modules: ['price', 'summaryDetail'] })
      const mc = sum?.price?.marketCap ?? sum?.summaryDetail?.marketCap ?? null
      if (typeof mc === 'number' && mc > 0) return mc
    } catch {
      // 다음 suffix 시도
    }
  }
  return 0
}

async function runWithLimit(items, limit, fn) {
  const out = new Array(items.length)
  let idx = 0
  async function worker() {
    while (true) {
      const i = idx++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
      await new Promise((r) => setTimeout(r, SPACING_MS))
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return out
}

async function main() {
  const dict = readDict()
  console.log(`[fetch-kr] entries: ${dict.length}`)
  let completed = 0
  const rows = await runWithLimit(dict, CONCURRENCY, async (e) => {
    const mc = await fetchMarketCap(e.ticker)
    completed++
    if (completed % 25 === 0) console.log(`  ${completed}/${dict.length} done`)
    return { ticker: e.ticker, name: e.name, market: 'KR', marketCap: mc }
  })

  rows.sort((a, b) => b.marketCap - a.marketCap)
  mkdirSync(resolve(process.cwd(), 'src/data'), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(rows), 'utf-8')
  const sizeKB = (JSON.stringify(rows).length / 1024).toFixed(0)
  const withMc = rows.filter((r) => r.marketCap > 0).length
  console.log(`[done] ${rows.length} entries (${withMc} with marketCap) -> ${OUT_PATH} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error('[fetch-kr-marketcap] failed:', err)
  process.exit(1)
})
```

- [ ] **Step 2: 스크립트 실행**

```bash
node scripts/fetch-kr-marketcap.mjs
```

예상 출력 (수 분 걸림):

```
[fetch-kr] entries: 230
  25/230 done
  ...
[done] 230 entries (220 with marketCap) -> .../src/data/kr-tickers-marketcap.json (XX KB)
```

산출 JSON이 200개 이상의 항목을 담고 있어야 함. 0건이면 yahoo 차단/네트워크 문제.

- [ ] **Step 3: JSON 검증**

```bash
node -e "const j=require('./src/data/kr-tickers-marketcap.json'); console.log('total:', j.length, 'top1:', j[0])"
```

`top1`이 시총 상위 종목(보통 005930 삼성전자)이어야 함.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-kr-marketcap.mjs src/data/kr-tickers-marketcap.json
git commit -m "$(cat <<'EOF'
feat(investment): KR 종목 시총 스냅샷 스크립트 + 데이터

- yahoo-finance2 .KS/.KQ로 KR_TICKER_DICT 전 종목 marketCap 수집
- 시총 내림차순 정렬해 src/data/kr-tickers-marketcap.json 생성
- US 카탈로그(scripts/fetch-us-tickers.mjs)와 동일 패턴

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: KR 시총 카탈로그 헬퍼

**Files:**
- Create: `src/lib/krTickerCatalog.ts`

- [ ] **Step 1: 헬퍼 작성**

`src/lib/krTickerCatalog.ts`:

```typescript
/**
 * KR 종목 시가총액 정적 카탈로그.
 *
 * 데이터: src/data/kr-tickers-marketcap.json (scripts/fetch-kr-marketcap.mjs 산출물)
 *
 * 갱신: yahoo-finance2 시총은 변동이 크지 않아 분기별 1회 정도 수동 실행 권장.
 */

import catalog from '@/data/kr-tickers-marketcap.json'

export interface KRMarketCapEntry {
  ticker: string
  name: string
  market: 'KR'
  marketCap: number
}

const ALL: KRMarketCapEntry[] = catalog as KRMarketCapEntry[]

/** marketCap > 0 인 종목만 시총 내림차순 정렬한 인덱스 */
let _ranked: KRMarketCapEntry[] | null = null
function rankedList(): KRMarketCapEntry[] {
  if (_ranked) return _ranked
  _ranked = ALL.filter((e) => e.marketCap > 0)
    .sort((a, b) => b.marketCap - a.marketCap)
  return _ranked
}

let _rankByTicker: Map<string, number> | null = null
function rankIndex(): Map<string, number> {
  if (_rankByTicker) return _rankByTicker
  const m = new Map<string, number>()
  rankedList().forEach((e, i) => m.set(e.ticker, i + 1))
  _rankByTicker = m
  return m
}

/** 1-based 시가총액 순위 (없으면 null) */
export function getKRMarketCapRank(ticker: string): number | null {
  const t = (ticker ?? '').trim()
  if (!t) return null
  return rankIndex().get(t) ?? null
}

/** 시총 (없으면 null) */
export function getKRMarketCap(ticker: string): number | null {
  const e = ALL.find((x) => x.ticker === ticker)
  if (!e || e.marketCap <= 0) return null
  return e.marketCap
}

/** 카탈로그 전체 크기 */
export function getKRCatalogSize(): number {
  return ALL.length
}

/** 시총 상위 N개 (스크리너 universe 등 용도) */
export function topKRByMarketCap(n: number): KRMarketCapEntry[] {
  return rankedList().slice(0, Math.max(0, n))
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

타입 에러 없이 통과해야 함.

- [ ] **Step 3: Commit**

```bash
git add src/lib/krTickerCatalog.ts
git commit -m "$(cat <<'EOF'
feat(investment): KR 시총 카탈로그 헬퍼 (krTickerCatalog)

- getKRMarketCapRank / getKRMarketCap / topKRByMarketCap 노출
- usTickerCatalog와 동일 패턴 (정렬 인덱스 모듈 캐시)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: ticker-info API 라우트

**Files:**
- Create: `src/app/api/investment/ticker-info/route.ts`

- [ ] **Step 1: 라우트 작성**

`src/app/api/investment/ticker-info/route.ts`:

```typescript
/**
 * 종목 펀더멘털 + 가격 차트 + 시총 순위 통합 조회.
 *
 *   GET /api/investment/ticker-info?ticker=AAPL&market=US&range=1mo
 *   GET /api/investment/ticker-info?ticker=005930&market=KR&range=3mo
 *
 * - yahoo-finance2 quoteSummary로 펀더멘털 + 시총 + price
 * - yahoo-finance2 chart로 가격 시계열
 * - 시총 순위: usTickerCatalog / krTickerCatalog 정렬 인덱스
 */

import { NextRequest, NextResponse } from 'next/server'
import yahooFinance from 'yahoo-finance2'
import { getUSCatalogEntry, topByMarketCap as topUSByMarketCap } from '@/lib/usTickerCatalog'
import { getKRMarketCapRank } from '@/lib/krTickerCatalog'

export const revalidate = 1800 // 30분 캐시

type Range = '1mo' | '3mo' | '1y'

function parseRange(v: string | null): Range {
  if (v === '3mo' || v === '1y') return v
  return '1mo'
}

function rangeToInterval(range: Range): { period: number; interval: '1d' | '1wk' } {
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000
  switch (range) {
    case '1mo': return { period: now - 35 * day, interval: '1d' }
    case '3mo': return { period: now - 100 * day, interval: '1d' }
    case '1y':  return { period: now - 380 * day, interval: '1wk' }
  }
}

async function resolveSymbol(ticker: string, market: 'KR' | 'US'): Promise<string | null> {
  const t = ticker.toUpperCase().trim()
  if (!t) return null
  if (market === 'US') return t
  // KR: .KS / .KQ 시도
  for (const suffix of ['.KS', '.KQ']) {
    try {
      await yahooFinance.quoteSummary(t + suffix, { modules: ['price'] })
      return t + suffix
    } catch {
      // 다음 suffix
    }
  }
  return null
}

// US 시총 순위 인덱스 — 모듈 로드 시 1회 빌드
let _us_rank: Map<string, number> | null = null
function getUSMarketCapRank(ticker: string): number | null {
  if (!_us_rank) {
    const list = topUSByMarketCap(10000)
    const m = new Map<string, number>()
    list.forEach((e, i) => m.set(e.ticker, i + 1))
    _us_rank = m
  }
  return _us_rank.get(ticker.toUpperCase()) ?? null
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = (searchParams.get('ticker') ?? '').trim()
  const market = searchParams.get('market') as 'KR' | 'US' | null
  const range = parseRange(searchParams.get('range'))

  if (!ticker) return NextResponse.json({ error: '종목 코드가 비어있습니다' }, { status: 400 })
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바르지 않은 시장 코드' }, { status: 400 })
  }

  const symbol = await resolveSymbol(ticker, market)
  if (!symbol) {
    return NextResponse.json({ error: '종목 정보를 찾을 수 없습니다' }, { status: 404 })
  }

  try {
    const sum = await yahooFinance.quoteSummary(symbol, {
      modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'financialData'],
    })

    const price = sum?.price ?? {}
    const detail = sum?.summaryDetail ?? {}
    const stats = sum?.defaultKeyStatistics ?? {}
    const fin = sum?.financialData ?? {}

    // 시총 순위
    const rank = market === 'US'
      ? getUSMarketCapRank(ticker)
      : getKRMarketCapRank(ticker)

    // 차트
    const { period, interval } = rangeToInterval(range)
    let chartPoints: Array<{ date: string; close: number }> = []
    try {
      const chart = await yahooFinance.chart(symbol, {
        period1: new Date(period),
        interval,
      })
      chartPoints = (chart?.quotes ?? [])
        .filter((q: any) => q?.date && typeof q?.close === 'number')
        .map((q: any) => ({
          date: new Date(q.date).toISOString().slice(0, 10),
          close: Number(q.close),
        }))
    } catch {
      // 차트 실패해도 본문은 응답
    }

    // 종목 이름 (US는 catalog 우선, 그 외는 yahoo)
    const usEntry = market === 'US' ? getUSCatalogEntry(ticker) : null
    const name = usEntry?.name ?? (price as any)?.shortName ?? (price as any)?.longName ?? ticker

    const body = {
      ticker: ticker.toUpperCase(),
      market,
      name,
      price: {
        current: numOrNull((price as any)?.regularMarketPrice),
        change: numOrNull((price as any)?.regularMarketChange),
        changePercent: numOrNull((price as any)?.regularMarketChangePercent),
        volume: numOrNull((price as any)?.regularMarketVolume),
        currency: (price as any)?.currency ?? (market === 'KR' ? 'KRW' : 'USD'),
      },
      range52w: {
        high: numOrNull((detail as any)?.fiftyTwoWeekHigh),
        low: numOrNull((detail as any)?.fiftyTwoWeekLow),
      },
      marketCap: numOrNull((price as any)?.marketCap ?? (detail as any)?.marketCap),
      marketCapRank: rank,
      fundamentals: {
        per: numOrNull((detail as any)?.trailingPE ?? (stats as any)?.trailingPE),
        pbr: numOrNull((stats as any)?.priceToBook),
        roe: numOrNull((fin as any)?.returnOnEquity),
        eps: numOrNull((stats as any)?.trailingEps ?? (fin as any)?.epsTrailingTwelveMonths),
        dividendYield: numOrNull((detail as any)?.dividendYield),
        revenue: numOrNull((fin as any)?.totalRevenue),
        operatingIncome: numOrNull((fin as any)?.operatingIncome),
        netIncome: numOrNull((fin as any)?.netIncomeToCommon ?? (stats as any)?.netIncomeToCommon),
        operatingMargin: numOrNull((fin as any)?.operatingMargins),
        profitMargin: numOrNull((fin as any)?.profitMargins),
        debtToEquity: numOrNull((fin as any)?.debtToEquity),
      },
      chart: { range, points: chartPoints },
      asOf: new Date().toISOString(),
    }

    return NextResponse.json(body, {
      headers: {
        'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=600',
      },
    })
  } catch (err: any) {
    console.error('[ticker-info] yahoo error:', err?.message)
    return NextResponse.json({ error: '종목 정보를 가져오지 못했습니다' }, { status: 502 })
  }
}

function numOrNull(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return v
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

타입 에러 없이 통과해야 함. `topByMarketCap` named export가 존재하지 않는다면 `usTickerCatalog.ts` 확인 후 정확한 함수명으로 교체.

- [ ] **Step 3: 수동 호출 검증**

dev 서버를 띄우고:

```bash
npm run dev
```

다음 호출이 200을 반환해야 함:

```bash
curl -s 'http://localhost:3000/api/investment/ticker-info?ticker=AAPL&market=US&range=1mo' | head -c 600
curl -s 'http://localhost:3000/api/investment/ticker-info?ticker=005930&market=KR&range=1mo' | head -c 600
```

각 응답에 `marketCapRank`이 정수(예: 1), `chart.points`에 20+개 포인트가 있어야 함.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/investment/ticker-info/route.ts
git commit -m "$(cat <<'EOF'
feat(investment): /api/investment/ticker-info 라우트 추가

- yahoo-finance2 quoteSummary + chart로 펀더멘털·차트·시총 통합
- KR/US 시장별 시총 순위(catalog 인덱스) 부여
- 30분 stale-while-revalidate 캐시

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: favorites API 라우트

**Files:**
- Create: `src/app/api/investment/favorites/route.ts`

- [ ] **Step 1: createSupabaseServerClient 경로 확인**

```bash
grep -rn "createSupabaseServerClient\|createServerClient" src/lib/supabase/ src/utils/supabase/ 2>/dev/null | head -10
```

다음 단계의 import 경로를 실제 export 경로로 교체. (예: `@/lib/supabase/server` 또는 `@/utils/supabase/server`)

- [ ] **Step 2: 라우트 작성**

`src/app/api/investment/favorites/route.ts`:

```typescript
/**
 * 사용자 즐겨찾기 종목 CRUD.
 *
 *   GET    /api/investment/favorites
 *   POST   /api/investment/favorites          { ticker, market, ticker_name? }
 *   DELETE /api/investment/favorites?ticker=...&market=KR|US
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

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
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { data, error } = await supabase
    .from('investment_favorites')
    .select('ticker, market, ticker_name, created_at, sort_order')
    .order('sort_order', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data as Row[]).map((r) => ({
    ticker: r.ticker,
    market: r.market,
    tickerName: r.ticker_name,
    createdAt: r.created_at,
  }))
  return NextResponse.json({ items })
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

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

  const { data, error } = await supabase
    .from('investment_favorites')
    .upsert(
      { user_id: user.id, ticker, market, ticker_name: body.ticker_name ?? null },
      { onConflict: 'user_id,ticker,market', ignoreDuplicates: false },
    )
    .select('ticker, market, ticker_name, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '인증 필요' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ticker = (searchParams.get('ticker') ?? '').trim().toUpperCase()
  const market = searchParams.get('market')
  if (!ticker) return NextResponse.json({ error: 'ticker 누락' }, { status: 400 })
  if (!isMarket(market)) return NextResponse.json({ error: 'market 잘못됨' }, { status: 400 })

  const { error } = await supabase
    .from('investment_favorites')
    .delete()
    .eq('user_id', user.id)
    .eq('ticker', ticker)
    .eq('market', market)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 4: 수동 검증 (개발 서버)**

```bash
npm run dev
```

브라우저에서 테스트 계정(`whitedc0902@gmail.com`)으로 로그인 후 DevTools Console에서:

```js
fetch('/api/investment/favorites').then(r => r.json()).then(console.log)
```

`{ items: [] }` 가 출력되어야 함.

POST로 임시 추가:

```js
fetch('/api/investment/favorites', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ticker: 'AAPL', market: 'US', ticker_name: 'Apple Inc.' }),
}).then(r => r.json()).then(console.log)
```

이후 다시 GET → 1건 반환 확인. 후속 task에서 UI로 검증할 거라 여기선 동작만 확인.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/investment/favorites/route.ts
git commit -m "$(cat <<'EOF'
feat(investment): /api/investment/favorites GET/POST/DELETE

- 본인 row만 조작(RLS 의존)
- POST는 (user_id,ticker,market) UNIQUE upsert

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: useFavorites 훅

**Files:**
- Create: `src/hooks/useFavorites.ts`

- [ ] **Step 1: 훅 작성**

`src/hooks/useFavorites.ts`:

```typescript
'use client'

/**
 * 사용자 즐겨찾기 종목 — 서버(Supabase)에 영속.
 * 5개 페이지(전략관리/단타/전략비교/스크리너/스마트머니)와 TickerInfoModal에서 공통 사용.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Market } from '@/types/investment'

export interface Favorite {
  ticker: string
  market: Market
  tickerName: string | null
  createdAt: string
}

const BROADCAST_CHANNEL = 'dcm-favorites-v1'

interface ListResponse {
  items?: Favorite[]
  error?: string
}

export function useFavorites(): {
  favorites: Favorite[]
  loading: boolean
  error: string | null
  add: (ticker: string, market: Market, tickerName?: string | null) => Promise<void>
  remove: (ticker: string, market: Market) => Promise<void>
  isFavorite: (ticker: string, market: Market) => boolean
  refresh: () => Promise<void>
} {
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<BroadcastChannel | null>(null)

  const refresh = useCallback(async () => {
    try {
      setError(null)
      const res = await fetch('/api/investment/favorites', { cache: 'no-store' })
      if (!res.ok) {
        if (res.status === 401) {
          setFavorites([])
          return
        }
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? 'fetch failed')
      }
      const data: ListResponse = await res.json()
      setFavorites(data.items ?? [])
    } catch (e: any) {
      setError(e?.message ?? '오류')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return
    const ch = new BroadcastChannel(BROADCAST_CHANNEL)
    channelRef.current = ch
    ch.onmessage = (ev) => {
      if (ev?.data === 'changed') refresh()
    }
    return () => {
      ch.close()
      channelRef.current = null
    }
  }, [refresh])

  const broadcast = useCallback(() => {
    try {
      channelRef.current?.postMessage('changed')
    } catch { /* noop */ }
  }, [])

  const add = useCallback(async (ticker: string, market: Market, tickerName?: string | null) => {
    const t = (ticker ?? '').trim().toUpperCase()
    if (!t || (market !== 'KR' && market !== 'US')) return
    const already = favorites.some((f) => f.ticker === t && f.market === market)
    if (already) return
    const optimistic: Favorite = {
      ticker: t,
      market,
      tickerName: tickerName ?? t,
      createdAt: new Date().toISOString(),
    }
    setFavorites((prev) => [optimistic, ...prev])
    try {
      const res = await fetch('/api/investment/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: t, market, ticker_name: tickerName ?? null }),
      })
      if (!res.ok) {
        setFavorites((prev) => prev.filter((f) => !(f.ticker === t && f.market === market)))
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? '저장 실패')
        return
      }
      broadcast()
    } catch (e: any) {
      setFavorites((prev) => prev.filter((f) => !(f.ticker === t && f.market === market)))
      setError(e?.message ?? '저장 실패')
    }
  }, [favorites, broadcast])

  const remove = useCallback(async (ticker: string, market: Market) => {
    const t = (ticker ?? '').trim().toUpperCase()
    if (!t || (market !== 'KR' && market !== 'US')) return
    const before = favorites
    setFavorites((prev) => prev.filter((f) => !(f.ticker === t && f.market === market)))
    try {
      const res = await fetch(`/api/investment/favorites?ticker=${encodeURIComponent(t)}&market=${market}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        setFavorites(before)
        const j = await res.json().catch(() => ({}))
        setError(j?.error ?? '삭제 실패')
        return
      }
      broadcast()
    } catch (e: any) {
      setFavorites(before)
      setError(e?.message ?? '삭제 실패')
    }
  }, [favorites, broadcast])

  const isFavorite = useCallback((ticker: string, market: Market) => {
    const t = (ticker ?? '').trim().toUpperCase()
    return favorites.some((f) => f.ticker === t && f.market === market)
  }, [favorites])

  return { favorites, loading, error, add, remove, isFavorite, refresh }
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useFavorites.ts
git commit -m "$(cat <<'EOF'
feat(investment): useFavorites 훅 — 서버 영속 + BroadcastChannel 동기화

- 낙관적 add/remove (실패 시 롤백)
- 다른 탭/창의 변경을 BroadcastChannel로 자동 반영

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: FavoritesButtons 컴포넌트

**Files:**
- Create: `src/components/Investment/FavoritesButtons.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/Investment/FavoritesButtons.tsx`:

```typescript
'use client'

/**
 * 즐겨찾기 종목을 버튼으로 노출 — RecentTickersButtons 위에 배치.
 * 클릭 시 onSelect 호출 (자동 검색/추가는 호출자 책임).
 */

import { Plus, Star, X } from 'lucide-react'
import { useFavorites } from '@/hooks/useFavorites'
import type { Market } from '@/types/investment'

interface Props {
  /** 'ALL' = KR/US 모두, 'KR' / 'US' = 해당 시장만 */
  market?: 'KR' | 'US' | 'ALL'
  /** 클릭 시 호출 — 부모가 폼 입력란에 채움 */
  onSelect: (ticker: string, name: string, market: Market) => void
  /** 이미 추가된 항목 키 (`${market}:${ticker}` 형식) — disabled 처리 */
  excludeKeys?: Set<string>
  /** 노출 최대 개수 (default 24) */
  limit?: number
  /** 작은 버튼 모드 */
  compact?: boolean
  /** 라벨 */
  label?: string
}

export default function FavoritesButtons({
  market = 'ALL',
  onSelect,
  excludeKeys,
  limit = 24,
  compact = false,
  label = '즐겨찾기',
}: Props) {
  const { favorites, loading, remove } = useFavorites()

  const filtered = favorites
    .filter((f) => market === 'ALL' || f.market === market)
    .slice(0, limit)

  if (loading && favorites.length === 0) return null
  if (filtered.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      <span className="text-xs text-at-text-weak inline-flex items-center gap-1 mr-1">
        <Star className="w-3 h-3 text-amber-500" />
        {label}:
      </span>
      {filtered.map((it) => {
        const key = `${it.market}:${it.ticker}`
        const already = excludeKeys?.has(key) === true
        const display = it.tickerName ?? it.ticker
        return (
          <span
            key={key}
            className={`inline-flex items-center rounded text-xs ${
              compact
                ? 'px-1.5 py-0.5 bg-amber-50 text-at-text-secondary border border-amber-200/60'
                : 'px-2 py-1 bg-amber-50 text-at-text-secondary border border-amber-200/60'
            } ${already ? 'opacity-40' : ''}`}
          >
            <button
              type="button"
              onClick={() => { if (!already) onSelect(it.ticker, display, it.market) }}
              disabled={already}
              title={`${display} (${it.ticker})${already ? ' · 이미 추가됨' : ''}`}
              className={`inline-flex items-center gap-1 ${already ? 'cursor-not-allowed' : 'hover:text-at-accent'}`}
            >
              <Plus className="w-3 h-3" />
              <span className={`text-[9px] px-1 rounded font-bold ${it.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {it.market}
              </span>
              <span className="truncate max-w-[110px]">{display}</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(it.ticker, it.market) }}
              title="즐겨찾기에서 제거"
              className="ml-1 text-at-text-weak hover:text-rose-500"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Investment/FavoritesButtons.tsx
git commit -m "$(cat <<'EOF'
feat(investment): FavoritesButtons — 즐겨찾기 빠른 추가 버튼 행

- RecentTickersButtons와 동일 외형, 별표 prefix + amber 톤
- excludeKeys로 이미 추가된 항목 disabled

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: TickerInfoModal — 가격 카드 + 펀더멘털 + 차트 + 즐겨찾기 토글

**Files:**
- Create: `src/components/Investment/TickerInfoModal.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/Investment/TickerInfoModal.tsx`:

```typescript
'use client'

/**
 * 종목 상세 모달 — 펀더멘털 + 시총 순위 + 가격 차트 + 즐겨찾기 토글.
 * 호출자: ScreenerContent (행 클릭), 추후 다른 페이지에서도 재사용 가능.
 */

import { useEffect, useState } from 'react'
import { Star, X, BarChart3, ExternalLink, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useFavorites } from '@/hooks/useFavorites'
import type { Market } from '@/types/investment'

type Range = '1mo' | '3mo' | '1y'

interface ApiResponse {
  ticker: string
  market: Market
  name: string
  price: {
    current: number | null
    change: number | null
    changePercent: number | null
    volume: number | null
    currency: string
  }
  range52w: { high: number | null; low: number | null }
  marketCap: number | null
  marketCapRank: number | null
  fundamentals: {
    per: number | null
    pbr: number | null
    roe: number | null
    eps: number | null
    dividendYield: number | null
    revenue: number | null
    operatingIncome: number | null
    netIncome: number | null
    operatingMargin: number | null
    profitMargin: number | null
    debtToEquity: number | null
  }
  chart: { range: Range; points: Array<{ date: string; close: number }> }
  asOf: string
}

interface Props {
  ticker: string
  market: Market
  tickerName?: string
  onClose: () => void
  onAnalyze?: (ticker: string, market: Market) => void
  extra?: React.ReactNode
}

export default function TickerInfoModal({ ticker, market, tickerName, onClose, onAnalyze, extra }: Props) {
  const [range, setRange] = useState<Range>('1mo')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isFavorite, add, remove } = useFavorites()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const url = `/api/investment/ticker-info?ticker=${encodeURIComponent(ticker)}&market=${market}&range=${range}`
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j?.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<ApiResponse>
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e) => { if (!cancelled) setError(e?.message ?? '오류') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market, range])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fav = isFavorite(ticker, market)
  const displayName = data?.name ?? tickerName ?? ticker

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-at-surface rounded-2xl shadow-2xl border border-at-border my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-at-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-at-text">{ticker}</span>
            <span className="text-at-text-secondary truncate">{displayName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {market === 'KR' ? '국내' : '미국'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fav ? remove(ticker, market) : add(ticker, market, displayName)}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border ${fav ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-at-border text-at-text-secondary hover:text-amber-600'}`}
              title={fav ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
            >
              <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-400 text-amber-500' : ''}`} />
              {fav ? '즐겨찾기됨' : '즐겨찾기'}
            </button>
            <button onClick={onClose} className="text-at-text-weak hover:text-at-text">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-at-text-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              종목 정보를 불러오는 중...
            </div>
          )}
          {error && !loading && (
            <div className="text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              <PriceCard data={data} />
              <FundamentalGrid data={data} />
              <ChartBlock data={data} range={range} setRange={setRange} />
            </>
          )}

          {extra}
        </div>

        <div className="px-5 py-3 border-t border-at-border flex items-center justify-end gap-2">
          {onAnalyze && (
            <button
              type="button"
              onClick={() => onAnalyze(ticker, market)}
              className="text-xs px-3 py-1.5 rounded border border-at-border text-at-text hover:bg-at-surface-alt inline-flex items-center gap-1"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              스마트머니 분석
            </button>
          )}
          <a
            href={market === 'KR'
              ? `https://finance.yahoo.com/quote/${ticker}.KS`
              : `https://finance.yahoo.com/quote/${ticker}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded border border-at-border text-at-text-secondary hover:bg-at-surface-alt inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            yahoo
          </a>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-at-accent text-white hover:opacity-90"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function PriceCard({ data }: { data: ApiResponse }) {
  const c = data.price.current
  const chg = data.price.change ?? 0
  const chgPct = data.price.changePercent ?? 0
  const positive = chg >= 0
  const color = positive ? 'text-rose-600' : 'text-blue-600'
  return (
    <div className="bg-at-surface-alt/40 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <p className="text-[11px] text-at-text-weak">현재가</p>
        <p className="text-2xl font-bold text-at-text font-mono">
          {c == null ? '—' : data.market === 'KR'
            ? `${Math.round(c).toLocaleString()}원`
            : `$${c.toFixed(2)}`}
        </p>
        <p className={`text-xs ${color} font-mono`}>
          {chg == null ? '' : `${positive ? '+' : ''}${chg.toFixed(2)} (${positive ? '+' : ''}${(chgPct).toFixed(2)}%)`}
        </p>
      </div>
      <div className="text-xs space-y-1">
        <Row k="52주 최고" v={fmtPrice(data.range52w.high, data.market)} />
        <Row k="52주 최저" v={fmtPrice(data.range52w.low, data.market)} />
        <Row k="거래량" v={data.price.volume == null ? '—' : data.price.volume.toLocaleString()} />
      </div>
      <div className="text-xs space-y-1">
        <Row k="시가총액" v={fmtMarketCap(data.marketCap, data.market)} />
        <Row k="시총 순위" v={data.marketCapRank == null ? '—' : `${data.market === 'KR' ? 'KR' : 'US'} #${data.marketCapRank}`} />
      </div>
    </div>
  )
}

function FundamentalGrid({ data }: { data: ApiResponse }) {
  const f = data.fundamentals
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Cell k="PER" v={fmtNum(f.per, 1)} />
      <Cell k="PBR" v={fmtNum(f.pbr, 2)} />
      <Cell k="ROE" v={fmtPct(f.roe, 1)} />
      <Cell k="영업이익률" v={fmtPct(f.operatingMargin, 1)} />
      <Cell k="순이익률" v={fmtPct(f.profitMargin, 1)} />
      <Cell k="EPS" v={fmtNum(f.eps, 2)} />
      <Cell k="배당수익률" v={fmtPct(f.dividendYield, 2)} />
      <Cell k="부채비율" v={fmtNum(f.debtToEquity, 2)} />
      <Cell k="매출" v={fmtBigMoney(f.revenue, data.market)} />
      <Cell k="영업이익" v={fmtBigMoney(f.operatingIncome, data.market)} />
      <Cell k="순이익" v={fmtBigMoney(f.netIncome, data.market)} />
      <Cell k="기준일" v={data.asOf.slice(0, 10)} />
    </div>
  )
}

function ChartBlock({ data, range, setRange }: { data: ApiResponse; range: Range; setRange: (r: Range) => void }) {
  const points = data.chart.points
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-at-text">최근 주가 흐름</p>
        <div className="inline-flex rounded border border-at-border overflow-hidden text-[11px]">
          {(['1mo', '3mo', '1y'] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 ${range === r ? 'bg-at-accent text-white' : 'bg-white text-at-text-secondary hover:bg-at-surface-alt'}`}
            >
              {r === '1mo' ? '1개월' : r === '3mo' ? '3개월' : '1년'}
            </button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <div className="text-xs text-at-text-weak bg-at-surface-alt/40 rounded-lg px-3 py-6 text-center">
          차트 데이터가 없습니다.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <XAxis dataKey="date" hide />
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Tooltip
                formatter={(v: any) => [data.market === 'KR' ? `${Math.round(v).toLocaleString()}원` : `$${(v as number).toFixed(2)}`, '종가']}
                labelFormatter={(l: string) => l}
              />
              <Line type="monotone" dataKey="close" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2"><span className="text-at-text-weak">{k}</span><span className="font-mono">{v}</span></div>
  )
}
function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="bg-white border border-at-border rounded px-2 py-1.5">
      <p className="text-[10px] text-at-text-weak">{k}</p>
      <p className="text-sm font-semibold font-mono text-at-text">{v}</p>
    </div>
  )
}
function fmtNum(v: number | null, digits = 2): string {
  if (v == null) return '—'
  return v.toFixed(digits)
}
function fmtPct(v: number | null, digits = 2): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(digits)}%`
}
function fmtPrice(v: number | null, market: Market): string {
  if (v == null) return '—'
  return market === 'KR' ? `${Math.round(v).toLocaleString()}원` : `$${v.toFixed(2)}`
}
function fmtMarketCap(v: number | null, market: Market): string {
  if (v == null) return '—'
  if (market === 'KR') {
    if (v >= 1e12) return `${(v / 1e12).toFixed(2)}조원`
    if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억원`
    return v.toLocaleString()
  }
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}
function fmtBigMoney(v: number | null, market: Market): string {
  return fmtMarketCap(v, market)
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

recharts는 이미 의존성에 있어야 함. 없으면 `npm install recharts`로 추가 후 다시 빌드.

- [ ] **Step 3: Commit**

```bash
git add src/components/Investment/TickerInfoModal.tsx
git commit -m "$(cat <<'EOF'
feat(investment): TickerInfoModal — 펀더멘털 + 시총 순위 + 차트 + 즐겨찾기

- /api/investment/ticker-info 호출 + 1M/3M/1Y 토글
- 즐겨찾기 토글, ESC/배경 클릭 닫기
- 스마트머니 분석 onAnalyze 콜백

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: ScreenerContent — 행 클릭을 모달로 + FavoritesButtons 행 추가

**Files:**
- Modify: `src/components/Investment/ScreenerContent.tsx`

- [ ] **Step 1: imports + state 추가**

상단 imports에 다음 추가:

```typescript
import TickerInfoModal from './TickerInfoModal'
import FavoritesButtons from './FavoritesButtons'
```

함수 컴포넌트 본문(state 영역)에 추가:

```typescript
const [infoTicker, setInfoTicker] = useState<{ ticker: string; market: 'KR' | 'US'; name: string } | null>(null)
```

- [ ] **Step 2: 행 클릭 동작 변경**

`onClick={() => toggleExpand(rowKey)}` (약 463줄)을 다음으로 교체:

```typescript
onClick={() => setInfoTicker({ ticker: m.ticker, market: m.market, name: m.name })}
```

펼침 토글 아이콘(`<ChevronDown />` / `<ChevronRight />`)과 펼침 행(`{expanded && (...)`) 블록 전체를 제거.

- [ ] **Step 3: 모달 렌더 추가**

컴포넌트 최하단(다른 모달과 같은 레벨)에 추가:

```tsx
{infoTicker && (() => {
  // 현재 모달이 가리키는 매치 객체 찾기 — 스크리너 결과 배열의 실제 변수명에 맞게 조정
  // (파일에서 strategyResults / results 등 실제로 쓰이는 이름 확인)
  const match = strategyResults
    .flatMap((r: any) => r.matches.map((m: any) => ({ ...m, _strategyKey: r.strategyKey, _strategyLabel: r.strategyLabel })))
    .find((m: any) => m.ticker === infoTicker.ticker && m.market === infoTicker.market)
  return (
    <TickerInfoModal
      ticker={infoTicker.ticker}
      market={infoTicker.market}
      tickerName={infoTicker.name}
      onClose={() => setInfoTicker(null)}
      extra={match ? (
        <div className="bg-blue-50/30 border border-blue-200/60 rounded-lg p-3 space-y-2">
          <p className="text-xs font-semibold text-at-text">스크리너 매치 ({match._strategyLabel})</p>
          <div>
            <p className="text-[11px] text-at-text-weak mb-1">충족 조건</p>
            <ul className="space-y-0.5">
              {match.matchedConditions.map((c: string, i: number) => (
                <li key={i} className="text-[11px] font-mono bg-white rounded px-2 py-1">{c}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] text-at-text-weak mb-1">지표값</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(match.indicators).map(([id, val]) => (
                <span key={id} className="text-[10px] font-mono bg-white border border-at-border rounded px-2 py-1">
                  <span className="text-at-text-secondary">{id}:</span>{' '}
                  {typeof val === 'number'
                    ? val.toFixed(Math.abs(val) >= 100 ? 1 : 2)
                    : Object.entries(val as Record<string, number>).map(([k, v]) => `${k}=${(v as number).toFixed(2)}`).join(', ')}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    />
  )
})()}
```

`strategyResults` 변수명은 파일에서 사용하는 실제 이름(map 대상인 결과 배열)으로 교체할 것.

- [ ] **Step 4: FavoritesButtons 행 추가**

스크리너 검색/풀 선택 영역 위쪽 (RecentTickersButtons가 노출되는 곳) 바로 위에 추가:

```tsx
<FavoritesButtons
  market="ALL"
  onSelect={(ticker, name, market) => {
    // 스크리너는 풀 기반이라 종목을 직접 추가하지 않음 — 클릭 시 모달 오픈
    setInfoTicker({ ticker, market, name })
  }}
/>
```

스크리너에 RecentTickersButtons가 없다면 페이지 헤더 영역(필터/풀 선택 위)에 적당한 자리를 잡아 삽입.

- [ ] **Step 5: 사용하지 않게 된 변수 / import 정리**

`expandedTickers`, `toggleExpand`, `<ChevronDown />`, `<ChevronRight />` 사용처가 사라졌다면 모두 제거.

- [ ] **Step 6: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 7: 수동 검증 (테스트 계정 로그인)**

```bash
npm run dev
```

브라우저(`whitedc0902@gmail.com` 로그인) → `/investment` → 스크리너 → 결과 행 클릭 → 모달 오픈, 펀더멘털·시총·차트·매치 정보 모두 표시. 모달 ★ 클릭으로 즐겨찾기 토글 확인.

- [ ] **Step 8: Commit**

```bash
git add src/components/Investment/ScreenerContent.tsx
git commit -m "$(cat <<'EOF'
feat(screener): 결과 행 클릭 시 종목 상세 모달 + 즐겨찾기 통합

- 인라인 펼침 제거, 클릭 = TickerInfoModal 오픈으로 통일
- 매치된 충족조건/지표값은 모달 extra 영역에 표시
- 검색 영역 위에 FavoritesButtons 행 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: BacktestPanel — FavoritesButtons 추가

**Files:**
- Modify: `src/components/Investment/BacktestPanel.tsx`

- [ ] **Step 1: 종목 입력 영역 확인**

```bash
grep -n "RecentTickersButtons\|TickerSearch" src/components/Investment/BacktestPanel.tsx | head
grep -n "RecentTickersButtons" src/components/Investment/BacktestPanel.tsx -A 8
```

`RecentTickersButtons`가 사용하는 `onSelect` / `excludeKeys` prop의 실제 변수명 파악.

- [ ] **Step 2: import + 컴포넌트 한 줄 삽입**

```typescript
import FavoritesButtons from './FavoritesButtons'
```

`<RecentTickersButtons ... />` JSX **바로 위**에 추가 (실제 변수명은 grep 결과에 맞춤):

```tsx
<FavoritesButtons
  market="ALL"
  onSelect={(ticker, name, market) => {
    // RecentTickersButtons.onSelect와 동일한 핸들러를 호출
    handleAddTicker(ticker, name, market)
  }}
  excludeKeys={excludeKeys}
/>
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Investment/BacktestPanel.tsx
git commit -m "$(cat <<'EOF'
feat(backtest): 즐겨찾기 종목 빠른 추가 버튼 행

- RecentTickersButtons 위에 FavoritesButtons 행 노출

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: SmartMoneyContent — FavoritesButtons 추가

**Files:**
- Modify: `src/components/Investment/SmartMoney/SmartMoneyContent.tsx`

- [ ] **Step 1: 변수명 확인 + 컴포넌트 삽입**

```bash
grep -n "RecentTickersButtons" src/components/Investment/SmartMoney/SmartMoneyContent.tsx -A 8
```

```typescript
import FavoritesButtons from '../FavoritesButtons'
```

`<RecentTickersButtons ... />` 바로 위에:

```tsx
<FavoritesButtons
  market="ALL"
  onSelect={(ticker, name, market) => {
    // SmartMoneyContent의 종목 선택 핸들러 호출 (실제 함수명은 grep 결과로)
    handleSelectTicker(ticker, market, name)
  }}
/>
```

(SmartMoneyContent는 단일 종목 분석이라 excludeKeys 불필요.)

- [ ] **Step 2: 빌드 + 수동 검증**

```bash
npm run build
npm run dev
```

`/investment/smart-money` 진입 시 FavoritesButtons 행 노출, 즐겨찾기 클릭 시 ticker가 입력란/Picker에 채워지는지 확인.

- [ ] **Step 3: Commit**

```bash
git add src/components/Investment/SmartMoney/SmartMoneyContent.tsx
git commit -m "$(cat <<'EOF'
feat(smart-money): 즐겨찾기 종목 빠른 추가 버튼 행

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: CompareContent — FavoritesButtons 추가

**Files:**
- Modify: `src/components/Investment/CompareContent.tsx`

- [ ] **Step 1: 변수명 확인 + 컴포넌트 삽입**

```bash
grep -n "RecentTickersButtons" src/components/Investment/CompareContent.tsx -A 8
```

```typescript
import FavoritesButtons from './FavoritesButtons'
```

`<RecentTickersButtons ... />` 바로 위에:

```tsx
<FavoritesButtons
  market="ALL"
  onSelect={(ticker, name, market) => {
    addTicker(ticker, name, market)
  }}
  excludeKeys={tickerExcludeKeys}
/>
```

(실제 prop/함수 이름은 grep으로 확인.)

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Investment/CompareContent.tsx
git commit -m "$(cat <<'EOF'
feat(compare): 즐겨찾기 종목 빠른 추가 버튼 행

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: DayTradeContent — FavoritesButtons 추가

**Files:**
- Modify: `src/components/Investment/DayTradeContent.tsx`

- [ ] **Step 1: 변수명 확인 + 컴포넌트 삽입**

```bash
grep -n "RecentTickersButtons" src/components/Investment/DayTradeContent.tsx -A 8
```

```typescript
import FavoritesButtons from './FavoritesButtons'
```

`<RecentTickersButtons ... />` 위에:

```tsx
<FavoritesButtons
  market="ALL"
  onSelect={(ticker, name, market) => {
    handleAddTicker(ticker, name, market)
  }}
  excludeKeys={excludeKeys}
/>
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Investment/DayTradeContent.tsx
git commit -m "$(cat <<'EOF'
feat(daytrade): 즐겨찾기 종목 빠른 추가 버튼 행

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: 전략 관리(InvestmentTab) — FavoritesButtons 추가

**Files:**
- Modify: `src/components/Investment/InvestmentTab.tsx` (또는 그 안에서 종목 입력을 담당하는 분리된 컴포넌트)

- [ ] **Step 1: 종목 입력 위치 식별**

```bash
grep -n "RecentTickersButtons" src/components/Investment/InvestmentTab.tsx -A 8
grep -rn "RecentTickersButtons" src/components/Investment/ | grep -v ".test."
```

전략 카드 / 추가 폼이 별도 파일(예: `StrategyWatchlistEditor.tsx` / `AddStrategyForm.tsx`)에 있으면 해당 파일을 모두 대상으로 한다.

- [ ] **Step 2: import + 컴포넌트 삽입**

각 위치에 동일 패턴 적용:

```typescript
import FavoritesButtons from './FavoritesButtons'
```

(상대 경로는 파일 위치에 맞게 — 예를 들어 `Investment/SubFolder/Editor.tsx`라면 `'../FavoritesButtons'`.)

`<RecentTickersButtons ... />` 위에:

```tsx
<FavoritesButtons
  market="ALL"
  onSelect={(ticker, name, market) => {
    onAddTicker(ticker, name, market) // 실제 prop 이름은 grep 결과로
  }}
  excludeKeys={excludeKeys}
/>
```

- [ ] **Step 3: 빌드 확인**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/components/Investment/InvestmentTab.tsx
# (필요시 추가 수정 파일도 staged)
git commit -m "$(cat <<'EOF'
feat(strategy): 전략 관리 종목 입력에 즐겨찾기 버튼 행

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: 통합 검증 + 푸시

- [ ] **Step 1: 전체 빌드**

```bash
npm run build
```

타입/컴파일 오류 0건.

- [ ] **Step 2: 수동 E2E (테스트 계정 `whitedc0902@gmail.com`)**

```bash
npm run dev
```

체크리스트:
- [ ] `/investment` 스크리너 → 결과 행 클릭 → 모달 오픈
- [ ] 모달에 PER/PBR/ROE/영업이익률/매출 등 펀더멘털 표시 (값 또는 "—")
- [ ] 모달 우상단 시장 카드에 "KR #N" 또는 "US #N" 시총 순위 표시
- [ ] 차트 1M/3M/1Y 토글 정상 작동
- [ ] 모달 ★ 클릭 → 즐겨찾기 토글, 닫고 다시 보면 ★ 상태 유지
- [ ] 같은 사용자로 다른 탭 열어 즐겨찾기 변경 → 다른 탭에서도 자동 반영 (BroadcastChannel)
- [ ] 5개 페이지(전략관리/단타/전략비교/스크리너/스마트머니) 진입 시 즐겨찾기 버튼 행 노출
- [ ] 즐겨찾기 버튼 클릭 시 입력란에 채워지고, **자동 검색/추가는 일어나지 않음**
- [ ] 잘못된 ticker (예: `ZZZZZZZ`) → 모달에서 "종목 정보를 찾을 수 없습니다" 에러 표시

문제 발견 시 → 수정 → Step 1부터 재검증.

- [ ] **Step 3: 콘솔 에러 확인**

Chrome DevTools Console에 빨간 에러가 없는지 확인. 있으면 원인 파악 후 수정.

- [ ] **Step 4: 푸시**

```bash
git push origin develop
```

푸시 실패 시:
1. `git pull --rebase origin develop`
2. 충돌 해결
3. `git push origin develop` 재시도

성공할 때까지 반복 (CLAUDE.md "절대 멈추지 말 것" 원칙).

- [ ] **Step 5: WORK_LOG 업데이트**

`.claude/WORK_LOG.md` 상단에 항목 추가:

```markdown
## 2026-05-06 [기능 개발] 종목 상세 모달 + 즐겨찾기

**키워드:** #investment #favorites #screener #ticker-info

### 📋 작업 내용
- 신규 테이블 investment_favorites + RLS
- /api/investment/ticker-info (yahoo 펀더멘털·차트·시총 순위)
- /api/investment/favorites GET/POST/DELETE
- TickerInfoModal, FavoritesButtons 컴포넌트
- 5개 페이지(전략관리/단타/전략비교/스크리너/스마트머니)에 즐겨찾기 행 통합
- 스크리너 행 클릭 = 모달 오픈 (인라인 펼침 제거)

### ✅ 검증
- 빌드 통과, 5개 페이지 즐겨찾기 클릭/추가/제거 확인
- BroadcastChannel 다른 탭 동기화 OK
- 잘못된 ticker는 친절한 에러 메시지

---
```

```bash
git add .claude/WORK_LOG.md
git commit -m "docs(work-log): 종목 상세 모달 + 즐겨찾기 기능 기록"
git push origin develop
```

---

## Self-Review

**Spec coverage:**
- §3 아키텍처 — Task 1~7로 모두 커버
- §4 종목 상세 모달 — Task 8 (TickerInfoModal) + Task 4 (API)
- §5 즐겨찾기 — Task 1 (DB) + Task 5 (API) + Task 6 (훅) + Task 7 (UI 컴포넌트) + Task 9~14 (5개 페이지 통합)
- §6 ticker-info API — Task 4
- §7 KR 시총 스냅샷 — Task 2 (스크립트/데이터) + Task 3 (헬퍼)
- §9 검증 체크리스트 — Task 15

빠진 항목 없음.

**Placeholder scan:**
- Task 10~14의 통합 코드는 `handleAddTicker` / `excludeKeys` 같은 호출자별 변수명을 grep 결과에 맞춰 정확히 매칭하라고 안내. 코드 자체는 명시되어 있으며, 구현자는 실제 변수명만 확인하면 된다.
- Task 5의 `createSupabaseServerClient` 임포트 경로는 grep으로 확인 후 정확 경로로 교체.

**Type consistency:**
- `Favorite`: `useFavorites.ts`(Task 6) ↔ `favorites/route.ts`(Task 5) — `{ ticker, market, tickerName, createdAt }` 일관.
- `Range`: Task 4(API) ↔ Task 8(모달) — `'1mo' | '3mo' | '1y'` 일관.
- `Market`: 기존 `@/types/investment` 타입 재사용.
- `marketCapRank`: API에서 `number | null`, 모달에서 동일 표기 처리.
