# 대시보드 인라인 확장 (클릭 → 상세 보기) 설계

**날짜:** 2026-04-04
**상태:** 승인됨

---

## 개요

대시보드 홈(`DashboardHome.tsx`)의 3개 섹션 모든 통계 카드를 클릭 가능하게 만들고, 클릭 시 해당 카드 아래에 상세 목록이 인라인으로 펼쳐진다. 각 섹션 내에서 하나의 패널만 열리는 아코디언 방식이며, 같은 카드를 다시 클릭하면 닫힌다.

---

## 대상 섹션 및 상세 내용

### A. 오늘의 현황 (`todaySummary`)

| 카드 | 클릭 시 표시 내용 | 데이터 소스 |
|------|-----------------|------------|
| 성공/상담 | 오늘 상담 목록 (환자명, 상담내용, 결과 O/X) | `consultLogs.filter(c => c.date === today)` |
| 예약/리콜 | 예약완료 이름 목록 + 미예약 건수 (이름 없음) | `dailyReport.recall_booking_names` (쉼표 구분) + `recall_count - recall_booking_count` |
| 리뷰/선물 | 오늘 선물 목록 (환자명, 종류, 수량, 리뷰여부) | `giftLogs.filter(g => g.date === today)` |

**리콜 패널 세부**: `recall_booking_names`는 예약 완료된 환자 이름만 존재. 미예약은 건수(`recall_count - recall_booking_count`)만 표시, 개별 이름 없음.

### B. 팀 출퇴근 현황 (`teamStatus`)

| 카드 | 클릭 시 표시 내용 | 필터 조건 |
|------|-----------------|---------|
| 출근/전체 | 출근한 직원 목록 (이름, 출근시간, 상태) | `check_in_time !== null` |
| 퇴근 | 퇴근 완료 직원 목록 (이름, 출퇴근 시간) | `check_out_time !== null` |
| 결근 | 결근 직원 목록 | `status === 'absent'` |
| 지각 | 지각 직원 목록 (이름, 지각 분) | `late_minutes > 0` |
| 조퇴 | 조퇴 직원 목록 (이름, 조퇴 분) | `early_leave_minutes > 0` |
| 초과 | 초과근무 직원 목록 (이름, 초과 분) | `overtime_minutes > 0` |

### C. 주간 통계 (`weeklySummary`)

| 카드 | 클릭 시 표시 내용 | 데이터 소스 |
|------|-----------------|------------|
| 성공/상담 | 이번 주 일별 상담 수 + 성공률 인라인 바 | `dailyBreakdown[].consultCount / consultSuccess` |
| 예약/리콜 | 이번 주 일별 예약/리콜 수 | `dailyBreakdown[].recallBookingCount / recallCount` |
| 선물/리뷰 | 이번 주 일별 선물/리뷰 수 | `dailyBreakdown[].giftCount / reviewCount` |

**`DailyBreakdownItem` 타입 정의:**
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
`weeklySummary` useMemo에 `dailyBreakdown: DailyBreakdownItem[]` 필드 추가.

**주간 패널 렌더링:** 테이블 형태, 행당 `[요일] [날짜] [성공/전체]` + 성공률 비례 인라인 progress bar (녹색 fill, 회색 트랙, height 5px). 오늘 날짜 행은 파란색 텍스트로 강조, "진행중" 표시.

---

## UI 동작

- **아코디언**: 섹션 내에서 하나의 패널만 열림. 다른 카드 클릭 시 이전 패널 자동 닫힘
- **토글**: 이미 열린 카드를 다시 클릭하면 닫힘
- **시각적 피드백**: 활성 카드에 파란 테두리 + 배경 강조
- **애니메이션**: 패널이 슬라이드 다운으로 부드럽게 등장

---

## 구현 방식

`DashboardHome.tsx` 내에 섹션별 활성 패널 상태 3개 추가:

```typescript
const [todayActivePanel, setTodayActivePanel] = useState<'consult' | 'recall' | 'gift' | null>(null)
const [attendanceActivePanel, setAttendanceActivePanel] = useState<'checkin' | 'checkout' | 'absent' | 'late' | 'early' | 'overtime' | null>(null)
const [weeklyActivePanel, setWeeklyActivePanel] = useState<'consult' | 'recall' | 'gift' | null>(null)
```

토글 헬퍼:
```typescript
const togglePanel = <T>(current: T | null, next: T, setter: (v: T | null) => void) => {
  setter(current === next ? null : next)
}
```

---

## 데이터 처리

- **새 API 호출 없음**: 모든 데이터(`consultLogs`, `giftLogs`, `dailyReports`, `teamStatus.employees`)는 이미 로드됨
- **recall_booking_names**: 쉼표 구분 문자열 → 배열로 파싱 후 예약완료/미예약 분류
- **주간 일별 데이터**: `weeklySummary` 계산 로직을 확장하여 일별 배열(`dailyBreakdown`) 추가

---

## 빈 상태 (Empty State)

패널 확장 후 해당 데이터가 없을 때: `"데이터가 없습니다"` 문구를 중앙 정렬, muted 텍스트(`text-slate-400 text-sm`)로 표시. 조퇴 0명, 상담 0건 등 모든 패널 적용.

## 모바일 반응형

- 확장 패널은 `max-height: 300px; overflow-y: auto` 적용 (스크롤 가능)
- 팀 출퇴근 현황의 `hidden sm:block` 카드(지각·조퇴·초과)는 모바일에서도 클릭 가능하게 유지 (기존 숨김 처리 제거하지 않고, 패널은 항상 full-width로 표시)
- 패널 내 행 레이아웃은 단일 컬럼, 줄바꿈 없음

## 범위 밖

- 새로운 API 추가 없음
- 다른 페이지 변경 없음
- 기존 통계 계산 로직 변경 없음 (확장만)
