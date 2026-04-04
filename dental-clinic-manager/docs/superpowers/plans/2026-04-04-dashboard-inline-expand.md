# Dashboard Inline Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대시보드 3개 섹션(오늘의 현황·팀 출퇴근·주간 통계)의 모든 통계 카드를 클릭하면 해당 상세 목록이 인라인으로 펼쳐지는 아코디언 UI를 구현한다.

**Architecture:** `DashboardHome.tsx`에 섹션별 `activePanel` state 3개와 toggle 헬퍼를 추가한다. 새 API 호출 없이 이미 로드된 `consultLogs`, `giftLogs`, `teamStatus.employees` 데이터를 재사용한다. 주간 통계는 기존 `weeklySummary` useMemo를 확장하여 `dailyBreakdown` 배열을 추가한다.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|----------|------|
| `src/components/Dashboard/DashboardHome.tsx` | Modify | 모든 변경사항의 유일한 대상 파일 |

---

## Task 1: 상태 변수 및 toggle 헬퍼 추가

**Files:**
- Modify: `src/components/Dashboard/DashboardHome.tsx`

- [ ] **Step 1: DashboardHome.tsx에서 `currentTime` state 선언을 코드 검색으로 찾기**

```bash
grep -n "currentTime" src/components/Dashboard/DashboardHome.tsx
```
아래 패턴 바로 아래에 추가:
```typescript
const [currentTime, setCurrentTime] = useState(new Date())
```

- [ ] **Step 2: 3개 섹션 activePanel state와 toggle 헬퍼를 그 바로 아래에 추가**

```typescript
// 인라인 확장 패널 상태
const [todayActivePanel, setTodayActivePanel] = useState<'consult' | 'recall' | 'gift' | null>(null)
const [attendanceActivePanel, setAttendanceActivePanel] = useState<'checkin' | 'checkout' | 'absent' | 'late' | 'early' | 'overtime' | null>(null)
const [weeklyActivePanel, setWeeklyActivePanel] = useState<'consult' | 'recall' | 'gift' | null>(null)

// 아코디언 토글 헬퍼 (같은 값 클릭 시 닫힘)
function togglePanel<T extends string>(
  current: T | null,
  next: T,
  setter: React.Dispatch<React.SetStateAction<T | null>>
) {
  setter(current === next ? null : next)
}
```

- [ ] **Step 3: 빌드 확인 (타입 에러 없음)**

```bash
cd /Users/hhs/project/dental-clinic-manager/dental-clinic-manager && npm run build 2>&1 | tail -20
```
Expected: 타입 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/Dashboard/DashboardHome.tsx
git commit -m "feat: 대시보드 인라인 확장 - state 및 toggle 헬퍼 추가"
```

---

## Task 2: weeklySummary에 dailyBreakdown 추가

**Files:**
- Modify: `src/components/Dashboard/DashboardHome.tsx`

- [ ] **Step 1: DailyBreakdownItem 인터페이스를 파일 상단 인터페이스 정의 영역에 추가**

파일 상단 `WeatherData` 등 인터페이스 정의 아래:

```typescript
interface DailyBreakdownItem {
  date: string           // 'YYYY-MM-DD'
  dayLabel: string       // '월', '화', '수', '목', '금'
  consultCount: number
  consultSuccess: number
  recallCount: number
  recallBookingCount: number
  giftCount: number
  reviewCount: number
  isToday: boolean
}
```

- [ ] **Step 2: weeklySummary useMemo의 return 직전에 dailyBreakdown 계산 로직 추가**

기존 `return { weekStart: ..., consultTotal, ... }` 바로 위에:

```typescript
// 일별 상세 데이터 생성
// NOTE: toISOString()은 UTC 기준이므로 KST(+9) 환경에서 날짜가 밀릴 수 있음.
// 로컬 시간 기준으로 YYYY-MM-DD 문자열을 직접 조합한다.
const dailyBreakdown: DailyBreakdownItem[] = []
const dayNames = ['일', '월', '화', '수', '목', '금', '토']

for (let d = new Date(monday); d <= now; d.setDate(d.getDate() + 1)) {
  // 로컬 날짜 문자열 조합 (UTC 경계 문제 방지)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const dateStr = `${y}-${m}-${day}`

  const dayReport = dailyReports.find(r => r.date === dateStr)
  const dayConsults = consultLogs.filter(c => c.date === dateStr)
  const dayGifts = giftLogs.filter(g => g.date === dateStr)

  // 상담 수: 보고서 우선, 없으면 로그에서
  let consultCount = 0
  let consultSuccess = 0
  if (dayReport) {
    consultCount = (dayReport.consult_proceed || 0) + (dayReport.consult_hold || 0)
    consultSuccess = dayReport.consult_proceed || 0
  } else {
    consultCount = dayConsults.length
    consultSuccess = dayConsults.filter(c => c.consult_status === 'O').length
  }

  // getDay()도 UTC 기준이 될 수 있으므로 정오(T12:00:00)로 파싱
  const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay()

  dailyBreakdown.push({
    date: dateStr,
    dayLabel: dayNames[dayOfWeek],
    consultCount,
    consultSuccess,
    recallCount: dayReport?.recall_count || 0,
    recallBookingCount: dayReport?.recall_booking_count || 0,
    giftCount: dayGifts.reduce((sum, g) => sum + (g.quantity || 1), 0),
    reviewCount: dayReport?.naver_review_count || 0,
    isToday: dateStr === today,
  })
}
```

- [ ] **Step 3: weeklySummary return에 dailyBreakdown 추가**

```typescript
return {
  weekStart: weekStartStr,
  consultTotal,
  consultSuccess,
  successRate,
  recallTotal,
  recallBookingTotal,
  giftTotal,
  reviewTotal,
  dailyBreakdown,  // 추가
}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/hhs/project/dental-clinic-manager/dental-clinic-manager && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/Dashboard/DashboardHome.tsx
git commit -m "feat: weeklySummary에 일별 상세 데이터(dailyBreakdown) 추가"
```

---

## Task 3: Section A — 오늘의 현황 클릭 가능 카드 + 확장 패널

**Files:**
- Modify: `src/components/Dashboard/DashboardHome.tsx`

- [ ] **Step 1: 오늘 보고서 데이터를 useMemo 밖에서 접근 가능하게**

`todaySummary` useMemo 바로 아래에 추가:

```typescript
// JSX에서 직접 접근하기 위해 useMemo 밖에 선언
// (todaySummary 내부에도 동명 변수가 있지만 그 스코프 밖에서는 접근 불가)
// 의도적으로 비-memoized: dailyReports/consultLogs/giftLogs 변화 시 자동 재계산됨
const todayReport = dailyReports.find(r => r.date === today)
const todayConsults = consultLogs.filter(c => c.date === today)
const todayGifts = giftLogs.filter(g => g.date === today)
```

- [ ] **Step 2: 오늘의 현황 3개 stat 카드를 클릭 가능하게 교체**

기존 `<div className="grid grid-cols-3 gap-2 sm:gap-3">` 내부의 3개 `<div className="bg-slate-50 rounded-lg p-3 text-center">` 를 아래로 교체:

```tsx
{/* 성공/상담 */}
<button
  onClick={() => togglePanel(todayActivePanel, 'consult', setTodayActivePanel)}
  className={`rounded-lg p-3 text-center w-full transition-all ${
    todayActivePanel === 'consult'
      ? 'bg-blue-50 ring-2 ring-blue-400'
      : 'bg-slate-50 hover:bg-slate-100'
  }`}
>
  <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
  <p className="text-lg sm:text-xl font-bold text-green-600">
    {todaySummary.consultProceed}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{todaySummary.consultCount}</span>
  </p>
  <p className="text-xs text-slate-500">성공/상담</p>
  <p className="text-[10px] text-slate-400 mt-0.5">{todayActivePanel === 'consult' ? '▲ 닫기' : '▼ 목록 보기'}</p>
</button>

{/* 예약/리콜 */}
<button
  onClick={() => togglePanel(todayActivePanel, 'recall', setTodayActivePanel)}
  className={`rounded-lg p-3 text-center w-full transition-all ${
    todayActivePanel === 'recall'
      ? 'bg-blue-50 ring-2 ring-blue-400'
      : 'bg-slate-50 hover:bg-slate-100'
  }`}
>
  <Calendar className="w-5 h-5 text-orange-500 mx-auto mb-1" />
  <p className="text-lg sm:text-xl font-bold text-orange-600">
    {todaySummary.recallBookingCount}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{todaySummary.recallCount}</span>
  </p>
  <p className="text-xs text-slate-500">예약/리콜</p>
  <p className="text-[10px] text-slate-400 mt-0.5">{todayActivePanel === 'recall' ? '▲ 닫기' : '▼ 현황 보기'}</p>
</button>

{/* 리뷰/선물 */}
<button
  onClick={() => togglePanel(todayActivePanel, 'gift', setTodayActivePanel)}
  className={`rounded-lg p-3 text-center w-full transition-all ${
    todayActivePanel === 'gift'
      ? 'bg-blue-50 ring-2 ring-blue-400'
      : 'bg-slate-50 hover:bg-slate-100'
  }`}
>
  <BarChart3 className="w-5 h-5 text-purple-500 mx-auto mb-1" />
  <p className="text-lg sm:text-xl font-bold text-purple-600">
    {todaySummary.naverReviewCount}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{todaySummary.giftCount}</span>
  </p>
  <p className="text-xs text-slate-500">리뷰/선물</p>
  <p className="text-[10px] text-slate-400 mt-0.5">{todayActivePanel === 'gift' ? '▲ 닫기' : '▼ 목록 보기'}</p>
</button>
```

- [ ] **Step 3: 카드 grid 닫는 태그(`</div>`) 바로 아래에 확장 패널 3개 추가**

```tsx
{/* 상담 확장 패널 */}
{todayActivePanel === 'consult' && (
  <div className="mt-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
    <div className="bg-slate-50 px-4 py-2 flex justify-between items-center border-b border-slate-200">
      <span className="text-xs font-semibold text-slate-600">📋 오늘 상담 목록</span>
      <span className="text-xs text-slate-400">총 {todayConsults.length}건</span>
    </div>
    {todayConsults.length === 0 ? (
      <p className="text-sm text-slate-400 text-center py-4">데이터가 없습니다</p>
    ) : (
      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
        {todayConsults.map((c, i) => (
          <div key={c.id ?? i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="font-medium text-slate-800 w-16 truncate">{c.patient_name}</span>
            <span className="text-slate-500 flex-1 truncate">{c.consult_content}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              c.consult_status === 'O' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'
            }`}>
              {c.consult_status === 'O' ? '✓ 성공' : '✗ 보류'}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{/* 리콜 확장 패널 */}
{todayActivePanel === 'recall' && (() => {
  const bookedNames = todayReport?.recall_booking_names
    ? todayReport.recall_booking_names.split(',').map(n => n.trim()).filter(Boolean)
    : []
  const unbookedCount = Math.max(0, (todayReport?.recall_count || 0) - bookedNames.length)
  return (
    <div className="mt-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 flex justify-between items-center border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-600">📞 오늘 리콜 현황</span>
        <span className="text-xs text-slate-400">예약 {bookedNames.length} / 리콜 {todayReport?.recall_count || 0}건</span>
      </div>
      {(todayReport?.recall_count || 0) === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">데이터가 없습니다</p>
      ) : (
        <div className="px-4 py-3 space-y-2 max-h-[300px] overflow-y-auto">
          {bookedNames.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-xs text-slate-500 w-14 pt-0.5">예약완료</span>
              <div className="flex flex-wrap gap-1.5 flex-1">
                {bookedNames.map((name, i) => (
                  <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{name}</span>
                ))}
              </div>
            </div>
          )}
          {unbookedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 w-14">미예약</span>
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unbookedCount}명</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
})()}

{/* 선물 확장 패널 */}
{todayActivePanel === 'gift' && (
  <div className="mt-2 bg-white border border-slate-200 rounded-lg overflow-hidden">
    <div className="bg-slate-50 px-4 py-2 flex justify-between items-center border-b border-slate-200">
      <span className="text-xs font-semibold text-slate-600">🎁 오늘 선물/리뷰 목록</span>
      <span className="text-xs text-slate-400">총 {todayGifts.length}건</span>
    </div>
    {todayGifts.length === 0 ? (
      <p className="text-sm text-slate-400 text-center py-4">데이터가 없습니다</p>
    ) : (
      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
        {todayGifts.map((g, i) => (
          <div key={g.id ?? i} className="flex items-center gap-2 px-4 py-2 text-sm">
            <span className="font-medium text-slate-800 w-16 truncate">{g.patient_name}</span>
            <span className="text-slate-500 flex-1 truncate">{g.gift_type} × {g.quantity}</span>
            {g.naver_review === 'O' ? (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">리뷰 ✓</span>
            ) : (
              <span className="text-xs text-slate-400">리뷰 없음</span>
            )}
          </div>
        ))}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /Users/hhs/project/dental-clinic-manager/dental-clinic-manager && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: 커밋**

```bash
git add src/components/Dashboard/DashboardHome.tsx
git commit -m "feat: 오늘의 현황 카드 클릭 시 인라인 확장 상세 목록 추가"
```

---

## Task 4: Section B — 팀 출퇴근 현황 클릭 가능 카드 + 확장 패널

**Files:**
- Modify: `src/components/Dashboard/DashboardHome.tsx`

- [ ] **Step 1: 팀 출퇴근 현황 6개 stat div를 클릭 가능한 button으로 교체**

기존 `<div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">` 내부 6개 div를 교체:

```tsx
{/* 출근/전체 */}
<button onClick={() => togglePanel(attendanceActivePanel, 'checkin', setAttendanceActivePanel)}
  className={`rounded-lg p-2 text-center transition-all ${attendanceActivePanel === 'checkin' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg font-bold text-green-600">{teamStatus.checked_in}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{teamStatus.total_employees}</span></p>
  <p className="text-xs text-green-600">출근/전체</p>
</button>

{/* 퇴근 */}
<button onClick={() => togglePanel(attendanceActivePanel, 'checkout', setAttendanceActivePanel)}
  className={`rounded-lg p-2 text-center transition-all ${attendanceActivePanel === 'checkout' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg font-bold text-blue-600">{teamStatus.checked_out || 0}</p>
  <p className="text-xs text-blue-600">퇴근</p>
</button>

{/* 결근 */}
<button onClick={() => togglePanel(attendanceActivePanel, 'absent', setAttendanceActivePanel)}
  className={`rounded-lg p-2 text-center transition-all ${attendanceActivePanel === 'absent' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg font-bold text-orange-600">{teamStatus.not_checked_in}</p>
  <p className="text-xs text-orange-600">결근</p>
</button>

{/* 지각 (sm 이상) */}
<button onClick={() => togglePanel(attendanceActivePanel, 'late', setAttendanceActivePanel)}
  className={`hidden sm:block rounded-lg p-2 text-center transition-all ${attendanceActivePanel === 'late' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg font-bold text-yellow-600">{teamStatus.late_count}</p>
  <p className="text-xs text-yellow-600">지각</p>
</button>

{/* 조퇴 (sm 이상) */}
<button onClick={() => togglePanel(attendanceActivePanel, 'early', setAttendanceActivePanel)}
  className={`hidden sm:block rounded-lg p-2 text-center transition-all ${attendanceActivePanel === 'early' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg font-bold text-red-600">{teamStatus.early_leave_count || 0}</p>
  <p className="text-xs text-red-600">조퇴</p>
</button>

{/* 초과 (sm 이상) */}
<button onClick={() => togglePanel(attendanceActivePanel, 'overtime', setAttendanceActivePanel)}
  className={`hidden sm:block rounded-lg p-2 text-center transition-all ${attendanceActivePanel === 'overtime' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg font-bold text-purple-600">{teamStatus.overtime_count || 0}</p>
  <p className="text-xs text-purple-600">초과</p>
</button>
```

- [ ] **Step 2: 출근률 progress bar 아래, `teamStatus ? (...)` 조건부 블록 안에 확장 패널 추가**

**중요**: 확장 패널은 반드시 기존 `teamStatus ? (...)` 조건부 렌더링 블록 안, progress bar `</div>` 닫는 태그 **바로 위**에 삽입한다 (`teamStatus` null 접근 방지).

타입은 `typeof teamStatus.employees[0]` 대신 `TeamAttendanceStatus['employees'][number]` 사용:

```tsx
{/* 출퇴근 확장 패널 — teamStatus ? (...) 블록 안에 위치해야 함 */}
{attendanceActivePanel && (() => {
  type Emp = TeamAttendanceStatus['employees'][number]
  const filterMap: Record<typeof attendanceActivePanel, (e: Emp) => boolean> = {
    checkin:  (e) => e.check_in_time != null,
    checkout: (e) => e.check_out_time != null,
    absent:   (e) => e.status === 'absent',
    late:     (e) => e.late_minutes > 0,
    early:    (e) => e.early_leave_minutes > 0,
    overtime: (e) => e.overtime_minutes > 0,
  }
  const labelMap: Record<typeof attendanceActivePanel, string> = {
    checkin: '🟢 출근 직원', checkout: '🔵 퇴근 직원', absent: '🔴 결근 직원',
    late: '🟡 지각 직원', early: '🟠 조퇴 직원', overtime: '🟣 초과근무 직원',
  }
  const filtered = (teamStatus.employees || []).filter(filterMap[attendanceActivePanel])
  const formatTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'
  const statusTag = (e: Emp) => {
    if (attendanceActivePanel === 'late') return `지각 ${e.late_minutes}분`
    if (attendanceActivePanel === 'early') return `조퇴 ${e.early_leave_minutes}분`
    if (attendanceActivePanel === 'overtime') return `초과 ${e.overtime_minutes}분`
    if (e.status === 'absent') return '결근'
    if (e.check_out_time) return '퇴근완료'
    return '출근중'
  }
  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-4 py-2 flex justify-between items-center border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-600">{labelMap[attendanceActivePanel]}</span>
        <span className="text-xs text-slate-400">{filtered.length}명</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-4">데이터가 없습니다</p>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
          {filtered.map(emp => (
            <div key={emp.user_id} className="flex items-center gap-2 px-4 py-2 text-sm">
              <span className="font-medium text-slate-800 w-16 truncate">{emp.user_name}</span>
              <span className="text-slate-500 flex-1 text-xs">
                {emp.check_in_time ? `${formatTime(emp.check_in_time)} 출근` : ''}
                {emp.check_out_time ? ` → ${formatTime(emp.check_out_time)} 퇴근` : ''}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{statusTag(emp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})()}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/hhs/project/dental-clinic-manager/dental-clinic-manager && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/Dashboard/DashboardHome.tsx
git commit -m "feat: 팀 출퇴근 현황 카드 클릭 시 직원 상세 목록 인라인 확장 추가"
```

---

## Task 5: Section C — 주간 통계 클릭 가능 카드 + 확장 패널

**Files:**
- Modify: `src/components/Dashboard/DashboardHome.tsx`

- [ ] **Step 1: 주간 통계 3개 stat div를 클릭 가능한 button으로 교체**

기존 `<div className="bg-slate-50 rounded-lg p-4">` 내부 `<div className="grid grid-cols-3 gap-2 text-center">` 안의 3개 div 교체:

```tsx
{/* 성공/상담 */}
<button onClick={() => togglePanel(weeklyActivePanel, 'consult', setWeeklyActivePanel)}
  className={`rounded-lg p-2 text-center transition-all ${weeklyActivePanel === 'consult' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg sm:text-xl font-bold text-green-600">
    {weeklySummary.consultSuccess}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{weeklySummary.consultTotal}</span>
  </p>
  <p className="text-xs text-slate-500">성공/상담 ({weeklySummary.successRate}%)</p>
  <p className="text-[10px] text-slate-400 mt-0.5">{weeklyActivePanel === 'consult' ? '▲' : '▼ 일별 보기'}</p>
</button>

{/* 예약/리콜 */}
<button onClick={() => togglePanel(weeklyActivePanel, 'recall', setWeeklyActivePanel)}
  className={`rounded-lg p-2 text-center transition-all ${weeklyActivePanel === 'recall' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg sm:text-xl font-bold text-orange-600">
    {weeklySummary.recallBookingTotal}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{weeklySummary.recallTotal}</span>
  </p>
  <p className="text-xs text-slate-500">예약/리콜</p>
  <p className="text-[10px] text-slate-400 mt-0.5">{weeklyActivePanel === 'recall' ? '▲' : '▼ 일별 보기'}</p>
</button>

{/* 선물/리뷰 */}
<button onClick={() => togglePanel(weeklyActivePanel, 'gift', setWeeklyActivePanel)}
  className={`rounded-lg p-2 text-center transition-all ${weeklyActivePanel === 'gift' ? 'bg-blue-50 ring-2 ring-blue-400' : 'hover:bg-slate-100'}`}>
  <p className="text-lg sm:text-xl font-bold text-purple-600">
    {weeklySummary.giftTotal}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{weeklySummary.reviewTotal}</span>
  </p>
  <p className="text-xs text-slate-500">선물/리뷰</p>
  <p className="text-[10px] text-slate-400 mt-0.5">{weeklyActivePanel === 'gift' ? '▲' : '▼ 일별 보기'}</p>
</button>
```

- [ ] **Step 2: 주간 통계 grid 닫는 태그 아래에 확장 패널 3개 추가**

```tsx
{/* 주간 통계 확장 패널 */}
{weeklyActivePanel && (
  <div className="mt-3 bg-white border border-slate-200 rounded-lg overflow-hidden">
    <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
      <span className="text-xs font-semibold text-slate-600">
        {weeklyActivePanel === 'consult' && '📅 이번 주 상담 일별 현황'}
        {weeklyActivePanel === 'recall' && '📅 이번 주 리콜 일별 현황'}
        {weeklyActivePanel === 'gift' && '📅 이번 주 선물/리뷰 일별 현황'}
      </span>
    </div>
    {weeklySummary.dailyBreakdown.length === 0 ? (
      <p className="text-sm text-slate-400 text-center py-4">데이터가 없습니다</p>
    ) : (
      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
        {weeklySummary.dailyBreakdown.map(day => {
          const successRate = weeklyActivePanel === 'consult' && day.consultCount > 0
            ? Math.round((day.consultSuccess / day.consultCount) * 100)
            : 0
          return (
            <div key={day.date} className={`flex items-center gap-3 px-4 py-2 text-sm ${day.isToday ? 'bg-blue-50' : ''}`}>
              <span className={`font-semibold w-6 text-center ${day.isToday ? 'text-blue-600' : 'text-slate-500'}`}>{day.dayLabel}</span>
              <span className={`text-xs w-16 ${day.isToday ? 'text-blue-500' : 'text-slate-400'}`}>{day.date.slice(5).replace('-', '.')}</span>
              {weeklyActivePanel === 'consult' && (
                <>
                  <span className={`font-semibold w-12 text-right ${day.isToday ? 'text-blue-600' : 'text-green-600'}`}>
                    {day.isToday ? '진행중' : `${day.consultSuccess}/${day.consultCount}`}
                  </span>
                  {!day.isToday && day.consultCount > 0 && (
                    <div className="flex-1 bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div className="bg-green-500 h-1.5 rounded-full" style={{ width: `${successRate}%` }} />
                    </div>
                  )}
                </>
              )}
              {weeklyActivePanel === 'recall' && (
                <span className={`font-semibold flex-1 ${day.isToday ? 'text-blue-600' : 'text-orange-600'}`}>
                  {day.isToday ? '진행중' : `예약 ${day.recallBookingCount} / 리콜 ${day.recallCount}`}
                </span>
              )}
              {weeklyActivePanel === 'gift' && (
                <span className={`font-semibold flex-1 ${day.isToday ? 'text-blue-600' : 'text-purple-600'}`}>
                  {day.isToday ? '진행중' : `선물 ${day.giftCount} · 리뷰 ${day.reviewCount}`}
                </span>
              )}
            </div>
          )
        })}
      </div>
    )}
  </div>
)}
```

- [ ] **Step 3: 빌드 확인**

```bash
cd /Users/hhs/project/dental-clinic-manager/dental-clinic-manager && npm run build 2>&1 | tail -20
```

- [ ] **Step 4: 커밋**

```bash
git add src/components/Dashboard/DashboardHome.tsx
git commit -m "feat: 주간 통계 카드 클릭 시 일별 상세 현황 인라인 확장 추가"
```

---

## Task 6: 브라우저 테스트 및 최종 검증

- [ ] **Step 1: 개발 서버 실행**

```bash
cd /Users/hhs/project/dental-clinic-manager/dental-clinic-manager && npm run dev
```

- [ ] **Step 2: 테스트 계정으로 로그인**

- URL: `http://localhost:3000`
- 계정: `whitedc0902@gmail.com` / `ghkdgmltn81!`

- [ ] **Step 3: 오늘의 현황 섹션 테스트**
  - 성공/상담 카드 클릭 → 상담 목록 펼쳐짐 확인
  - 예약/리콜 카드 클릭 → 성공/상담 패널 닫히고 리콜 패널 열림 확인 (아코디언)
  - 리뷰/선물 카드 클릭 → 선물 목록 확인
  - 같은 카드 재클릭 → 패널 닫힘 확인

- [ ] **Step 4: 팀 출퇴근 현황 섹션 테스트**
  - 출근/전체 숫자 클릭 → 출근 직원 목록 확인
  - 결근 클릭 → 출근 패널 닫히고 결근 직원 확인
  - 데이터 없는 항목(예: 조퇴 0명) 클릭 → "데이터가 없습니다" 메시지 확인

- [ ] **Step 5: 주간 통계 섹션 테스트**
  - 성공/상담 클릭 → 일별 상담 현황 + progress bar 확인
  - 오늘 행은 파란색 "진행중" 표시 확인
  - 예약/리콜, 선물/리뷰 각각 테스트

- [ ] **Step 6: 콘솔 에러 없음 확인**

Chrome DevTools 콘솔 에러 없어야 함

- [ ] **Step 7: 최종 커밋 및 푸시**

```bash
cd /Users/hhs/project/dental-clinic-manager/dental-clinic-manager
git push origin develop
```
