# 백테스트 히스토리 조회 — 비교 페이지 통합

작성일: 2026-04-30
영향 페이지: `/investment/compare`

---

## 1. Context

`backtest_runs` 테이블에 100건 이상의 완료된 백테스트 결과가 누적되어 있으나, UI에서 조회할 진입점이 없다. 사용자는 동일한 전략·종목 조합을 매번 다시 실행해야 하고, 과거 결과를 비교하지 못한다.

비교 페이지(`/investment/compare`)는 이미 다전략 백테스트 비교에 특화된 인터페이스를 갖추고 있어, 히스토리 조회를 같은 페이지의 **두 번째 탭**으로 통합하는 것이 자연스럽다.

---

## 2. 사용자 흐름

```
1. /investment/compare 진입 → 기본 [새로 비교] 탭 (기존 UI 유지)
2. [히스토리] 탭 클릭 → 최근 30일 completed 백테스트 표 (최신순)
3. 필터 조작 (전략 select / 종목 검색 / 기간 preset) → 표 갱신
4. 행 클릭 → 행 아래로 펼침 (equity sparkline + trades + 메트릭)
5. 체크박스 N개 선택 → 하단 sticky bar에 "선택 N개 비교" 활성
6. 비교 클릭 → 같은 탭 하단에 matrix view 렌더 (행=백테스트 row, 열=메트릭/sparkline)
```

---

## 3. 컴포넌트 구조

```
src/components/Investment/CompareContent.tsx (수정)
└ <Tabs value={tab} onChange={setTab}>
   ├ Tab "새로 비교" → 기존 LiveCompareSection (현재 UI 그대로)
   └ Tab "히스토리"  → <HistoryTab />

src/components/Investment/CompareHistory/ (신규 디렉터리)
├ HistoryTab.tsx           # 메인 컨테이너 (filters + table + compare view)
├ HistoryFilters.tsx       # 전략 select + ticker 검색 + period preset
├ HistoryTable.tsx         # 체크박스 + 정렬 가능 컬럼 + 펼침 토글
├ HistoryRowDetail.tsx     # 인라인 펼침 (sparkline + trades 미리보기 + 메트릭)
└ HistoryCompareView.tsx   # 다중 선택 시 matrix-style 비교
```

**디자인 원칙:**
- 기존 `CompareContent.tsx`(1698줄)는 가능한 건드리지 않고, 상단 탭 wrapper만 추가
- 신규 코드는 `CompareHistory/` 하위에 격리

---

## 4. API

### 기존 GET 확장

[`src/app/api/investment/backtest/route.ts`](src/app/api/investment/backtest/route.ts)의 GET 핸들러에 필터 파라미터 추가:

| 파라미터 | 동작 |
|---|---|
| `?id=<uuid>` | 단일 결과 (기존) |
| `?strategyId=<uuid>` | 특정 전략 결과 (기존, limit 20) |
| `?ids=<uuid>,<uuid>,...` | 다중 ID — 비교 view 로드 (신규) |
| `?strategy_id=<uuid>&ticker=<str>&since=<ISO date>&until=<ISO date>&limit=50` | 필터 조합 (신규) |

**응답 형식:** 기존 row 형식 그대로 (변경 없음). `data` 배열.

**권한:** 모든 path는 `requireAuth()` 통과 후 `user_id=auth.uid` 필터.

### 페이지네이션
초기 limit 기본 50, 사용자가 "더 보기" 클릭 시 cursor (executed_at 기준 keyset). Phase 1은 단순 limit만, cursor는 Phase 2.

---

## 5. UI 상세

### 5.1 필터 (`HistoryFilters.tsx`)

```
┌─────────────────────────────────────────────────────────────┐
│ [전략: 전체 ▼]  [종목 검색: AAPL]  [기간: 최근 30일 ▼]    │
└─────────────────────────────────────────────────────────────┘
```

- 전략 select: `'전체'` + 사용자의 `investment_strategies` 리스트 (RL 포함, 모든 strategy_type)
- 종목 검색: free-text input (debounce 300ms). 단일 ticker 또는 빈값(전체).
- 기간 preset: `최근 7일 / 최근 30일 / 최근 90일 / 전체` — 첫 진입 시 `최근 30일`

### 5.2 표 (`HistoryTable.tsx`)

```
┌───┬──────┬─────────────────────┬───────┬────────┬───────┬─────┐
│ ☐ │ 날짜 │ 전략                  │ 종목  │ 수익률 │Sharpe │  ▼ │
├───┼──────┼─────────────────────┼───────┼────────┼───────┼─────┤
│ ☑ │04.29 │ FinRL Dow30 Quick   │ AAPL  │+18.5%  │ 1.42  │ ▼  │
│   │ ┌─────────────────────────────────────────────┐         │
│   │ │ [equity sparkline 30일치]                  │         │
│   │ │ Trades: 12건 (W7/L5)  MDD: -8.7%          │         │
│   │ │ 기간: 2025-10-29 ~ 2026-04-29              │         │
│   │ └─────────────────────────────────────────────┘         │
│ ☐ │04.28 │ RSI 과매도 반등         │272210 │+71.9%  │ 0.85  │ ▶  │
│ ☐ │04.28 │ 골든크로스             │272210 │+90.9%  │ 0.92  │ ▶  │
└───┴──────┴─────────────────────┴───────┴────────┴───────┴─────┘
```

**컬럼:**
- 체크박스 (다중 선택)
- 날짜 (executed_at 기준, "MM.DD")
- 전략 (이름 + 작은 strategy_type 배지: rule / RL portfolio)
- 종목 (`PORTFOLIO`이면 "Dow30 portfolio" 같은 라벨)
- 수익률 (총 수익률, 색상: 양수 success / 음수 error)
- Sharpe
- 펼침 토글 (▶ / ▼)

**정렬:** 날짜(기본 내림차순), 수익률, Sharpe 컬럼 헤더 클릭

**빈 상태:** 아이콘 + "최근 30일 내 백테스트가 없습니다. [새로 비교] 탭에서 첫 백테스트를 실행해보세요."

### 5.3 인라인 펼침 (`HistoryRowDetail.tsx`)

```
┌─────────────────────────────────────────────────────────┐
│ [equity sparkline (30일 sample)]                        │
│                                                          │
│ ┌────────────┬──────────────┬──────────────┐            │
│ │ Total: +18.5% │ Sharpe: 1.42 │ MDD: -8.7%  │            │
│ └────────────┴──────────────┴──────────────┘            │
│                                                          │
│ Trades (최근 5건)                                        │
│ ─────────────────────────────────────                   │
│ 04.05 매수 100주 @ $182.30                              │
│ 04.12 매도 100주 @ $189.45  (+3.9%)                     │
│ ...                                                      │
│                                                          │
│ 기간: 2025-10-29 ~ 2026-04-29                           │
└─────────────────────────────────────────────────────────┘
```

- equity_curve sampling (max 60 point)
- trades 테이블 (최대 5건, "전체 N건 보기" 링크는 Phase 2)
- RL portfolio (ticker='PORTFOLIO')은 trades 비어 있음 → "월별 rebalance N회" 표시

### 5.4 다중 선택 비교 (`HistoryCompareView.tsx`)

```
┌──────────────────────────────────────────────────┐
│ 선택 3개 비교                              [닫기] │
├──────────────────────────────────────────────────┤
│ ┌──────────────────┬───────────┬──────────┐     │
│ │ 전략              │ 수익률    │ Sharpe   │     │
│ ├──────────────────┼───────────┼──────────┤     │
│ │ FinRL Dow30      │ +18.5% ★ │ 1.42 ★  │     │
│ │ RSI 과매도        │ +71.9%   │ 0.85    │     │
│ │ 골든크로스         │ +90.9% ★ │ 0.92    │     │
│ └──────────────────┴───────────┴──────────┘     │
│ ★ = 컬럼별 최고                                   │
│                                                  │
│ Equity 곡선 (정규화 0=백테스트 시작)              │
│ [3개 라인 overlay 차트]                          │
└──────────────────────────────────────────────────┘
```

- matrix table: 행=선택 백테스트, 열=핵심 메트릭 4~5개
- equity overlay 차트 (각 백테스트의 equity_curve를 t=0에서 100으로 정규화 후 overlay)
- 선택을 추가/제거하면 즉시 반영

---

## 6. 권한 / RLS

- `backtest_runs` 테이블 RLS는 `user_id = auth.uid()` 기준 (기존)
- API GET 핸들러에서도 명시적 user_id 필터 (이중 안전)
- 다른 사용자의 백테스트는 절대 노출되지 않음

---

## 7. 테스트

### 7.1 API
- `?strategy_id=X` 만 → 해당 전략 결과
- `?ticker=AAPL&since=2026-04-01` 조합
- 다른 user_id 결과 누설 X
- limit 초과 시 50개로 cap

### 7.2 컴포넌트 (smoke)
- 빈 결과 → 빈 상태 렌더
- N건 결과 → 테이블 렌더, 정렬 동작
- 행 펼침/접힘 토글
- 다중선택 → "선택 N개 비교" 버튼 활성/비활성
- 비교 view에서 사용자가 선택 해제 → 즉시 갱신

### 7.3 E2E (수동)
- 사용자 로그인 → 비교 페이지 → 히스토리 탭 → 필터 → 행 펼침 → 다중 선택 → 비교 view 표시 → 닫기

---

## 8. Phase 1 범위

### IN
- 비교 페이지 상단 [새로 비교 / 히스토리] 2-탭
- HistoryFilters (전략 select + ticker 검색 + 기간 preset)
- HistoryTable (정렬, 체크박스, 펼침)
- HistoryRowDetail (sparkline + trades 미리보기 + 메트릭)
- HistoryCompareView (다중 선택 matrix + equity overlay)
- API GET 확장 (`?strategy_id`, `?ticker`, `?since`, `?until`, `?limit`)

### OUT (Phase 2)
- 백테스트 row 삭제 / 재실행
- CSV / PDF export
- 다중선택 결과를 새 비교 실행으로 보내기
- cursor 페이지네이션
- 실시간 (실행 중 백테스트 polling)
- failed 백테스트 표시 토글

---

## 9. 핵심 파일

**수정:**
- [src/app/api/investment/backtest/route.ts](src/app/api/investment/backtest/route.ts) — GET 필터 파라미터 추가
- [src/components/Investment/CompareContent.tsx](src/components/Investment/CompareContent.tsx) — 상단 탭 wrapper

**신규:**
- `src/components/Investment/CompareHistory/HistoryTab.tsx`
- `src/components/Investment/CompareHistory/HistoryFilters.tsx`
- `src/components/Investment/CompareHistory/HistoryTable.tsx`
- `src/components/Investment/CompareHistory/HistoryRowDetail.tsx`
- `src/components/Investment/CompareHistory/HistoryCompareView.tsx`

---

## 10. 검증 (구현 후 확인 방법)

1. `/investment/compare` 접속 → 두 탭 표시
2. [히스토리] 탭 클릭 → 최근 30일 결과 표시 (현재 DB 기준 100건 중 최근 N건)
3. 전략 select에서 "FinRL Dow30 Quick" 선택 → 해당 전략 결과만 (현재 4건)
4. 종목 검색 "AAPL" → ticker='AAPL' 결과만
5. 기간 "최근 7일" → 7일 이내 executed_at만
6. 행 클릭 → 펼침 (equity sparkline + trades + 메트릭)
7. 체크박스 2~3개 선택 → 하단 "선택 N개 비교" 버튼 활성
8. 비교 클릭 → matrix table + equity overlay 차트
9. 다른 user 계정으로 로그인 시 자기 결과만 보이는지 (RLS 검증)
