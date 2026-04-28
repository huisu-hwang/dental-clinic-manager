# TimePicker 컴포넌트 디자인 (디자인 시스템 통합)

- 작성일: 2026-04-28
- 작성자: 디자인 시스템 팀
- 상태: 승인 대기

## 1. 배경 및 목표

### 배경
프로젝트 내 7곳에서 브라우저 기본 `<input type="time">`을 그대로 사용하고 있어 다음과 같은 문제가 있다.

- **일관성 부재**: 브라우저별로 시각·인터랙션이 달라 디자인 시스템(`at-accent`, `at-border`, `rounded-lg` 등) 토큰과 어우러지지 않음
- **사용성 저하**: 시·분을 따로 스피너로 조작해야 하고, 자주 쓰는 시간(09:00, 09:30 등)을 한 번에 선택하기 어려움
- **모바일 경험 비균질**: iOS/Android 기본 피커가 화면별로 달라 학습 비용 발생

### 목표
- 디자인 시스템 토큰을 따르는 공통 `TimePicker` 컴포넌트를 추가한다.
- 자유 입력과 빠른 선택(그리드 칩)을 동시에 지원한다.
- 한국 사용자에게 친숙한 오전/오후 표기를 제공한다.
- 기존 7곳을 모두 새 컴포넌트로 교체하되 **기존 기능에 회귀가 없도록** 한다 (CLAUDE.md "기존 기능 보호 원칙" 준수).

### 비목표
- 시간 범위(start ~ end) 선택 같은 복합 인터랙션은 이번 범위에 포함하지 않는다 (각 사용처에서 두 개의 `TimePicker`를 배치).
- 초(seconds) 단위 입력은 지원하지 않는다.
- 라이브러리 의존성 추가는 하지 않는다 (Headless UI, Lucide React만 사용).

## 2. 사용자 시나리오

### 시나리오 A — 영업시간 설정 (병원 관리자)
관리자가 영업시간을 09:00~18:30으로 설정한다. 클릭 → 팝오버 → "오전" 탭에서 9:00 칩 클릭. 다시 종료 시간 클릭 → "오후" 탭(자동 활성) → 6:30 칩 클릭. 각 입력 후 자동으로 팝오버가 닫힌다.

### 시나리오 B — 마케팅 예약 (직원)
9월 7일 오전 9:15에 블로그 글을 예약 발행하고 싶다. 클릭 → 팝오버 → "오전" 탭 → 9:00, 9:30 칩만 보여 "9:15"가 없음 → input에 직접 `09:15` 타이핑 또는 `오전 9:15` 타이핑 → blur 시 정상 저장.

### 시나리오 C — 모바일에서 출퇴근 시간 편집 (관리자)
모바일 화면에서 직원의 출근 시간을 8:53로 수정한다. 칩 그리드는 폭이 좁아 가독성이 떨어지지 않도록 화면 폭에 맞게 자동 조정된다. 자유 입력으로 분 단위 조정 가능.

## 3. 컴포넌트 설계

### 3.1 위치와 의존성
- **파일 경로**: `src/components/ui/TimePicker.tsx`
- **의존성**:
  - `@headlessui/react` (`Popover`, `Transition`) — 이미 설치됨
  - `lucide-react` (`Clock`, `ChevronDown`) — 이미 설치됨
- 추가 npm 패키지 없음

### 3.2 Public API

```tsx
export interface TimePickerProps {
  // 핵심 (기존 input과 1:1 호환)
  value: string;                    // "HH:mm" 형식, 빈 값은 ""
  onChange: (value: string) => void;

  // 그리드 옵션
  step?: 15 | 30 | 60;              // 기본 30
  minHour?: number;                 // 기본 6 (06:00 시작)
  maxHour?: number;                 // 기본 22 (22:00 종료, exclusive 22:30 미포함)

  // 일반 input props
  disabled?: boolean;
  placeholder?: string;             // 기본 "시간 선택"
  className?: string;               // 외부 컨테이너 (예: 너비 제어)
  inputClassName?: string;          // input 자체 스타일 override
  id?: string;
  name?: string;
  'aria-label'?: string;
}

export function TimePicker(props: TimePickerProps): JSX.Element;
```

### 3.3 데이터 형식 규약
- 내부 데이터(`value`, `onChange` 인자)는 항상 24시간 `"HH:mm"` 형식. 예: `"09:30"`, `"14:00"`.
- 빈 값은 `""` (undefined/null이 아님).
- 사용자에게 보여지는 input 텍스트는 12시간 한국식: `"오전 9:30"`, `"오후 2:00"`.

### 3.4 핵심 동작

| 동작 | 설명 |
|---|---|
| 포커스 시 | 팝오버 자동 오픈, `ChevronDown` 회전 |
| 칩 클릭 시 | `onChange(HH:mm)` 호출 + 팝오버 자동 닫힘 + input blur |
| 자유 입력 | 모든 키스트로크는 내부 텍스트 state에만 반영. blur 시 파싱 시도 |
| blur 파싱 성공 | `onChange(HH:mm)` 호출, input 표시는 12시간식으로 정규화 |
| blur 파싱 실패 | `onChange` 미호출, input 표시는 직전 유효 `value`(있으면) 12시간식으로 복원, 없으면 빈 상태로 복원 |
| ESC 키 | 팝오버 닫기, 변경 사항 폐기 |
| Tab 키 | 팝오버 닫기, 자유 입력 blur 동작과 동일 |
| `disabled=true` | input/팝오버 모두 비활성화, 시각적으로 `bg-at-surface-alt text-at-text-weak` |
| `value=""` | input 빈 상태(placeholder 표시), 팝오버는 정상 그리드 표시 |

### 3.5 자유 입력 파싱 규칙
다음 형식을 모두 허용 (정규식 기반):
- `9:30`, `09:30` → `"09:30"`
- `14:00`, `14:0`, `14:00` → `"14:00"`
- `오전 9:30`, `오전9:30` → `"09:30"`
- `오후 2:30`, `오후2:30` → `"14:30"`
- `오전 12:30` → `"00:30"` (자정 직후)
- `오후 12:30` → `"12:30"` (정오 직후)

**거부**:
- 숫자 범위 초과 (`25:00`, `12:60` 등)
- 빈 콜론 (`:30`, `9:`)
- 한글 외 다른 텍스트 혼입

거부된 입력은 `onChange` 호출하지 않고 직전 유효 `value`로 input 표시 복원.

### 3.6 오전/오후 탭 동작

- **기본 활성 탭**:
  - `value`가 비어있지 않으면: `value`의 시(HH) 기준. 0~11 → 오전, 12~23 → 오후
  - `value`가 비어있으면: 사용자 현재 시각 기준 (`new Date().getHours()`)
- **칩 표시 규칙**:
  - 오전 탭: `[minHour, min(maxHour, 11)]` 범위에서 `step` 단위로 생성
    - 표시: `12:00`, `12:30`, `1:00`, ... (12시간 표기, 0시는 12시로)
  - 오후 탭: `[max(minHour, 12), maxHour]` 범위에서 `step` 단위로 생성
    - 표시: `12:00`, `12:30`, `1:00`, ... (12시간 표기)
- 만약 `minHour=6, maxHour=22, step=30`이면:
  - 오전 탭: `6:00, 6:30, 7:00, ..., 11:30` (12개)
  - 오후 탭: `12:00, 12:30, 1:00, ..., 10:00` (21개)

### 3.7 시각 디자인 (디자인 시스템 토큰)

#### Input 트리거
```tsx
<button className="
  flex items-center gap-2 w-full
  px-3 py-2 text-sm
  bg-white border border-at-border rounded-lg
  focus:ring-2 focus:ring-at-accent focus:border-at-accent
  text-at-text
  disabled:bg-at-surface-alt disabled:text-at-text-weak disabled:cursor-not-allowed
">
  <Clock className="w-4 h-4 text-at-text-weak" />
  <span className="flex-1 text-left">{displayText || placeholder}</span>
  <ChevronDown className={cn("w-4 h-4 text-at-text-weak transition-transform", open && "rotate-180")} />
</button>
```

`displayText`가 비어있을 때는 `text-at-text-weak`로 placeholder 색상 적용.

#### 팝오버 컨테이너
```tsx
<Popover.Panel className="
  absolute z-50 mt-2
  w-72 max-w-[calc(100vw-2rem)]
  bg-white border border-at-border rounded-xl shadow-lg
  p-3
">
```

#### 탭 (오전/오후)
```tsx
<div className="flex border-b border-at-border mb-3">
  <button className={cn(
    "flex-1 py-2 text-sm font-medium border-b-2 transition-colors",
    activeTab === 'am'
      ? "border-at-accent text-at-accent"
      : "border-transparent text-at-text-weak hover:text-at-text-secondary"
  )}>오전</button>
  <button className={...}>오후</button>
</div>
```

#### 칩 그리드
```tsx
<div className="grid grid-cols-4 gap-1 max-h-60 overflow-y-auto">
  {chips.map(chip => (
    <button className={cn(
      "py-1.5 text-sm rounded-md transition-colors",
      isSelected
        ? "bg-at-accent text-white"
        : "text-at-text hover:bg-at-surface-alt"
    )}>
      {chip.label}
    </button>
  ))}
</div>
```

### 3.8 접근성

- input 트리거는 `role="combobox"`, `aria-expanded`, `aria-haspopup="dialog"`
- 팝오버는 `role="dialog"`, `aria-label="시간 선택"`
- 탭 버튼은 `role="tab"`, `aria-selected`
- 칩 버튼은 `role="option"`, `aria-selected={isSelected}`
- 키보드 네비게이션: Tab, Shift+Tab, ESC, Enter (Headless UI Popover가 기본 처리)
- `aria-label` prop이 제공되면 input에 적용

### 3.9 모바일 대응

- 팝오버 너비: `w-72 max-w-[calc(100vw-2rem)]` — 좁은 화면에선 화면 폭 - 2rem
- 칩 터치 영역: `py-1.5` (약 32px 높이) — 최소 터치 타겟 44px에는 못 미치지만 4열 그리드에선 필요. 향후 사용성 피드백 보고 조정 가능.
- input 폰트 16px (이미 `globals.css`에서 처리됨, iOS Safari 자동 줌 방지)

## 4. 마이그레이션 계획 (7곳 일괄 교체)

### 4.1 사용처별 props 매핑

| # | 파일 | 사용처 | step | minHour | maxHour |
|---|---|---|---|---|---|
| 1 | `src/components/Management/ClinicHoursSettings.tsx` | 영업·휴식 시작/종료 (4~6 input) | 30 | 6 | 22 |
| 2 | `src/components/Attendance/ScheduleManagement.tsx` | 근무 스케줄 시작/종료 | 30 | 6 | 22 |
| 3 | `src/components/Attendance/AdminAttendanceStats.tsx` | 출퇴근 통계 수동 편집 | 15 | 6 | 22 |
| 4 | `src/app/dashboard/marketing/posts/new/page.tsx` (L908) | 마케팅 예약 시간 | 15 | 0 | 23 |
| 5 | `src/components/marketing/ScheduleModal.tsx` | 마케팅 스케줄 모달 | 15 | 0 | 23 |
| 6 | `src/components/Contract/ContractForm.tsx` | 계약서 시간 | 30 | 6 | 22 |
| 7 | `src/app/globals.css` (L33) | 모바일 폰트 스타일 | — | — | — |

### 4.2 교체 원칙
- `value` / `onChange` 시그니처가 동일(`string` `"HH:mm"`) → 부모 컴포넌트 로직 변경 0
- 기존 `className`은 그대로 prop 전달 (예: `w-[130px]`, `w-full`)
- HTML 속성 `step="1800"` → props `step={30}` 매핑 (1800초 = 30분)
- `globals.css` L33의 `input[type="time"]` 셀렉터는 **그대로 둔다**. TimePicker 자체는 `<button>` 트리거를 사용하므로 영향 없음. 다른 곳에서 `<input type="time">`이 다시 도입될 가능성에 대비해 보존.

### 4.3 단계별 교체 순서 (PR 1개에 모두 포함, 커밋은 분리)
1. `TimePicker.tsx` 컴포넌트 추가 + 단위 테스트 (있다면)
2. ClinicHoursSettings.tsx 교체
3. ScheduleManagement.tsx 교체
4. AdminAttendanceStats.tsx 교체
5. ContractForm.tsx 교체
6. 마케팅 예약 (posts/new/page.tsx) 교체
7. ScheduleModal.tsx 교체
8. 빌드 검증 + 수동 회귀 테스트 + 푸시

각 단계마다 `npm run build`로 타입 에러 즉시 확인.

## 5. 검증 계획

### 5.1 빌드 검증
- `npm run build` → 타입 에러 0, 빌드 성공

### 5.2 수동 회귀 테스트 (Chrome DevTools MCP)
테스트 계정: `whitedc0902@gmail.com`

- [ ] **영업시간 설정** (`/admin` → 병원 관리)
  - 시작 시간 09:00, 종료 시간 18:30 변경 후 저장 → 새로고침 → 값 유지 확인
  - 휴식 시간 추가/삭제 → 정상 동작 확인
- [ ] **근무 스케줄** (`/admin` → 근무관리)
  - 출근 09:00, 퇴근 18:00 변경 → DB 저장 확인
- [ ] **출퇴근 통계 편집**
  - 분 단위(09:53) 자유 입력 → 저장 확인
- [ ] **마케팅 예약** (`/dashboard/marketing/posts/new`)
  - 날짜 + 시간 09:15 (분 단위) → 예약 등록 → 목록에서 확인
- [ ] **마케팅 스케줄 모달**
  - 모달 내 시간 변경 → 저장 동작 확인
- [ ] **계약서 폼**
  - 시간 필드 입력 → 저장 확인
- [ ] **자유 입력 회귀**
  - `오후 2:30`, `14:30`, `2:30 PM`(거부) 입력 후 blur 동작 확인
- [ ] **키보드 동작**
  - Tab으로 포커스 이동, ESC로 팝오버 닫힘
- [ ] **모바일 뷰포트**
  - 375px 폭에서 팝오버 잘림 없음, 칩 클릭 가능

### 5.3 회귀 모니터링
- 콘솔 에러 0
- 네트워크 에러 0 (저장 실패 없음)

### 5.4 롤백 전략
- 회귀 발견 시 해당 사용처만 기존 `<input type="time">`으로 즉시 되돌리기
- TimePicker 컴포넌트 자체는 유지 (다른 사용처는 정상 동작 가능)

## 6. 미해결 이슈 / 향후 작업

- **시간 범위 선택**: 현재 두 개의 `TimePicker`를 나란히 배치. 향후 `TimeRangePicker` 컴포넌트 신설 검토.
- **초(seconds) 단위**: 현재 미지원. 출퇴근 정밀 기록이 필요하면 별도 prop 추가 고려.
- **국제화**: "오전/오후" 라벨이 하드코딩. 다국어 지원 필요 시 i18n 키로 추출.
- **자주 쓰는 시간 즐겨찾기**: 사용자별로 자주 쓰는 시간을 상단에 노출하는 기능은 차후 개선.

## 7. 변경 이력
- 2026-04-28: 최초 작성, 사용자 검토 대기
