# 종목 상세 모달 + 즐겨찾기 — Design Spec

- **작성일**: 2026-05-06
- **상태**: 승인 (사용자 확인 대기)
- **작업자**: 자동 구현 파이프라인

## 1. 배경 / 목적

투자 모듈의 종목 스크리너에서 검색된 종목 행을 클릭하면 현재는 "충족 조건 / 지표값"만 인라인으로 펼쳐 볼 수 있다. 사용자는 종목 클릭 시 다음 정보를 즉시 확인하고 싶어한다.

- 펀더멘털 — PER, PBR, ROE, 영업이익률, 매출/영업이익/순이익, EPS/배당
- 시가총액 + 시장 내 순위
- 최근 주가 흐름 (차트)

또한 자주 사용하는 종목을 **즐겨찾기**로 등록해, 백테스트 / 스마트머니 / 전략비교 / 단타 / 스크리너에서 빠르게 다시 입력할 수 있어야 한다. 현재는 "최근 입력 종목"(`useRecentTickers`)만 있고 명시적 즐겨찾기 개념은 없다.

## 2. 범위

### 포함
- 종목 상세 모달 (펀더멘털 + 시총 순위 + 가격 차트 + 즐겨찾기 토글)
- 즐겨찾기 데이터 모델 (Supabase) + API + 훅 + 버튼 컴포넌트
- 5개 페이지(전략 관리 / 단타 / 전략비교 / 스크리너 / 스마트머니)에 즐겨찾기 버튼 행 노출
- KR 종목 시총 순위 데이터 스냅샷 스크립트

### 범위 외 (YAGNI)
- 즐겨찾기 그룹 / 태그 / 메모
- 즐겨찾기 정렬 변경 UI
- KR/US 시총 데이터 자동 갱신 cron (수동 스크립트 실행)
- KIS API 펀더멘털 호출 — yahoo-finance2로 충분
- 네이버 증권 등 추가 데이터 소스

## 3. 아키텍처 개요

```
┌─ Frontend ──────────────────────────────────────────────┐
│  ScreenerContent ─┐                                      │
│  BacktestPanel    ├─► FavoritesButtons (★ 버튼 행)       │
│  SmartMoneyContent│                                      │
│  CompareContent   │                                      │
│  DayTradeContent  ┘                                      │
│         │                                                │
│         └─ 종목 클릭 ─► TickerInfoModal                  │
│                          ├─ ★ 즐겨찾기 토글              │
│                          └─ 가격 차트 1M/3M/1Y           │
└──────────────────────────────────────────────────────────┘
       │ (REST)
┌─ API ─┴──────────────────────────────────────────────────┐
│  GET  /api/investment/ticker-info  → yahoo quoteSummary   │
│  GET  /api/investment/favorites    → list                 │
│  POST /api/investment/favorites    → upsert               │
│  DELETE /api/investment/favorites  → remove               │
└──────────────────────────────────────────────────────────┘
       │
┌─ Data ┴──────────────────────────────────────────────────┐
│  Supabase: investment_favorites                          │
│  Static:   src/data/kr-tickers-marketcap.json (스냅샷)    │
│            src/data/us-tickers.json (기존)                │
│  External: yahoo-finance2 (실시간 펀더멘털 + 차트)         │
└──────────────────────────────────────────────────────────┘
```

## 4. Feature A — 종목 상세 모달

### 4.1 컴포넌트
**경로**: `src/components/Investment/TickerInfoModal.tsx` (신규)

**Props**:
```typescript
interface TickerInfoModalProps {
  ticker: string
  market: 'KR' | 'US'
  tickerName?: string
  onClose: () => void
  onAnalyze?: (ticker: string, market: 'KR' | 'US') => void  // 스마트머니 분석 이동
}
```

### 4.2 UI 구조

```
┌─ 모달 헤더 ─────────────────────────────────────┐
│ 005930 삼성전자  [국내]  ★즐겨찾기  ✕         │
├─ 가격 카드 ────────────────────────────────────┤
│ 75,400원  +1,200(+1.61%)  거래량 12.4M        │
│ 52주 최고/최저 │ 시총 (시장 순위)              │
├─ 펀더멘털 그리드 (2열) ────────────────────────┤
│ PER    │ PBR    │ ROE    │ 영업이익률         │
│ 매출   │ 영업이익│ 순이익 │ EPS                │
│ DPS    │ 배당수익률 │ 부채비율 │ 순이익률      │
├─ 가격 차트 ────────────────────────────────────┤
│ [1M][3M][1Y]  ── 라인 차트 (recharts) ──     │
├─ 액션 바 ─────────────────────────────────────┤
│ ★ 즐겨찾기 추가  |  스마트머니 분석  |  닫기 │
└─────────────────────────────────────────────┘
```

### 4.3 데이터 페치 흐름
1. 모달 열림 → `GET /api/investment/ticker-info?ticker=…&market=…&range=1mo`
2. 차트 토글 클릭 → `?range=3mo` 또는 `?range=1y`로 재호출 (가격/펀더멘털은 캐시 재사용)
3. ★ 클릭 → `useFavorites().add()` 또는 `.remove()`

### 4.4 로딩/에러
- 로딩: 펀더멘털 셀에 skeleton, 차트 영역에 스피너
- 404: "종목 정보를 찾을 수 없습니다" + 닫기 버튼만 표시
- 데이터 누락 필드: "—" 표시 (오류 아님)

### 4.5 호출 위치
- 스크리너 결과 행 클릭 — **기존 인라인 펼침은 제거**, 클릭 = 모달 오픈으로 통일
- (옵션) RecentTickers/Favorites 버튼의 보조 액션은 v1에서 추가하지 않음 (YAGNI)

## 5. Feature B — 즐겨찾기

### 5.1 Supabase 테이블 (신규)
```sql
CREATE TABLE investment_favorites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticker      VARCHAR(20) NOT NULL,
  market      VARCHAR(2)  NOT NULL CHECK (market IN ('KR','US')),
  ticker_name TEXT,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, ticker, market)
);
CREATE INDEX idx_favorites_user
  ON investment_favorites (user_id, sort_order DESC, created_at DESC);

ALTER TABLE investment_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own rows select" ON investment_favorites
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own rows insert" ON investment_favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "own rows delete" ON investment_favorites
  FOR DELETE USING (user_id = auth.uid());
```

마이그레이션은 Supabase MCP `apply_migration`으로 직접 적용하고, `supabase/migrations/2026XXXX_investment_favorites.sql`에도 기록.

### 5.2 API 라우트
**경로**: `src/app/api/investment/favorites/route.ts` (신규)

| Method | 동작 | 입력 | 출력 |
|---|---|---|---|
| GET | 목록 조회 | (auth 쿠키) | `{ items: Favorite[] }` |
| POST | 추가/upsert | `{ ticker, market, ticker_name }` | `{ ok: true, item }` |
| DELETE | 삭제 | `?ticker=…&market=…` | `{ ok: true }` |

`Favorite` 타입:
```typescript
interface Favorite {
  ticker: string
  market: 'KR' | 'US'
  tickerName: string | null
  createdAt: string
}
```

### 5.3 클라이언트 훅
**경로**: `src/hooks/useFavorites.ts` (신규)

```typescript
function useFavorites(): {
  favorites: Favorite[]
  loading: boolean
  add: (ticker: string, market: 'KR'|'US', name?: string) => Promise<void>
  remove: (ticker: string, market: 'KR'|'US') => Promise<void>
  isFavorite: (ticker: string, market: 'KR'|'US') => boolean
  refresh: () => Promise<void>
}
```

- 첫 마운트 시 GET 호출 → state
- `add` / `remove`는 낙관적 업데이트 (실패 시 롤백)
- `BroadcastChannel('dcm-favorites')`로 같은 사용자 다른 탭/창에 변경 사실 전파
- 캐시 무효화 정책: 같은 페이지 내 마운트 시 1회 GET, 그 후엔 broadcast/명시적 refresh

### 5.4 버튼 컴포넌트
**경로**: `src/components/Investment/FavoritesButtons.tsx` (신규)

```typescript
interface FavoritesButtonsProps {
  onSelect: (ticker: string, market: 'KR'|'US', name?: string) => void
}
```

- RecentTickersButtons와 동일한 외형, prefix 아이콘 별표(★)
- 빈 상태 메시지: "★ 즐겨찾기한 종목이 없습니다. 종목 상세에서 별표를 눌러 추가하세요."
- 종목 클릭 시 `onSelect` 호출 — **자동 선택/검색 실행은 하지 않음** (RecentTickers와 동일 정책: 입력란에만 채움)

### 5.5 통합 위치 (5개 페이지)
다음 컴포넌트의 종목 입력란 위에 `<FavoritesButtons />` 한 줄을 추가한다.

| 페이지 | 컴포넌트 | 비고 |
|---|---|---|
| 전략 관리 | `InvestmentTab.tsx` 내 종목 추가 영역 | RecentTickersButtons 위 |
| 단타 | `DayTradeContent.tsx` | RecentTickersButtons 위 |
| 전략비교 | `CompareContent.tsx` | RecentTickersButtons 위 |
| 스크리너 | `ScreenerContent.tsx` | RecentTickersButtons 위 |
| 스마트머니 | `SmartMoney/SmartMoneyContent.tsx` | RecentTickersButtons 위 |

## 6. ticker-info API 상세

**경로**: `src/app/api/investment/ticker-info/route.ts` (신규)

### 6.1 입력
```
GET /api/investment/ticker-info?ticker=AAPL&market=US&range=1mo
GET /api/investment/ticker-info?ticker=005930&market=KR&range=3mo
```

`range`: `1mo | 3mo | 1y` (기본 `1mo`)

### 6.2 응답
```json
{
  "ticker": "AAPL",
  "market": "US",
  "name": "Apple Inc.",
  "price": {
    "current": 175.42,
    "change": 1.25,
    "changePercent": 0.72,
    "volume": 52340000,
    "currency": "USD"
  },
  "range52w": { "high": 198.23, "low": 124.17 },
  "marketCap": 2745000000000,
  "marketCapRank": 1,
  "fundamentals": {
    "per": 28.4,
    "pbr": 45.2,
    "roe": 0.156,
    "eps": 6.13,
    "dividendYield": 0.0052,
    "revenue": 383000000000,
    "operatingIncome": 114000000000,
    "netIncome": 96000000000,
    "operatingMargin": 0.298,
    "profitMargin": 0.251,
    "debtToEquity": 1.95
  },
  "chart": {
    "range": "1mo",
    "points": [
      { "date": "2026-04-06", "close": 170.12 },
      { "date": "2026-04-07", "close": 171.45 }
    ]
  },
  "asOf": "2026-05-06T08:00:00.000Z"
}
```

### 6.3 데이터 소스
- yahoo-finance2 `quoteSummary(symbol, { modules: ['price','summaryDetail','defaultKeyStatistics','financialData'] })`
- yahoo-finance2 `chart(symbol, { period1, interval })` — `1mo`/`3mo`는 `1d` interval, `1y`는 `1wk`
- KR은 `${ticker}.KS` (코스피) / `${ticker}.KQ` (코스닥) 변환 — 실패 시 다른 suffix로 retry 1회
- 시총 순위:
  - US: `usTickerCatalog.topByMarketCap(...)` 정렬 인덱스 (이미 존재)
  - KR: `src/data/kr-tickers-marketcap.json` 정렬 인덱스 (신규 — §7)
- 누락된 필드는 `null` (UI에서 "—" 표시)

### 6.4 캐싱
- Next 라우트에 `export const revalidate = 1800` (30분)
- 동일 `ticker:market:range` 키는 30분 동안 재요청 시 캐시 응답

### 6.5 에러 처리
- yahoo 타임아웃/빈 응답 → `404 { error: "종목 정보를 찾을 수 없습니다" }`
- 잘못된 market 값 → `400 { error: "올바르지 않은 시장 코드" }`

## 7. KR 시총 스냅샷 스크립트

**경로**: `scripts/fetch-kr-marketcap.mjs` (신규)

### 7.1 동작
1. `src/lib/krTickerDict.ts`의 `KR_TICKER_DICT` 전체를 순회
2. 각 종목에 대해 yahoo-finance2 `quoteSummary(symbol, ['price'])`로 `marketCap` 조회 (코스피 `.KS` 우선, 실패 시 `.KQ` 시도)
3. rate limit: 동시 5개, 호출당 200ms 간격
4. 결과 `[{ ticker, market: 'KR', marketCap }]`를 시총 내림차순 정렬해 `src/data/kr-tickers-marketcap.json`에 저장
5. yahoo가 시총을 반환하지 않은 종목은 marketCap 0으로 기록 (순위에서 제외됨)

### 7.2 수동 실행
```bash
node scripts/fetch-kr-marketcap.mjs
```

US 카탈로그 갱신 스크립트(`scripts/fetch-us-tickers.mjs`)와 동일한 패턴. 필요할 때마다 수동 실행해 PR로 반영.

### 7.3 lib 헬퍼
**경로**: `src/lib/krTickerCatalog.ts` (신규)

```typescript
export function getKRMarketCapRank(ticker: string): number | null
export function getKRMarketCap(ticker: string): number | null
```

- 모듈 로드 시 한 번 정렬 인덱스 빌드 후 캐시
- ticker가 정렬 인덱스에 없으면 `null` 반환

## 8. 영향 범위 / 호환성

### 8.1 변경되는 기존 동작
- **스크리너 결과 행 클릭**: 인라인 펼침(충족조건/지표값) 제거 → 모달 오픈
  - 기존 펼침에 노출되던 정보(충족조건, 지표값)는 모달 하단 "충족조건 / 지표값" 섹션으로 이전 (스크리너에서 호출될 때만 노출되도록 옵션 prop)

### 8.2 영향 없는 기존 기능
- RecentTickersButtons는 그대로 유지 (즐겨찾기와 별도 행)
- yahoo-finance2 호출은 새 endpoint 추가만 — 기존 quote/historical API 무관
- KIS API 변경 없음

### 8.3 신규 권한
없음. 모든 사용자가 본인 즐겨찾기 추가/조회/삭제 가능 (RLS).

## 9. 검증 체크리스트

1. `npm run build` 통과 (타입 체크 포함)
2. Supabase 마이그레이션 적용 확인 (`mcp__supabase__list_tables`로 `investment_favorites` 확인)
3. `node scripts/fetch-kr-marketcap.mjs` 실행 → JSON 생성 (200+ 종목)
4. `/investment` 진입 후 스크리너에서 결과 행 클릭 → 모달 오픈, 펀더멘털 + 차트 + 시총 순위(KR/US) 표시
5. 모달의 ★ 클릭 → 즐겨찾기 토글 — 5개 페이지의 FavoritesButtons에 즉시 반영
6. 즐겨찾기 버튼 클릭 → 입력란 채워짐, 자동 검색은 일어나지 않음
7. 다른 탭에서 같은 사용자로 접속 → broadcast로 즐겨찾기 변경 사실 동기화 확인
8. 차트 토글 1M/3M/1Y 모두 정상 렌더 (KR/US 각각 1종목 이상)
9. yahoo가 응답 못하는 종목 (예: 잘못된 ticker) → "종목 정보를 찾을 수 없습니다" 메시지 표시
10. `git push origin develop`

## 10. 산출물

### 신규 파일 (8)
- `src/components/Investment/TickerInfoModal.tsx`
- `src/components/Investment/FavoritesButtons.tsx`
- `src/hooks/useFavorites.ts`
- `src/app/api/investment/ticker-info/route.ts`
- `src/app/api/investment/favorites/route.ts`
- `src/lib/krTickerCatalog.ts`
- `scripts/fetch-kr-marketcap.mjs`
- `src/data/kr-tickers-marketcap.json` (스크립트 산출물)

### 수정 파일 (6)
- `src/components/Investment/ScreenerContent.tsx` — 행 클릭 동작(인라인 펼침 → 모달) + FavoritesButtons
- `src/components/Investment/BacktestPanel.tsx` — FavoritesButtons
- `src/components/Investment/SmartMoney/SmartMoneyContent.tsx` — FavoritesButtons
- `src/components/Investment/CompareContent.tsx` — FavoritesButtons
- `src/components/Investment/DayTradeContent.tsx` — FavoritesButtons
- `src/components/Investment/InvestmentTab.tsx` 또는 그 안에서 사용하는 종목 입력 컴포넌트(전략 관리 영역) — FavoritesButtons (실제 통합 지점은 구현 시 RecentTickersButtons가 이미 노출되는 자리 바로 위)

### Supabase 마이그레이션 (1)
- `supabase/migrations/<적용일자_yyyymmdd>_investment_favorites.sql` (적용 시점 날짜로 파일명 결정, MCP `apply_migration`과 함께 기록)
