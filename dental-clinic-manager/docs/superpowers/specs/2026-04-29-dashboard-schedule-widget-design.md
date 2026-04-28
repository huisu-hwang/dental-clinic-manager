# 대시보드 병원 일정 위젯 — 설계 문서

**작성일**: 2026-04-29
**상태**: 승인 대기
**대상**: `src/components/Dashboard/DashboardHome.tsx`

---

## 1. 목적

서비스 접속 직후 보이는 대시보드 홈에 "병원 일정" 위젯을 추가한다. 사용자가 대시보드를 떠나지 않고도 병원 게시판의 일정/휴무 공지와 휴무일(병원·법정 공휴일)을 오늘/주간/월간 단위로 한눈에 확인할 수 있도록 한다.

---

## 2. 위치 및 컨테이너

- 진입 컴포넌트: `src/components/Dashboard/DashboardHome.tsx`
- 배치: 대시보드 **상단 첫 번째 줄**, 기존 "오늘 보고서 요약" 카드 **옆**
- 기존 위젯의 props/로직/스타일은 일절 변경하지 않는다 (기존 기능 보호 원칙)
- 반응형 그리드: 모바일 1열, 태블릿 2열, 데스크톱 3열 — 기존 그리드 규약 그대로 사용

---

## 3. 컴포넌트 구조

```
src/components/Dashboard/ScheduleWidget/
  index.tsx                  ← 메인 카드 (탭 컨테이너)
  TodayView.tsx              ← 오늘 탭 콘텐츠
  WeekView.tsx               ← 주간 탭 콘텐츠
  MonthView.tsx              ← 월간 탭 콘텐츠
  ScheduleItem.tsx           ← 일정 1줄 표시 (3개 뷰에서 재사용)
  ScheduleDetailModal.tsx    ← 공지사항 클릭 시 본문 미리보기
  useScheduleData.ts         ← 데이터 페치/통합 훅
  scheduleParser.ts          ← 본문 날짜 추출 순수함수 (단위 테스트 가능)
```

각 단위의 책임:

| 파일 | 책임 | 의존성 |
|---|---|---|
| `index.tsx` | 카드/탭 컨테이너, 탭 상태 관리 | shadcn `Card`, `Tabs` |
| `TodayView` / `WeekView` / `MonthView` | 뷰별 레이아웃 (휴무 배너, 그룹핑 등) | `useScheduleData`, `ScheduleItem` |
| `ScheduleItem` | 한 줄 일정 표시 + 클릭 핸들 | 디자인 토큰 |
| `ScheduleDetailModal` | 공지 본문 lazy 로드 + 게시판 이동 | shadcn `Dialog`, `bulletinService`, `sanitizeHtml` |
| `useScheduleData` | 3개 소스 병렬 페치 → 정규화 머지 → 정렬 | `bulletinService`, `holidayService`, supabase 클라이언트 |
| `scheduleParser` | content에서 날짜/기간 추출 | (없음, pure) |

---

## 4. 데이터 통합

### 4.1 소스

1. **공지사항** (`bulletinService`)
   - 조건: `category in ('schedule', 'holiday')`
   - 범위: `[start_date, end_date]`이 조회 윈도우와 겹치는 모든 공지
   - `start_date`/`end_date`가 비어있는 공지는 `content`에서 날짜 추출 시도 (4.2 참조)
2. **병원 휴무일** (`clinic_holidays` 테이블)
   - `holiday_date`이 조회 윈도우 범위 내
3. **법정 공휴일** (`holidayService.getPublicHolidays(year)`)
   - 병원 설정 `clinic_holiday_settings.use_public_holidays === true`인 경우에만 포함
   - 대체공휴일은 `use_substitute_holidays === true`일 때만 포함

### 4.2 본문 날짜 추출 (`scheduleParser.ts`)

`start_date`/`end_date`가 채워진 공지는 그 값을 우선 사용한다. 비어 있을 때만 본문에서 추출한다.

지원 패턴 (단일):
- `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`
- `YYYY년 M월 D일`, `M월 D일` (연도 생략 시 추론, 아래 참조)

지원 패턴 (기간):
- 위 표현 + (` ~ ` | ` - ` | ` ~`) + 위 표현
  예: `4월 30일 ~ 5월 2일`, `2026-04-30 ~ 2026-05-02`

연도 생략 시 처리:
- 기본: 현재 연도
- 단, 추출된 날짜가 오늘 기준 6개월 이전이면 다음 해로 보정 (연말~연초 케이스 자연스럽게 처리)

추출은 본문의 첫 매치만 사용한다 (다중 날짜 언급 시 가장 앞 날짜를 일정 시작으로 본다). 추출 실패한 공지는 위젯에 표시하지 않는다 (조용히 누락).

### 4.3 정규화 타입

```typescript
type ScheduleEvent = {
  id: string                                  // 고유키 (source-id 조합)
  source: 'announcement' | 'clinic_holiday' | 'public_holiday'
  startDate: string                           // YYYY-MM-DD
  endDate: string                             // 단일일은 startDate와 동일
  title: string
  category: 'schedule' | 'holiday' | 'public_holiday'
  isPinned?: boolean                          // 공지사항만
  isImportant?: boolean                       // 공지사항만
  announcementId?: string                     // 모달 페치용 (announcement일 때)
}
```

### 4.4 조회 범위 계산

| 탭 | 시작 | 끝 |
|---|---|---|
| 오늘 | `today` | `today` |
| 주간 | `startOfWeek(today, { weekStartsOn: 1 })` (월) | `endOfWeek(today, { weekStartsOn: 1 })` (일) |
| 월간 | `startOfMonth(today)` | `endOfMonth(today)` |

`date-fns`는 프로젝트에 이미 설치되어 있는지 확인 후 사용. 없으면 표준 `Date` API로 직접 계산.

### 4.5 정렬 규칙

1. `startDate` 오름차순
2. 같은 날짜 내 우선순위:
   - 휴무일 (`clinic_holiday`, `public_holiday`, `category=holiday`인 announcement)
   - 중요/고정 공지 (`isImportant || isPinned`)
   - 일반 일정
3. 같은 우선순위 내에서는 `title` 가나다순

### 4.6 페치 전략

- `useScheduleData(viewType, anchorDate)` 훅 내부에서 3개 소스 `Promise.all` 병렬
- 같은 위젯 라이프타임 동안 중복 페치 방지 (탭 전환 시 데이터 캐시 또는 viewType별 결과 메모이제이션)
- 에러 발생 시 빈 배열 반환 + `console.warn` (위젯이 대시보드 전체를 깨뜨리지 않도록)
- AbortController로 페치 중 언마운트 시 취소

---

## 5. UI 레이아웃

### 5.1 카드 헤더 (모든 탭 공통)

```
┌────────────────────────────────────────────┐
│  📅 병원 일정                               │
│  [ 오늘 ]  [ 이번 주 ]  [ 이번 달 ]         │
└────────────────────────────────────────────┘
```

- 카드: shadcn `<Card>` (`rounded-2xl shadow-at-card`)
- 탭: shadcn `<Tabs>` 또는 동일한 스타일의 segment 토글 (모바일 텍스트: `오늘 / 주간 / 월간`)

### 5.2 오늘 탭 (TodayView)

- 해당일이 휴무(병원/법정/휴무공지)인 경우 카드 콘텐츠 최상단에 **휴무 배너**:
  ```
  🏥 오늘 휴무 — {휴무명}
  ```
  스타일: `bg-red-50 border-l-4 border-red-500 text-red-700 px-4 py-3 rounded-lg`
- 배너 아래 일정 리스트 (`ScheduleItem` 반복)
- 빈 상태: lucide `<CalendarOff>` 아이콘 + "오늘 등록된 일정이 없습니다"

### 5.3 주간 탭 (WeekView)

- 월~일 7일을 날짜별 그룹핑
- 일정 없는 날은 그룹 자체 생략 (밀도 유지)
- 그룹 헤더: `04.29 (수)` — 오늘은 `text-at-accent`, 토/일은 `text-red-600`
- 빈 상태: "이번 주 등록된 일정이 없습니다"

### 5.4 월간 탭 (MonthView)

- 주간과 동일한 그룹 형식 (날짜별 그룹 + 항목들)
- 범위만 1일~말일로 확장
- 항목 수가 많을 수 있어 카드 내부 스크롤: `max-h-[480px] overflow-y-auto`
- 빈 상태: "이번 달 등록된 일정이 없습니다"

### 5.5 ScheduleItem

```
[휴무]   신정 연휴                    📌
[일정]   2026 봄 직원 워크샵 (4.30~5.2)  ⭐
[공휴일] 어린이날
```

- 좌측 배지 (4가지):

| 종류 | 라벨 | 배경 | 글자색 |
|---|---|---|---|
| `clinic_holiday` | `휴무` | `bg-red-50` | `text-red-700` |
| `public_holiday` | `공휴일` | `bg-amber-50` | `text-amber-700` |
| announcement (`category=schedule`) | `일정` | `bg-at-accent-tag` | `text-at-accent` |
| announcement (`category=holiday`) | `휴무공지` | `bg-red-50` | `text-red-700` |

- 우측 표식: `isPinned`이면 `<Pin>`, `isImportant`이면 `<Star>` (fill amber-400)
- 기간 일정은 제목 끝에 `(M.D~M.D)` 표기
- announcement source일 때만 `cursor-pointer hover:bg-at-surface-hover`. 휴무일은 `cursor-default`

---

## 6. 상호작용 — 모달 (ScheduleDetailModal)

공지사항 클릭 시에만 열림. 휴무일·법정 공휴일은 클릭 비활성.

### 6.1 모달 구조

```
┌─ Dialog ─────────────────────────────────┐
│ 📌 [일정] 2026 봄 직원 워크샵          ✕ │
├──────────────────────────────────────────┤
│ 📅 2026.04.30 ~ 2026.05.02              │
│ ✍️ 작성자: 홍길동 · 04.20 작성            │
├──────────────────────────────────────────┤
│ [본문 HTML 렌더링, max-h-[60vh] 스크롤]  │
├──────────────────────────────────────────┤
│        [ 닫기 ]   [ 게시판에서 보기 → ] │
└──────────────────────────────────────────┘
```

### 6.2 동작

- 본문은 `bulletinService.getAnnouncement(id)`로 lazy 페치 (모달 오픈 시점)
- 페치 중 스켈레톤
- 본문 렌더링: TipTap이 HTML로 저장하므로 **`@/utils/sanitize`의 `sanitizeHtml(content)`로 sanitize 후** Tailwind `prose` 클래스 적용. (XSS 방어 — 이미 프로젝트의 `AnnouncementDetail.tsx` 등에서 사용 중인 동일 유틸을 그대로 재사용한다. 신규 sanitization 로직을 추가하지 않는다.)
- "게시판에서 보기" → `/dashboard/bulletin?id={announcementId}`로 라우팅
- ESC / 배경 클릭 / X 버튼 닫기 (shadcn 기본)
- **조회수는 증가시키지 않는다** (게시판으로 진입 시에만 카운트되는 기존 흐름 유지)

### 6.3 접근성

- 모달 열림 시 닫기 버튼에 자동 포커스
- Tab 순서: 닫기 → 게시판으로 이동
- 배지에 `aria-label` (예: "휴무 일정", "중요 공지")

---

## 7. 디자인 시스템 적용

기존 `--at-*` CSS 변수와 shadcn 컴포넌트를 그대로 사용한다.

### 7.1 토큰

- 카드: `<Card>` (`rounded-2xl`, `shadow-at-card`)
- 액센트: `--at-accent` (#1b61c9), `--at-accent-tag` (#e8f0fe)
- 텍스트: `--at-text-primary`, `--at-text-secondary`, `--at-text-weak`
- 표면: `--at-surface`, `--at-surface-hover`
- 휴무 강조: `red-50` / `red-500` / `red-700` (Tailwind 기본)
- 공휴일 강조: `amber-50` / `amber-700` (Tailwind 기본)

### 7.2 아이콘 (lucide-react)

- 카드 제목: `<Calendar>`
- 중요: `<Star>` (fill amber-400)
- 고정: `<Pin>`
- 빈 상태: `<CalendarOff>`
- 모달 메타: `<CalendarRange>`, `<UserCircle2>`
- 휴무 배너: `<Building2>` 또는 `<Ban>`

### 7.3 반응형

- 모바일 (`< 768px`): 카드 1열, 탭 텍스트 축약 (`오늘 / 주간 / 월간`)
- 태블릿+: 다른 위젯과 같은 폭

---

## 8. 에러 / 엣지 케이스

| 케이스 | 처리 |
|---|---|
| 공지 본문 날짜 추출 실패 | 위젯에서 누락 (콘솔에 debug 로그) |
| 휴무 설정 조회 실패 | 법정 공휴일 표시 안 함 (병원·공지 휴무는 그대로) |
| 모달 본문 페치 실패 | 모달 내 에러 메시지 + "게시판에서 보기" 버튼은 활성 유지 |
| 같은 날짜에 동일 항목 중복 (휴무공지+병원휴무) | `(date, title)`로 dedupe |
| 기간이 조회 윈도우 일부만 겹치는 경우 | 그대로 표시, 제목에 전체 기간 노출 |
| 클리닉 ID 미확인 (인증 직후) | 빈 상태 표시, 컨텍스트가 채워지면 자동 재페치 |

---

## 9. 비범위 (Out of Scope)

- 일정 등록/수정 UI (게시판에서 함)
- 캘린더 그리드 뷰 (날짜 그룹 리스트로 충분)
- 일정 알림/푸시
- 휴무일 데이터 편집 (마스터 페이지에서 별도 관리)
- general 카테고리 공지사항 (일정성이 아니므로)

---

## 10. 검증 계획

1. `npm run build` 통과
2. Chrome DevTools MCP로 테스트 계정(`whitedc0902@gmail.com`) 로그인 후:
   - 오늘 / 주간 / 월간 탭 전환 동작 확인
   - 공지사항 항목 클릭 → 모달 본문 정상 표시 (sanitize 적용 확인) → "게시판에서 보기" 라우팅 확인
   - 휴무일 항목 클릭 비활성 확인
   - 빈 상태 메시지 표시 확인 (필요 시 임시로 데이터 비우고 검증)
3. `scheduleParser` 단위 테스트 (가능한 경우):
   - 단일 날짜 패턴 5종, 기간 패턴 4종, 연도 생략 보정, 추출 실패 케이스
4. 콘솔 에러 0건 확인
