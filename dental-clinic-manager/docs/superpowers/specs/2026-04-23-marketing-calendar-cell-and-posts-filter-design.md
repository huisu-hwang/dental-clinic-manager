# 마케팅 캘린더 셀 간소화 & 글 관리 필터 설계

**작성일:** 2026-04-23
**상태:** Approved
**범위:** 마케팅 캘린더 UI / 글 관리 목록 필터

---

## 1. 문제

### 1-1. 캘린더 일별 셀의 정보 과밀
현재 `CalendarItemCard`는 한 셀에 다음을 모두 렌더링한다:
- 상태 배지("제안", "승인", …) / 카테고리 배지 / 여정 배지 / 심의 배지
- 제목 / 키워드 / 월간 검색량 / 선정 근거(`planning_rationale`)
- 승인/수정/재생성/반려 액션 4개
- 발행됨 상태의 메트릭(조회수·좋아요·댓글·스크랩)

→ 월간 그리드(42셀)에 여러 항목이 쌓일수록 가독성이 저하되고 훑어보기 어렵다.

### 1-2. "글 관리" 탭이 미승인 제안까지 표시
`/api/marketing/posts` 는 status 필터 없이 모든 `content_calendar_items`를 반환. 그 결과 "글 관리"에 `proposed`, `rejected`, `approved`(본문 없음)까지 섞여 노출.

---

## 2. 해결

### 2-1. 셀은 "스캔 가능한 헤드라인"으로 축소
- **표시**: 제목(2줄) / 주제(1줄) / 키워드(1줄) + 좌측 상태 컬러 스트립 + 심의 배지(예외)
- **숨김**: 상태 텍스트 배지, 카테고리/여정 배지, 검색량, 선정 근거, 액션 버튼, 메트릭
- **클릭**: 우측 사이드패널 열림 → 숨긴 정보 + 액션 전부 표시

### 2-2. "글 관리"는 생성된 본문이 있는 항목만
- 필터: `generated_content IS NOT NULL`
- 해당 상태: `review`, `scheduled`, `publishing`, `published`, `failed`
- "승인만 된 계획"은 캘린더 영역에 남음

---

## 3. 컴포넌트 구조

### 3-1. 변경/신규 파일
| 파일 | 작업 |
|------|------|
| `src/components/marketing/CalendarItemCard.tsx` | 대폭 간소화, 편집 모드 제거, `onOpenDetail` prop 추가 |
| `src/components/marketing/CalendarItemDetailPanel.tsx` | 신규 (우측 드로어) |
| `src/components/marketing/ContentCalendarView.tsx` | `openedItemId` 상태 + 패널 연결 + 중복 bulk bar 정리 |
| `src/app/api/marketing/posts/route.ts` | `.not('generated_content', 'is', null)` 필터 추가 |

### 3-2. 새 Card 구조
```
┌──────────────────────────────────────┐
│▌ {title, line-clamp-2}               │  ← stripe(좌측 4px) + 제목
│  {topic, line-clamp-1}               │
│  🔎 {keyword}                         │
│  [⚠ 심의]  (needs_medical_review만)   │
└──────────────────────────────────────┘
cursor-pointer · hover:bg-at-surface-hover · selected → ring-at-accent
```
**컬러 스트립 (상태별)**
- `proposed`/`modified`: `at-border` (회색)
- `approved`: `at-accent` (파랑)
- `generating`/`publishing`: amber-400
- `review`: violet-500
- `scheduled`: cyan-500
- `published`: emerald-500
- `failed`: at-error

Card는 편집 로컬 상태 제거(패널이 소유).

### 3-3. CalendarItemDetailPanel
Props:
```ts
{
  item: ContentCalendarItem | null  // null이면 닫힘
  isForeign?: boolean                // 다른 캘린더 항목 (읽기 전용)
  onClose: () => void
  onApprove: () => Promise<void>
  onReject: () => Promise<void>
  onUpdate: (patch: Partial<ContentCalendarItem>) => Promise<void>
  onRegenerate: () => Promise<void>
}
```
배치:
- `fixed right-0 top-0 h-screen w-[420px]` 우측 고정 드로어
- Transform slide-in (`translate-x`) 애니메이션
- 배경 오버레이 없음 → 캘린더 그리드가 계속 보임
- ESC / X 버튼으로 닫기
- 다른 셀 클릭 시 닫지 않고 내용만 교체

렌더 섹션:
1. 상단 배지 영역 (상태/카테고리/여정/심의)
2. 제목 (편집 가능, `<input>`)
3. 📝 주제 (`item.topic`, 편집 가능)
4. 🔎 타겟 키워드 (편집 가능)
5. 📊 예상 검색량 · 💡 선정 근거
6. 📅 발행일 / 시간
7. 🚀 플랫폼 아이콘
8. 발행됨일 때: 메트릭 박스
9. 실패일 때: `fail_reason`
10. 하단 액션: [✓ 승인] [↻ 재생성] [✎ 저장] [✕ 반려]
    - 편집 중이 아닐 때: 승인/재생성/반려 표시
    - 편집 중: 저장/취소만 표시
    - `isForeign`: 모든 액션 숨김

### 3-4. ContentCalendarView 통합
- 신규 상태: `const [openedItemId, setOpenedItemId] = useState<string | null>(null)`
- `handleOpenDetail = (id) => setOpenedItemId(id)`
- `<CalendarItemCard onOpenDetail={handleOpenDetail} ... />`
- 그리드 뒤에 `<CalendarItemDetailPanel item={openedItem} ... />` 렌더링
- `openedItem`은 `grid`에서 `item.id === openedItemId`로 lookup
- 중복되는 두 번째 bulk action bar(현재 452~488줄) 제거 — 이미 380~448줄에 통합된 바가 있음

---

## 4. 데이터 흐름

### 4-1. 셀 클릭 → 패널 열기
```
user click CalendarItemCard
   ↓
onOpenDetail(item.id)
   ↓
ContentCalendarView.setOpenedItemId(id)
   ↓
<CalendarItemDetailPanel item={lookup(id)} />
```

### 4-2. 패널에서 액션
기존 `handleApprove`/`handleReject`/`handleItemUpdate`/`handleRegenerate` 재사용.
액션 성공 후 `loadCalendars()` 호출 → 패널의 `item` prop도 새 데이터로 갱신.

### 4-3. 글 관리 필터
API 쿼리에 `.not('generated_content', 'is', null)` 추가.
프론트엔드는 변경 없음.

---

## 5. 에러 처리

- 패널 액션 실패: 패널 내부 에러 배너(`bg-at-error-bg`)로 표시
- 네트워크 실패: 기존 `ContentCalendarView.error` 경로 재사용
- API 필터 오류: 기존 try/catch 유지

---

## 6. 테스트

### 6-1. 빌드
- `npm run build` → 타입/컴파일 에러 0

### 6-2. 기능 (dev 서버 + 브라우저)
테스트 계정: `whitedc0902@gmail.com` / `ghkdgmltn81!`

1. `/dashboard/marketing` → 캘린더 탭
2. 캘린더가 있으면 셀 클릭 → 우측 패널 열림 확인
3. 패널에서 승인 클릭 → 닫히지 않고 상태 갱신 확인
4. 다른 셀 클릭 → 패널 내용만 교체되는지 확인
5. ESC → 패널 닫힘 확인
6. 글 관리 탭 → `proposed`/`approved`(본문 없음) 항목이 안 보이는지 확인
7. 콘솔 에러 없는지 확인

---

## 7. 하위 호환성

- `CalendarItemCard`의 기존 콜백(`onApprove` 등)은 유지 → `ContentCalendarView`에서 전달 경로 유지
- `content_calendar_items` 스키마/상태 값 변경 없음
- 다른 소비자(`/dashboard/marketing` 의 다른 탭)는 영향 없음
