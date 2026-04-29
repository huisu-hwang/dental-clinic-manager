# 백테스트 히스토리 — 비교 페이지 통합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/investment/compare` 페이지에 [히스토리] 탭을 추가해 `backtest_runs` 누적 결과를 필터링·정렬·다중선택비교 가능하게 한다.

**Architecture:** 기존 `CompareContent.tsx`(1698줄)는 그대로 두고 상단 탭 wrapper만 추가. 신규 코드는 `src/components/Investment/CompareHistory/` 하위에 격리. API는 `/api/investment/backtest` GET 핸들러에 필터 파라미터를 추가만 한다 (DB 스키마 변경 없음).

**Tech Stack:**
- Next.js 15 App Router (route handler) + Supabase (`backtest_runs` 테이블)
- React 19 + TypeScript + Tailwind (AT Tokens)
- 정렬·필터는 클라이언트 + 서버 hybrid (필터=서버, 정렬=클라이언트)

**Spec 참조:** [docs/superpowers/specs/2026-04-30-backtest-history-design.md](../specs/2026-04-30-backtest-history-design.md)

---

## File Structure

### 수정
| 파일 | 책임 |
|---|---|
| `src/app/api/investment/backtest/route.ts` | GET에 `strategy_id` / `ticker` / `since` / `until` / `limit` / `ids` 파라미터 추가 |
| `src/components/Investment/CompareContent.tsx` | 최상단 탭 wrapper만 추가 (기존 메인 콘텐츠는 별도 함수로 분리해 한 탭에 렌더) |

### 신규
```
src/components/Investment/CompareHistory/
├── HistoryTab.tsx           # 컨테이너 (filters + table + 다중선택 비교)
├── HistoryFilters.tsx       # 전략 select + ticker 검색 + 기간 preset
├── HistoryTable.tsx         # 정렬 가능 컬럼 + 체크박스 + 펼침 토글
├── HistoryRowDetail.tsx     # 인라인 펼침 콘텐츠 (sparkline + trades + 메트릭)
└── HistoryCompareView.tsx   # 다중 선택 matrix table + equity overlay
```

### 테스트
- API: `dental-clinic-manager/__tests__/api/investment/backtest-get.test.ts` (vitest. 프로젝트 내 vitest 미설치 시 Task 1에서 추가)

---

## 진행 원칙

- TDD 흐름은 API에만 적용 (UI는 smoke test 수준만)
- 각 task 완료 시 `develop` 브랜치에 commit. push는 모든 task 완료 후 일괄
- AT Tokens (`bg-at-accent`, `text-at-text`, `border-at-border`, `rounded-xl`) 준수
- 큰 변경은 별도 task로 격리

---

## Task 1: vitest 도입 + GET 라우트 단위 테스트 환경

**Files:**
- Modify: `dental-clinic-manager/package.json` (vitest devDep)
- Create: `dental-clinic-manager/vitest.config.ts`
- Create: `dental-clinic-manager/__tests__/api/investment/backtest-get.test.ts`

- [ ] **Step 1: vitest 설치 여부 확인**

```bash
cd /Users/hhs/Project/dental-clinic-manager/dental-clinic-manager
grep -E '"vitest"' package.json || echo "no vitest"
```

`no vitest`이면 Step 2로. 이미 있으면 Step 3로 직진.

- [ ] **Step 2: vitest devDependency + 스크립트 추가**

`package.json`의 `devDependencies`에 추가:

```json
"vitest": "^2.1.0"
```

`scripts`에 추가:

```json
"test:unit": "vitest run",
"test:unit:watch": "vitest"
```

설치:

```bash
npm install
```

`vitest.config.ts`(루트):

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    environment: 'node',
    testTimeout: 10000,
  },
})
```

- [ ] **Step 3: 첫 실패 테스트 작성**

`dental-clinic-manager/__tests__/api/investment/backtest-get.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// requireAuth + getSupabaseAdmin을 mock
vi.mock('@/lib/auth/requireAuth', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 'user-1' }, error: null, status: 200 })),
}))

const supabaseChain = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  single: vi.fn(),
}

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: vi.fn(() => supabaseChain),
}))

import { GET } from '@/app/api/investment/backtest/route'

function makeReq(qs: string): Request {
  return new Request(`http://localhost/api/investment/backtest?${qs}`)
}

describe('GET /api/investment/backtest filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.values(supabaseChain).forEach((fn: any) => {
      if (typeof fn === 'function' && 'mockReturnThis' in fn) fn.mockReturnThis()
    })
  })

  it('returns rows with strategy_id + ticker + since + limit', async () => {
    const rows = [
      { id: 'r1', strategy_id: 's1', ticker: 'AAPL', total_return: 0.18, executed_at: '2026-04-29T00:00:00Z' },
    ]
    // 종단 메서드는 await 시 Promise<{data, error}> 형태
    const last = vi.fn().mockResolvedValue({ data: rows, error: null })
    supabaseChain.limit = last as any

    const resp = await GET(makeReq('strategy_id=s1&ticker=AAPL&since=2026-04-01&limit=50') as any)
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.data).toEqual(rows)
    expect(supabaseChain.eq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(supabaseChain.eq).toHaveBeenCalledWith('strategy_id', 's1')
    expect(supabaseChain.eq).toHaveBeenCalledWith('ticker', 'AAPL')
    expect(supabaseChain.gte).toHaveBeenCalledWith('executed_at', '2026-04-01')
    expect(supabaseChain.limit).toHaveBeenCalledWith(50)
  })

  it('caps limit to 200', async () => {
    const last = vi.fn().mockResolvedValue({ data: [], error: null })
    supabaseChain.limit = last as any
    await GET(makeReq('limit=999') as any)
    expect(supabaseChain.limit).toHaveBeenCalledWith(200)
  })

  it('returns specific rows for ids=a,b,c', async () => {
    const last = vi.fn().mockResolvedValue({ data: [{ id: 'a' }, { id: 'b' }], error: null })
    supabaseChain.in = last as any
    const resp = await GET(makeReq('ids=a,b') as any)
    expect(resp.status).toBe(200)
    expect(supabaseChain.in).toHaveBeenCalledWith('id', ['a', 'b'])
  })

  it('rejects when ids contains non-uuid junk over 50 items', async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `id${i}`).join(',')
    const resp = await GET(makeReq(`ids=${ids}`) as any)
    expect(resp.status).toBe(400)
  })

  it('returns single row for ?id=xxx (existing behavior preserved)', async () => {
    supabaseChain.single = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null }) as any
    const resp = await GET(makeReq('id=r1') as any)
    expect(resp.status).toBe(200)
    const body = await resp.json()
    expect(body.data).toEqual({ id: 'r1' })
  })
})
```

- [ ] **Step 4: 실행 → FAIL (현재 라우트는 strategy_id/ticker/since/until/ids/limit cap을 지원하지 않음)**

```bash
npm run test:unit -- backtest-get
```

Expected: 4~5 fail (strategy_id/ticker/since/limit cap/ids 파라미터 미지원).

- [ ] **Step 5: 커밋**

```bash
cd /Users/hhs/Project/dental-clinic-manager
git add dental-clinic-manager/package.json dental-clinic-manager/package-lock.json dental-clinic-manager/vitest.config.ts dental-clinic-manager/__tests__/api/investment/backtest-get.test.ts
git commit -m "test(backtest-history): add vitest + failing tests for GET filters"
```

---

## Task 2: GET 라우트에 필터 구현

**Files:**
- Modify: `dental-clinic-manager/src/app/api/investment/backtest/route.ts:198-248`

- [ ] **Step 1: 기존 GET 핸들러 전체 교체**

`src/app/api/investment/backtest/route.ts`의 GET 함수만 다음으로 교체. POST 핸들러는 그대로 둔다.

```typescript
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const userId = auth.user!.id

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  const strategyId = searchParams.get('strategyId') ?? searchParams.get('strategy_id')
  const ticker = searchParams.get('ticker')?.trim() || null
  const since = searchParams.get('since')
  const until = searchParams.get('until')
  const idsCsv = searchParams.get('ids')
  const limitRaw = searchParams.get('limit')

  // 1) 단일 결과 — 기존 호환
  if (id) {
    const { data, error } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    if (error || !data) {
      return NextResponse.json({ error: '결과를 찾을 수 없습니다' }, { status: 404 })
    }
    return NextResponse.json({ data })
  }

  // 2) 다중 IDs (비교 view 로드용)
  if (idsCsv) {
    const ids = idsCsv.split(',').map(s => s.trim()).filter(Boolean)
    if (ids.length > 50) {
      return NextResponse.json({ error: 'ids는 최대 50개까지 가능합니다' }, { status: 400 })
    }
    const { data, error } = await supabase
      .from('backtest_runs')
      .select('*')
      .eq('user_id', userId)
      .in('id', ids)
    if (error) {
      return NextResponse.json({ error: '조회 실패' }, { status: 500 })
    }
    return NextResponse.json({ data: data ?? [] })
  }

  // 3) 필터 + 최신순 (히스토리 탭)
  let query = supabase
    .from('backtest_runs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'completed')

  if (strategyId) {
    if (!UUID_RE.test(strategyId)) {
      return NextResponse.json({ error: 'strategy_id 형식이 올바르지 않습니다' }, { status: 400 })
    }
    query = query.eq('strategy_id', strategyId)
  }
  if (ticker) {
    query = query.eq('ticker', ticker.toUpperCase())
  }
  if (since) {
    query = query.gte('executed_at', since)
  }
  if (until) {
    query = query.lte('executed_at', until)
  }
  const limit = Math.min(Number(limitRaw) || 50, 200)
  query = query.order('executed_at', { ascending: false }).limit(limit)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}
```

- [ ] **Step 2: 테스트 실행 → 모두 PASS**

```bash
cd dental-clinic-manager && npm run test:unit -- backtest-get
```

Expected: 5 PASS.

- [ ] **Step 3: 타입 체크**

```bash
npx tsc --noEmit 2>&1 | grep -i "backtest/route" | head
```

Expected: 출력 없음.

- [ ] **Step 4: 커밋**

```bash
cd /Users/hhs/Project/dental-clinic-manager
git add dental-clinic-manager/src/app/api/investment/backtest/route.ts
git commit -m "feat(backtest-api): GET filters strategy_id/ticker/since/until/ids/limit"
```

---

## Task 3: CompareContent에 탭 wrapper 추가

**Files:**
- Modify: `dental-clinic-manager/src/components/Investment/CompareContent.tsx`

기존 1698줄짜리 컴포넌트는 그대로 두고, default export 를 새 wrapper로 교체. 기존 콘텐츠는 `LiveCompareSection` 같은 내부 함수로 이름만 변경 후 wrapper에서 렌더한다.

- [ ] **Step 1: 파일 상단 import에 useState 추가 확인**

`src/components/Investment/CompareContent.tsx` 첫 줄들:

```typescript
import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
```

이미 useState 있음 — 변경 불필요.

- [ ] **Step 2: 기존 default export 함수명을 변경**

원본:

```typescript
export default function CompareContent() {
  // ...기존 1500여 줄
}
```

다음으로 변경:

```typescript
function LiveCompareSection() {
  // ...기존 본문 그대로
}
```

(`export default` 키워드 제거, 함수명만 `LiveCompareSection`으로)

- [ ] **Step 3: 파일 끝에 새 default export wrapper 추가**

파일 맨 끝(다른 internal 컴포넌트들 뒤)에 추가:

```typescript
import HistoryTab from './CompareHistory/HistoryTab'

type CompareTab = 'live' | 'history'

export default function CompareContent() {
  const [tab, setTab] = useState<CompareTab>('live')

  return (
    <div className="bg-white min-h-screen">
      <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 -mx-4 sm:-mx-6 flex gap-2">
        <button
          onClick={() => setTab('live')}
          className={`py-2 px-4 inline-flex items-center rounded-xl font-medium text-sm transition-colors ${
            tab === 'live' ? 'bg-at-accent-light text-at-accent' : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
          }`}
        >
          새로 비교
        </button>
        <button
          onClick={() => setTab('history')}
          className={`py-2 px-4 inline-flex items-center rounded-xl font-medium text-sm transition-colors ${
            tab === 'history' ? 'bg-at-accent-light text-at-accent' : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
          }`}
        >
          히스토리
        </button>
      </div>

      <div className="pt-4">
        {tab === 'live' ? <LiveCompareSection /> : <HistoryTab />}
      </div>
    </div>
  )
}
```

`import HistoryTab` 줄은 파일 상단 다른 import들과 함께 두는 게 깔끔하나, IDE가 자동 정렬할 가능성도 있어 위 위치 그대로 OK. 다음 task에서 HistoryTab을 만들기 전이라 import는 미존재 → 의도적 빌드 실패 (다음 task에서 해소).

- [ ] **Step 4: 빌드 시도 (실패 예상)**

```bash
cd dental-clinic-manager && npx tsc --noEmit 2>&1 | grep "CompareHistory/HistoryTab" | head
```

Expected: `Cannot find module './CompareHistory/HistoryTab'` — 다음 task에서 해소.

- [ ] **Step 5: 커밋**

```bash
git add dental-clinic-manager/src/components/Investment/CompareContent.tsx
git commit -m "feat(compare): add live/history tabs wrapper (HistoryTab stub follows)"
```

---

## Task 4: HistoryTab 컨테이너 (필터+표+선택바 골격)

**Files:**
- Create: `dental-clinic-manager/src/components/Investment/CompareHistory/HistoryTab.tsx`

- [ ] **Step 1: 골격 작성**

```tsx
'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { History as HistoryIcon } from 'lucide-react'
import HistoryFilters, { type HistoryFilterState } from './HistoryFilters'
import HistoryTable from './HistoryTable'
import HistoryCompareView from './HistoryCompareView'

export interface BacktestRunRow {
  id: string
  strategy_id: string | null
  ticker: string
  market: 'KR' | 'US'
  start_date: string
  end_date: string
  initial_capital: number
  status: string
  total_return: number | null
  sharpe_ratio: number | null
  max_drawdown: number | null
  total_trades: number | null
  win_rate: number | null
  equity_curve: Array<{ date: string; equity: number }> | null
  trades: Array<Record<string, unknown>> | null
  full_metrics: Record<string, unknown> | null
  executed_at: string
}

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

const DEFAULT_FILTER: HistoryFilterState = {
  strategyId: '',     // '전체'
  ticker: '',
  preset: '30d',
}

function presetToSince(preset: HistoryFilterState['preset']): string | null {
  switch (preset) {
    case '7d': return daysAgo(7)
    case '30d': return daysAgo(30)
    case '90d': return daysAgo(90)
    case 'all': return null
  }
}

export default function HistoryTab() {
  const [filter, setFilter] = useState<HistoryFilterState>(DEFAULT_FILTER)
  const [strategies, setStrategies] = useState<StrategyOption[]>([])
  const [rows, setRows] = useState<BacktestRunRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showCompare, setShowCompare] = useState(false)

  // 전략 옵션 1회 로드
  useEffect(() => {
    fetch('/api/investment/strategies')
      .then(r => r.json())
      .then((j: { data?: Array<{ id: string; name: string; strategy_type: StrategyOption['strategy_type'] }> }) => {
        setStrategies(j.data ?? [])
      })
      .catch(() => setStrategies([]))
  }, [])

  // 필터 변경 시 백테스트 재조회 (debounce 300ms)
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (filter.strategyId) params.set('strategy_id', filter.strategyId)
        if (filter.ticker.trim()) params.set('ticker', filter.ticker.trim())
        const since = presetToSince(filter.preset)
        if (since) params.set('since', since)
        params.set('limit', '50')
        const r = await fetch(`/api/investment/backtest?${params.toString()}`)
        if (!r.ok) {
          const err = (await r.json().catch(() => ({}))) as { error?: string }
          throw new Error(err.error ?? `${r.status}`)
        }
        const j = (await r.json()) as { data?: BacktestRunRow[] }
        setRows(j.data ?? [])
      } catch (e) {
        setError((e as Error).message)
        setRows([])
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [filter])

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectedRows = useMemo(
    () => rows.filter(r => selectedIds.has(r.id)),
    [rows, selectedIds],
  )

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <HistoryFilters
        value={filter}
        onChange={setFilter}
        strategies={strategies}
      />

      {error && (
        <div className="p-3 rounded-xl bg-at-error-bg text-at-error text-sm">
          조회 실패: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-at-accent" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 bg-at-surface-alt rounded-xl space-y-2">
          <HistoryIcon className="w-10 h-10 mx-auto text-at-text-weak" aria-hidden="true" />
          <p className="text-sm text-at-text-secondary">조건에 맞는 백테스트가 없습니다.</p>
          <p className="text-xs text-at-text-weak">[새로 비교] 탭에서 첫 백테스트를 실행해보세요.</p>
        </div>
      ) : (
        <HistoryTable
          rows={rows}
          strategies={strategies}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
        />
      )}

      {selectedIds.size >= 2 && !showCompare && (
        <div className="sticky bottom-4 z-10 flex justify-center">
          <button
            onClick={() => setShowCompare(true)}
            className="px-5 py-2.5 bg-at-accent hover:bg-at-accent-hover text-white rounded-xl text-sm font-medium shadow-lg"
          >
            선택 {selectedIds.size}개 비교
          </button>
        </div>
      )}

      {showCompare && selectedRows.length >= 2 && (
        <HistoryCompareView
          rows={selectedRows}
          strategies={strategies}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 빌드 (다른 모듈 미존재로 일부 실패)**

```bash
cd dental-clinic-manager && npx tsc --noEmit 2>&1 | grep "CompareHistory" | head
```

Expected: HistoryFilters / HistoryTable / HistoryCompareView 미존재 — 다음 task들에서 해소.

- [ ] **Step 3: 커밋**

```bash
git add dental-clinic-manager/src/components/Investment/CompareHistory/HistoryTab.tsx
git commit -m "feat(compare-history): HistoryTab container with filter+selection state"
```

---

## Task 5: HistoryFilters

**Files:**
- Create: `dental-clinic-manager/src/components/Investment/CompareHistory/HistoryFilters.tsx`

- [ ] **Step 1: 작성**

```tsx
'use client'

import { Search } from 'lucide-react'

export type PeriodPreset = '7d' | '30d' | '90d' | 'all'

export interface HistoryFilterState {
  strategyId: string  // '' = 전체
  ticker: string
  preset: PeriodPreset
}

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

interface Props {
  value: HistoryFilterState
  onChange: (next: HistoryFilterState) => void
  strategies: StrategyOption[]
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  '7d': '최근 7일',
  '30d': '최근 30일',
  '90d': '최근 90일',
  'all': '전체',
}

export default function HistoryFilters({ value, onChange, strategies }: Props) {
  const set = <K extends keyof HistoryFilterState>(key: K, v: HistoryFilterState[K]) => {
    onChange({ ...value, [key]: v })
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white border border-at-border rounded-xl p-3">
      <label className="block">
        <span className="text-xs font-medium text-at-text-secondary mb-1 inline-block">전략</span>
        <select
          value={value.strategyId}
          onChange={(e) => set('strategyId', e.target.value)}
          className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent text-sm"
        >
          <option value="">전체</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.strategy_type !== 'rule' ? `(${s.strategy_type === 'rl_portfolio' ? 'RL' : 'RL단일'})` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-at-text-secondary mb-1 inline-block">종목</span>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-at-text-weak" aria-hidden="true" />
          <input
            type="text"
            value={value.ticker}
            onChange={(e) => set('ticker', e.target.value)}
            placeholder="AAPL, 005930…"
            className="w-full pl-9 pr-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent text-sm"
          />
        </div>
      </label>

      <label className="block">
        <span className="text-xs font-medium text-at-text-secondary mb-1 inline-block">기간</span>
        <select
          value={value.preset}
          onChange={(e) => set('preset', e.target.value as PeriodPreset)}
          className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent text-sm"
        >
          {(['7d', '30d', '90d', 'all'] as PeriodPreset[]).map((p) => (
            <option key={p} value={p}>{PRESET_LABELS[p]}</option>
          ))}
        </select>
      </label>
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add dental-clinic-manager/src/components/Investment/CompareHistory/HistoryFilters.tsx
git commit -m "feat(compare-history): HistoryFilters (strategy/ticker/period)"
```

---

## Task 6: HistoryTable + 펼침 상태

**Files:**
- Create: `dental-clinic-manager/src/components/Investment/CompareHistory/HistoryTable.tsx`

- [ ] **Step 1: 작성**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import HistoryRowDetail from './HistoryRowDetail'
import type { BacktestRunRow } from './HistoryTab'

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

interface Props {
  rows: BacktestRunRow[]
  strategies: StrategyOption[]
  selectedIds: Set<string>
  onToggleSelected: (id: string) => void
}

type SortKey = 'executed_at' | 'total_return' | 'sharpe_ratio'
type SortDir = 'asc' | 'desc'

const formatDate = (iso: string): string => {
  try {
    const d = new Date(iso)
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return iso.slice(0, 10)
  }
}

const formatPct = (v: number | null | undefined): string => {
  if (v == null) return '-'
  const sign = v > 0 ? '+' : ''
  return `${sign}${(v * 100).toFixed(1)}%`
}

const formatNum = (v: number | null | undefined, digits = 2): string => {
  if (v == null) return '-'
  return v.toFixed(digits)
}

export default function HistoryTable({ rows, strategies, selectedIds, onToggleSelected }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('executed_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const strategyById = useMemo(() => {
    const map = new Map<string, StrategyOption>()
    for (const s of strategies) map.set(s.id, s)
    return map
  }, [strategies])

  const sorted = useMemo(() => {
    const cp = [...rows]
    cp.sort((a, b) => {
      const av = (a[sortKey] ?? 0) as number | string
      const bv = (b[sortKey] ?? 0) as number | string
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return cp
  }, [rows, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const toggleExpanded = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 inline-block opacity-50" aria-hidden="true" />
    return sortDir === 'asc'
      ? <ArrowUp className="w-3 h-3 inline-block" aria-hidden="true" />
      : <ArrowDown className="w-3 h-3 inline-block" aria-hidden="true" />
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-at-border bg-white">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-at-surface-alt">
          <tr>
            <th className="px-3 py-2 w-8" />
            <th
              className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider cursor-pointer"
              onClick={() => toggleSort('executed_at')}
            >
              날짜 {sortIcon('executed_at')}
            </th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">전략</th>
            <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">종목</th>
            <th
              className="px-3 py-2 text-right text-xs font-medium text-at-text-weak uppercase tracking-wider cursor-pointer"
              onClick={() => toggleSort('total_return')}
            >
              수익률 {sortIcon('total_return')}
            </th>
            <th
              className="px-3 py-2 text-right text-xs font-medium text-at-text-weak uppercase tracking-wider cursor-pointer"
              onClick={() => toggleSort('sharpe_ratio')}
            >
              Sharpe {sortIcon('sharpe_ratio')}
            </th>
            <th className="px-3 py-2 w-8" aria-label="펼침" />
          </tr>
        </thead>
        <tbody className="divide-y divide-at-border">
          {sorted.map((row) => {
            const strat = row.strategy_id ? strategyById.get(row.strategy_id) : null
            const isExp = expanded.has(row.id)
            const isSel = selectedIds.has(row.id)
            const ret = row.total_return ?? null
            return (
              <Fragment key={row.id}>
                <tr className={`hover:bg-at-surface-alt transition-colors ${isExp ? 'bg-at-surface-alt' : ''}`}>
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggleSelected(row.id)}
                      aria-label={`${row.id} 선택`}
                      className="rounded border-at-border text-at-accent focus:ring-at-accent"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-medium text-at-text">{formatDate(row.executed_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span>{strat?.name ?? '-'}</span>
                      {strat?.strategy_type === 'rl_portfolio' && (
                        <span className="px-1.5 py-0.5 text-xs rounded-full bg-at-accent-light text-at-accent">RL</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs">
                    {row.ticker === 'PORTFOLIO' ? (
                      <span className="text-at-text-secondary">Portfolio</span>
                    ) : row.ticker}
                  </td>
                  <td className={`px-3 py-2.5 text-right font-medium ${
                    ret == null ? '' : ret >= 0 ? 'text-at-success' : 'text-at-error'
                  }`}>
                    {formatPct(ret)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-at-text">{formatNum(row.sharpe_ratio)}</td>
                  <td className="px-3 py-2.5">
                    <button
                      onClick={() => toggleExpanded(row.id)}
                      aria-label={isExp ? '접기' : '펼치기'}
                      title={isExp ? '접기' : '펼치기'}
                      className="p-1 rounded-xl hover:bg-at-surface-alt"
                    >
                      {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </td>
                </tr>
                {isExp && (
                  <tr className="bg-at-surface-alt">
                    <td colSpan={7} className="px-3 py-3">
                      <HistoryRowDetail row={row} />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Fragment({ children }: { children: React.ReactNode }): React.ReactElement {
  return <>{children}</>
}
```

- [ ] **Step 2: 커밋**

```bash
git add dental-clinic-manager/src/components/Investment/CompareHistory/HistoryTable.tsx
git commit -m "feat(compare-history): HistoryTable with sort/select/expand"
```

---

## Task 7: HistoryRowDetail (인라인 펼침 상세)

**Files:**
- Create: `dental-clinic-manager/src/components/Investment/CompareHistory/HistoryRowDetail.tsx`

- [ ] **Step 1: 작성**

```tsx
'use client'

import { useMemo } from 'react'
import type { BacktestRunRow } from './HistoryTab'

interface Props {
  row: BacktestRunRow
}

const formatPct = (v: number | null | undefined): string => {
  if (v == null) return '-'
  return `${(v * 100).toFixed(1)}%`
}

function sampleCurve(curve: Array<{ date: string; equity: number }>, maxPoints: number): Array<{ date: string; equity: number }> {
  if (curve.length <= maxPoints) return curve
  const step = curve.length / maxPoints
  const out: Array<{ date: string; equity: number }> = []
  for (let i = 0; i < maxPoints; i++) {
    out.push(curve[Math.floor(i * step)])
  }
  out[out.length - 1] = curve[curve.length - 1]
  return out
}

function Sparkline({ points, width = 320, height = 60 }: { points: Array<{ date: string; equity: number }>; width?: number; height?: number }) {
  if (points.length < 2) {
    return <div className="text-xs text-at-text-weak">곡선 데이터 부족</div>
  }
  const min = Math.min(...points.map(p => p.equity))
  const max = Math.max(...points.map(p => p.equity))
  const range = Math.max(max - min, 1e-6)
  const path = points.map((p, i) => {
    const x = (i / (points.length - 1)) * width
    const y = height - ((p.equity - min) / range) * height
    return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
  }).join(' ')
  const lastY = height - ((points[points.length - 1].equity - min) / range) * height
  const firstY = height - ((points[0].equity - min) / range) * height
  const isUp = points[points.length - 1].equity >= points[0].equity
  const color = isUp ? '#1b7a3d' : '#c5221f'  // at-success / at-error 헥스 (svg는 토큰 미해석)
  return (
    <svg width={width} height={height} className="block">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} />
      <line x1={0} y1={firstY} x2={width} y2={firstY} stroke="#e0e2e6" strokeDasharray="2 2" />
      <circle cx={width} cy={lastY} r={3} fill={color} />
    </svg>
  )
}

export default function HistoryRowDetail({ row }: Props) {
  const sampled = useMemo(
    () => row.equity_curve ? sampleCurve(row.equity_curve, 60) : [],
    [row.equity_curve],
  )
  const trades = (row.trades ?? []) as Array<Record<string, unknown>>
  const previewTrades = trades.slice(0, 5)
  const isRLPortfolio = row.ticker === 'PORTFOLIO'

  return (
    <div className="space-y-3">
      {sampled.length > 0 && (
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary mb-1">자산곡선 (period: {row.start_date} ~ {row.end_date})</div>
          <Sparkline points={sampled} />
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">총 수익률</div>
          <div className={`text-xl font-bold ${(row.total_return ?? 0) >= 0 ? 'text-at-success' : 'text-at-error'}`}>
            {formatPct(row.total_return)}
          </div>
        </div>
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">Sharpe</div>
          <div className="text-xl font-bold text-at-text">{(row.sharpe_ratio ?? 0).toFixed(2)}</div>
        </div>
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">최대 손실</div>
          <div className="text-xl font-bold text-at-error">{formatPct(row.max_drawdown)}</div>
        </div>
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs text-at-text-secondary">{isRLPortfolio ? 'Rebalance' : '거래 수'}</div>
          <div className="text-xl font-bold text-at-text">{row.total_trades ?? 0}</div>
        </div>
      </div>

      {!isRLPortfolio && previewTrades.length > 0 && (
        <div className="bg-white border border-at-border rounded-xl p-3">
          <div className="text-xs font-medium text-at-text-secondary mb-2">최근 거래 ({previewTrades.length} / {trades.length})</div>
          <div className="overflow-x-auto">
            <table className="min-w-[480px] w-full text-xs">
              <thead className="text-at-text-weak">
                <tr>
                  <th className="text-left px-2 py-1">진입</th>
                  <th className="text-left px-2 py-1">청산</th>
                  <th className="text-right px-2 py-1">수익률</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-at-border">
                {previewTrades.map((t, i) => {
                  const entry = (t.entryDate ?? t.entry_date ?? '') as string
                  const exit = (t.exitDate ?? t.exit_date ?? '') as string
                  const pnl = (t.returnPct ?? t.return_pct ?? null) as number | null
                  return (
                    <tr key={i}>
                      <td className="px-2 py-1 font-mono">{entry || '-'}</td>
                      <td className="px-2 py-1 font-mono">{exit || '-'}</td>
                      <td className={`px-2 py-1 text-right ${pnl == null ? '' : pnl >= 0 ? 'text-at-success' : 'text-at-error'}`}>
                        {pnl == null ? '-' : formatPct(pnl / 100)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isRLPortfolio && (
        <div className="bg-at-surface-alt border border-at-border rounded-xl p-3 text-xs text-at-text-secondary">
          이 백테스트는 RL portfolio (다종목 동시 결정) 결과로 개별 trade 대신 매월 rebalance 단위로 계산되었습니다.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 커밋**

```bash
git add dental-clinic-manager/src/components/Investment/CompareHistory/HistoryRowDetail.tsx
git commit -m "feat(compare-history): HistoryRowDetail (sparkline + metrics + trades)"
```

---

## Task 8: HistoryCompareView (다중 선택 비교)

**Files:**
- Create: `dental-clinic-manager/src/components/Investment/CompareHistory/HistoryCompareView.tsx`

- [ ] **Step 1: 작성**

```tsx
'use client'

import { useMemo } from 'react'
import { X } from 'lucide-react'
import type { BacktestRunRow } from './HistoryTab'

interface StrategyOption {
  id: string
  name: string
  strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
}

interface Props {
  rows: BacktestRunRow[]
  strategies: StrategyOption[]
  onClose: () => void
}

const PALETTE = ['#1b61c9', '#c5221f', '#1b7a3d', '#c4720a', '#6b3fa0']

const formatPct = (v: number | null | undefined): string => v == null ? '-' : `${(v * 100).toFixed(1)}%`

function normalize(curve: Array<{ date: string; equity: number }>): Array<{ idx: number; pct: number }> {
  if (curve.length === 0) return []
  const base = curve[0].equity
  return curve.map((p, i) => ({ idx: i, pct: (p.equity / base - 1) * 100 }))
}

function Overlay({ rows }: { rows: BacktestRunRow[] }) {
  const series = useMemo(
    () => rows.map((r, i) => ({
      id: r.id, color: PALETTE[i % PALETTE.length],
      points: r.equity_curve ? normalize(r.equity_curve) : [],
    })),
    [rows],
  )
  const allPoints = series.flatMap(s => s.points)
  if (allPoints.length === 0) return <div className="text-sm text-at-text-secondary">자산곡선 데이터 없음</div>

  const width = 600
  const height = 200
  const maxIdx = Math.max(...series.map(s => s.points.length - 1), 1)
  const ys = allPoints.map(p => p.pct)
  const minY = Math.min(...ys, 0)
  const maxY = Math.max(...ys, 0)
  const yRange = Math.max(maxY - minY, 1)
  const yToPx = (v: number) => height - ((v - minY) / yRange) * height
  const zeroY = yToPx(0)

  return (
    <svg width={width} height={height} className="w-full h-auto">
      <line x1={0} y1={zeroY} x2={width} y2={zeroY} stroke="#e0e2e6" strokeDasharray="2 2" />
      {series.map(s => {
        if (s.points.length < 2) return null
        const path = s.points.map((p, i) => {
          const x = (p.idx / maxIdx) * width
          const y = yToPx(p.pct)
          return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
        }).join(' ')
        return <path key={s.id} d={path} fill="none" stroke={s.color} strokeWidth={1.5} />
      })}
    </svg>
  )
}

export default function HistoryCompareView({ rows, strategies, onClose }: Props) {
  const strategyById = useMemo(() => {
    const map = new Map<string, StrategyOption>()
    for (const s of strategies) map.set(s.id, s)
    return map
  }, [strategies])

  // 컬럼별 best 표시: total_return / sharpe_ratio 가장 높은 row
  const bestReturn = useMemo(() => {
    let best: string | null = null
    let bestVal = -Infinity
    for (const r of rows) {
      const v = r.total_return ?? -Infinity
      if (v > bestVal) { bestVal = v; best = r.id }
    }
    return best
  }, [rows])
  const bestSharpe = useMemo(() => {
    let best: string | null = null
    let bestVal = -Infinity
    for (const r of rows) {
      const v = r.sharpe_ratio ?? -Infinity
      if (v > bestVal) { bestVal = v; best = r.id }
    }
    return best
  }, [rows])

  return (
    <div className="bg-white border border-at-border rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-at-text">선택 {rows.length}개 비교</h3>
        <button
          onClick={onClose}
          aria-label="비교 닫기"
          title="닫기"
          className="p-1.5 rounded-xl hover:bg-at-surface-alt text-at-text-secondary"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-at-border">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="bg-at-surface-alt">
            <tr>
              {['전략', '종목', '기간', '수익률', 'Sharpe', '최대 손실', '거래/Reb'].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-at-border">
            {rows.map((r) => {
              const strat = r.strategy_id ? strategyById.get(r.strategy_id) : null
              return (
                <tr key={r.id} className="hover:bg-at-surface-alt">
                  <td className="px-3 py-2">{strat?.name ?? '-'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{r.ticker === 'PORTFOLIO' ? 'Portfolio' : r.ticker}</td>
                  <td className="px-3 py-2 text-xs text-at-text-secondary">{r.start_date} ~ {r.end_date}</td>
                  <td className={`px-3 py-2 font-medium ${(r.total_return ?? 0) >= 0 ? 'text-at-success' : 'text-at-error'}`}>
                    {formatPct(r.total_return)} {bestReturn === r.id && <span aria-label="최고">★</span>}
                  </td>
                  <td className="px-3 py-2">
                    {(r.sharpe_ratio ?? 0).toFixed(2)} {bestSharpe === r.id && <span aria-label="최고">★</span>}
                  </td>
                  <td className="px-3 py-2 text-at-error">{formatPct(r.max_drawdown)}</td>
                  <td className="px-3 py-2 text-at-text-secondary">{r.total_trades ?? 0}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-3 py-2 text-xs text-at-text-weak bg-at-surface-alt">★ = 컬럼별 최고</div>
      </div>

      <div className="bg-at-surface-alt border border-at-border rounded-xl p-3">
        <div className="text-xs font-medium text-at-text-secondary mb-2">자산곡선 비교 (시작 = 0%)</div>
        <Overlay rows={rows} />
        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          {rows.map((r, i) => {
            const strat = r.strategy_id ? strategyById.get(r.strategy_id) : null
            return (
              <span key={r.id} className="inline-flex items-center gap-1">
                <span style={{ background: PALETTE[i % PALETTE.length] }} className="w-2 h-2 rounded-full" aria-hidden="true" />
                <span>{strat?.name ?? '-'} ({r.ticker})</span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd dental-clinic-manager && npx tsc --noEmit 2>&1 | grep -iE "CompareHistory|CompareContent" | head
```

Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add dental-clinic-manager/src/components/Investment/CompareHistory/HistoryCompareView.tsx
git commit -m "feat(compare-history): HistoryCompareView (matrix + equity overlay)"
```

---

## Task 9: smoke 테스트 (선택)

**Files:**
- Create: `dental-clinic-manager/__tests__/components/Investment/CompareHistory/HistoryTable.smoke.test.tsx`

- [ ] **Step 1: vitest + jsdom 설정 확인**

```bash
grep -E '"jsdom"|"@testing-library/react"' dental-clinic-manager/package.json
```

설치 안 되어 있으면 다음을 추가하고 `npm install`:

```json
"@testing-library/react": "^16.0.0",
"@testing-library/jest-dom": "^6.4.0",
"jsdom": "^25.0.0"
```

`vitest.config.ts`의 environment를 'node'에서 'jsdom'으로 바꾸지 않고, smoke 테스트 파일에 `// @vitest-environment jsdom` pragma 사용.

- [ ] **Step 2: smoke test**

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HistoryTable from '@/components/Investment/CompareHistory/HistoryTable'
import type { BacktestRunRow } from '@/components/Investment/CompareHistory/HistoryTab'

const sampleRow = (id: string, ret: number): BacktestRunRow => ({
  id, strategy_id: 's1', ticker: 'AAPL', market: 'US',
  start_date: '2025-01-01', end_date: '2026-04-29', initial_capital: 1e7,
  status: 'completed',
  total_return: ret, sharpe_ratio: 1.2, max_drawdown: -0.1, total_trades: 5, win_rate: 0.6,
  equity_curve: [{ date: '2025-01-01', equity: 1e7 }, { date: '2026-04-29', equity: 1.18e7 }],
  trades: [], full_metrics: null, executed_at: '2026-04-29T00:00:00Z',
})

describe('HistoryTable smoke', () => {
  it('renders rows + clicking expand toggle shows detail', () => {
    const rows = [sampleRow('a', 0.18), sampleRow('b', -0.05)]
    const sels = new Set<string>()
    render(<HistoryTable rows={rows} strategies={[{ id: 's1', name: 'RSI', strategy_type: 'rule' }]} selectedIds={sels} onToggleSelected={() => {}} />)
    expect(screen.getByText('+18.0%')).toBeTruthy()
    const expandBtns = screen.getAllByLabelText('펼치기')
    fireEvent.click(expandBtns[0])
    expect(screen.queryByLabelText('접기')).not.toBeNull()
  })

  it('shows checkbox and respects selectedIds', () => {
    const rows = [sampleRow('a', 0.1)]
    const sels = new Set(['a'])
    render(<HistoryTable rows={rows} strategies={[]} selectedIds={sels} onToggleSelected={() => {}} />)
    const cb = screen.getByLabelText('a 선택') as HTMLInputElement
    expect(cb.checked).toBe(true)
  })
})
```

- [ ] **Step 3: 실행**

```bash
cd dental-clinic-manager && npm run test:unit -- HistoryTable
```

Expected: 2 PASS.

- [ ] **Step 4: 커밋**

```bash
git add dental-clinic-manager/__tests__/components/Investment/CompareHistory/HistoryTable.smoke.test.tsx dental-clinic-manager/package.json dental-clinic-manager/package-lock.json
git commit -m "test(compare-history): HistoryTable smoke (sort/expand/select)"
```

(Step 1에서 jsdom/RTL 미설치 시: 본 task를 OUT으로 처리하고 사용자 수동 검증으로 대체. 그 경우 commit 메시지 없이 task 종료.)

---

## Task 10: 빌드 + Next.js dev 수동 검증 + 최종 push

**Files:**
- 변경 없음

- [ ] **Step 1: TypeScript 전수 체크 — 우리 코드만 grep**

```bash
cd dental-clinic-manager && npx tsc --noEmit 2>&1 | grep -iE "CompareHistory|backtest/route|CompareContent" | head
```

Expected: 출력 없음 (RL trading PR 이전에 존재하던 unrelated TS errors는 무시).

- [ ] **Step 2: 단위 테스트 전체 실행**

```bash
cd dental-clinic-manager && npm run test:unit
```

Expected: API 5건 + smoke 2건 = 7 PASS.

- [ ] **Step 3: 수동 dev 검증**

```bash
cd dental-clinic-manager && npm run dev
```

브라우저에서 `http://localhost:3000/investment/compare`:
- [새로 비교] 탭 → 기존 UI 정상
- [히스토리] 탭 → 표 렌더, 필터 동작
- 행 클릭 → 펼침 (sparkline + 메트릭)
- 체크박스 2개 선택 → 하단 "선택 2개 비교" 버튼 → 클릭 시 matrix + overlay
- 콘솔 에러 0건

- [ ] **Step 4: 최종 push**

```bash
cd /Users/hhs/Project/dental-clinic-manager
git push origin develop
```

---

## Self-Review

**Spec coverage:**
- 탭 분리 → Task 3
- HistoryTab 컨테이너 → Task 4
- HistoryFilters (전략/종목/기간) → Task 5
- HistoryTable (정렬/체크박스/펼침) → Task 6
- HistoryRowDetail (sparkline/trades/메트릭) → Task 7
- HistoryCompareView (matrix + overlay) → Task 8
- API GET 확장 → Task 1+2
- 빈 상태 → Task 4 (HistoryTab)
- 권한 (RLS + user_id) → Task 2 (eq('user_id', userId))
- RL portfolio ticker='PORTFOLIO' 라벨 → Task 6 (HistoryTable), Task 7 (HistoryRowDetail), Task 8 (HistoryCompareView)
- limit cap (200) → Task 2

**Placeholder scan:** TBD/TODO 없음. 단 Task 9는 환경 의존 (jsdom 설치 여부)이라 명시적 skip path 포함됨.

**Type consistency:**
- `BacktestRunRow` 인터페이스는 Task 4에서 정의 후 6/7/8에서 import — 일관
- `HistoryFilterState` 는 Task 5에서 export, Task 4에서 import
- `StrategyOption` 은 Task 4/5/6/8에서 같은 shape 사용 (id/name/strategy_type)
