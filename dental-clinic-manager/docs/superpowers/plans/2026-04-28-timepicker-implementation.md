# TimePicker 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 디자인 시스템에 맞는 공통 `TimePicker` 컴포넌트를 추가하고, 7곳의 `<input type="time">`을 일괄 교체한다.

**Architecture:** Headless UI Popover 기반의 단일 컴포넌트. Input 트리거 + 오전/오후 탭 + 12시간식 칩 그리드 + 자유 입력 파싱. 외부 API는 `value: string` (`"HH:mm"`) / `onChange: (value: string) => void`로 기존 input과 1:1 호환되어 부모 컴포넌트 수정 없이 교체 가능.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, `@headlessui/react` Popover, `lucide-react` 아이콘, `cn` 헬퍼(`@/lib/utils`).

**Spec 참조:** `docs/superpowers/specs/2026-04-28-timepicker-design.md`

**테스트 인프라 메모:** 본 프로젝트엔 jest/vitest가 설정되어 있지 않다. TDD 대신 각 단계 후 `npm run build`로 타입/빌드 검증, 마지막에 Chrome DevTools MCP + 테스트 계정으로 수동 회귀 테스트로 검증한다.

---

## Task 1: 시간 변환 유틸 함수 작성

**Files:**
- Create: `src/components/ui/timePickerUtils.ts`

순수 함수 모듈로 분리. 컴포넌트의 렌더링 로직과 데이터 변환 로직을 격리하여 추후 추가 변경이 쉽도록 한다.

- [ ] **Step 1: 파일 생성 및 유틸 함수 작성**

```typescript
// src/components/ui/timePickerUtils.ts

/**
 * "HH:mm" 24시간 → 한국식 12시간 표시 ("오전 9:30").
 * 빈 문자열이면 빈 문자열 반환.
 */
export function formatTo12Hour(value: string): string {
  if (!value) return ''
  const match = value.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return ''
  const hour = parseInt(match[1], 10)
  const minute = match[2]
  if (hour < 0 || hour > 23 || parseInt(minute, 10) < 0 || parseInt(minute, 10) > 59) return ''
  const period = hour < 12 ? '오전' : '오후'
  let displayHour = hour % 12
  if (displayHour === 0) displayHour = 12
  return `${period} ${displayHour}:${minute}`
}

/**
 * 자유 입력 → "HH:mm" 24시간 정규화. 실패 시 null 반환.
 * 허용: "9:30", "09:30", "14:00", "오전 9:30", "오후 2:30", "오전9:30"
 */
export function parseTimeInput(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // 24시간 형식: 9:30, 09:30, 14:00
  const time24 = trimmed.match(/^(\d{1,2}):(\d{1,2})$/)
  if (time24) {
    const h = parseInt(time24[1], 10)
    const m = parseInt(time24[2], 10)
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    }
    return null
  }

  // 한국식 12시간: "오전 9:30", "오후 2:30", "오전9:30"
  const time12 = trimmed.match(/^(오전|오후)\s*(\d{1,2}):(\d{1,2})$/)
  if (time12) {
    const period = time12[1]
    let h = parseInt(time12[2], 10)
    const m = parseInt(time12[3], 10)
    if (h < 1 || h > 12 || m < 0 || m > 59) return null
    if (period === '오전') {
      if (h === 12) h = 0
    } else {
      if (h !== 12) h += 12
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  return null
}

export interface TimeChip {
  value: string  // "HH:mm" 24시간
  label: string  // "9:30" 12시간 표시 (탭 안에서는 오전/오후 자명하므로 period 생략)
}

/**
 * 탭 ('am' | 'pm')에 해당하는 시간 칩 배열 생성.
 */
export function generateChips(
  tab: 'am' | 'pm',
  step: 15 | 30 | 60,
  minHour: number,
  maxHour: number
): TimeChip[] {
  const startHour = tab === 'am' ? Math.max(0, minHour) : Math.max(12, minHour)
  const endHour = tab === 'am' ? Math.min(11, maxHour) : Math.min(23, maxHour)
  if (startHour > endHour) return []

  const chips: TimeChip[] = []
  for (let h = startHour; h <= endHour; h++) {
    for (let m = 0; m < 60; m += step) {
      const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      let displayHour = h % 12
      if (displayHour === 0) displayHour = 12
      const label = `${displayHour}:${String(m).padStart(2, '0')}`
      chips.push({ value, label })
    }
  }
  return chips
}

/**
 * value가 비어있지 않으면 그 시(hour) 기준으로 'am'/'pm' 결정.
 * 비어있으면 현재 시각 기준.
 */
export function getDefaultTab(value: string): 'am' | 'pm' {
  if (value) {
    const match = value.match(/^(\d{1,2}):/)
    if (match) {
      const h = parseInt(match[1], 10)
      if (h >= 0 && h <= 11) return 'am'
      if (h >= 12 && h <= 23) return 'pm'
    }
  }
  const nowHour = new Date().getHours()
  return nowHour < 12 ? 'am' : 'pm'
}
```

- [ ] **Step 2: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공, 타입 에러 0

- [ ] **Step 3: 커밋**

```bash
cd dental-clinic-manager
git add src/components/ui/timePickerUtils.ts
git commit -m "$(cat <<'EOF'
feat(ui): TimePicker 유틸 함수 추가 (formatTo12Hour, parseTimeInput, generateChips)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: TimePicker 컴포넌트 - 골격 + Input 트리거

**Files:**
- Create: `src/components/ui/TimePicker.tsx`

이 단계에서는 Input 트리거(클릭 가능한 button)만 만들고, 팝오버 내용은 placeholder div로 둔다. 다음 태스크에서 팝오버를 채운다.

- [ ] **Step 1: TimePicker.tsx 생성**

```tsx
// src/components/ui/TimePicker.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { Popover, PopoverButton, PopoverPanel, Transition } from '@headlessui/react'
import { Clock, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  formatTo12Hour,
  parseTimeInput,
  generateChips,
  getDefaultTab,
} from './timePickerUtils'

export interface TimePickerProps {
  value: string
  onChange: (value: string) => void
  step?: 15 | 30 | 60
  minHour?: number
  maxHour?: number
  disabled?: boolean
  placeholder?: string
  className?: string
  inputClassName?: string
  id?: string
  name?: string
  'aria-label'?: string
}

export function TimePicker({
  value,
  onChange,
  step = 30,
  minHour = 6,
  maxHour = 22,
  disabled = false,
  placeholder = '시간 선택',
  className,
  inputClassName,
  id,
  name,
  'aria-label': ariaLabel,
}: TimePickerProps) {
  const displayText = formatTo12Hour(value)

  return (
    <Popover className={cn('relative', className)}>
      <PopoverButton
        id={id}
        name={name}
        aria-label={ariaLabel}
        disabled={disabled}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 text-sm',
          'bg-white border border-at-border rounded-lg',
          'focus:outline-none focus:ring-2 focus:ring-at-accent focus:border-at-accent',
          'text-at-text',
          'disabled:bg-at-surface-alt disabled:text-at-text-weak disabled:cursor-not-allowed',
          'transition-colors',
          inputClassName
        )}
      >
        {({ open }) => (
          <>
            <Clock className="w-4 h-4 text-at-text-weak shrink-0" />
            <span
              className={cn(
                'flex-1 text-left truncate',
                !displayText && 'text-at-text-weak'
              )}
            >
              {displayText || placeholder}
            </span>
            <ChevronDown
              className={cn(
                'w-4 h-4 text-at-text-weak shrink-0 transition-transform',
                open && 'rotate-180'
              )}
            />
          </>
        )}
      </PopoverButton>

      <Transition
        enter="transition ease-out duration-100"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-75"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <PopoverPanel
          anchor={{ to: 'bottom start', gap: 8 }}
          className={cn(
            'z-50 w-72 max-w-[calc(100vw-2rem)]',
            'bg-white border border-at-border rounded-xl shadow-lg',
            'p-3'
          )}
        >
          <div className="text-xs text-at-text-weak">팝오버 내용 (다음 태스크에서 작성)</div>
        </PopoverPanel>
      </Transition>
    </Popover>
  )
}
```

> **참고:** Headless UI v2의 `Popover.Panel`은 `anchor` prop으로 자동 위치 계산을 지원한다. `as` 등 더 자세한 옵션은 [Headless UI 공식 문서](https://headlessui.com/react/popover) 참고.

- [ ] **Step 2: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
cd dental-clinic-manager
git add src/components/ui/TimePicker.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TimePicker 컴포넌트 골격 + Input 트리거 추가

- 디자인 시스템 토큰(at-accent, at-border, rounded-lg) 적용
- Headless UI Popover 기반, lucide Clock/ChevronDown 아이콘
- 팝오버 내용은 다음 태스크에서 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: TimePicker 팝오버 - 오전/오후 탭 + 칩 그리드

**Files:**
- Modify: `src/components/ui/TimePicker.tsx`

placeholder 자리를 실제 탭과 그리드로 교체한다. 칩 클릭 시 `onChange` + 팝오버 닫힘 처리.

- [ ] **Step 1: TimePicker 본문 교체**

기존 `<div className="text-xs ...">팝오버 내용 (다음 태스크에서 작성)</div>` 영역을 다음 코드로 교체. 컴포넌트 본문 안에 `useState`와 `useEffect`로 활성 탭 관리.

```tsx
// import 부분에 useState, useEffect, useRef는 이미 추가되어 있어야 함

// TimePicker 함수 본문 시작 직후, displayText 위에 추가:
const [activeTab, setActiveTab] = useState<'am' | 'pm'>(() => getDefaultTab(value))

// value가 변경될 때 탭 자동 동기화 (예: 외부에서 value를 바꾼 경우)
useEffect(() => {
  if (value) {
    setActiveTab(getDefaultTab(value))
  }
}, [value])

const chips = generateChips(activeTab, step, minHour, maxHour)
```

`PopoverPanel` 안의 placeholder를 다음으로 교체:

```tsx
<PopoverPanel
  anchor={{ to: 'bottom start', gap: 8 }}
  className={cn(
    'z-50 w-72 max-w-[calc(100vw-2rem)]',
    'bg-white border border-at-border rounded-xl shadow-lg',
    'p-3'
  )}
>
  {({ close }) => (
    <>
      {/* 오전/오후 탭 */}
      <div className="flex border-b border-at-border mb-3" role="tablist" aria-label="오전 또는 오후 선택">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'am'}
          onClick={() => setActiveTab('am')}
          className={cn(
            'flex-1 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'am'
              ? 'border-at-accent text-at-accent'
              : 'border-transparent text-at-text-weak hover:text-at-text-secondary'
          )}
        >
          오전
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'pm'}
          onClick={() => setActiveTab('pm')}
          className={cn(
            'flex-1 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            activeTab === 'pm'
              ? 'border-at-accent text-at-accent'
              : 'border-transparent text-at-text-weak hover:text-at-text-secondary'
          )}
        >
          오후
        </button>
      </div>

      {/* 칩 그리드 */}
      {chips.length === 0 ? (
        <div className="py-6 text-center text-sm text-at-text-weak">
          선택 가능한 시간이 없습니다
        </div>
      ) : (
        <div
          className="grid grid-cols-4 gap-1 max-h-60 overflow-y-auto"
          role="listbox"
          aria-label="시간 목록"
        >
          {chips.map((chip) => {
            const isSelected = chip.value === value
            return (
              <button
                key={chip.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(chip.value)
                  close()
                }}
                className={cn(
                  'py-1.5 text-sm rounded-md transition-colors',
                  isSelected
                    ? 'bg-at-accent text-white'
                    : 'text-at-text hover:bg-at-surface-alt'
                )}
              >
                {chip.label}
              </button>
            )
          })}
        </div>
      )}
    </>
  )}
</PopoverPanel>
```

- [ ] **Step 2: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 3: 브라우저 수동 확인 (선택)**

dev 서버를 실행 중이라면, TimePicker가 실제로 어디든 잠시 import해서 그리드가 표시되는지 확인. (선택사항 — 다음 태스크 5곳 이후 통합 검증 시 어차피 확인됨)

- [ ] **Step 4: 커밋**

```bash
cd dental-clinic-manager
git add src/components/ui/TimePicker.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TimePicker 팝오버 - 오전/오후 탭 + 칩 그리드 구현

- 활성 탭은 value 기준 자동 결정 (없으면 현재 시각)
- 칩 클릭 시 onChange + 팝오버 자동 닫힘
- ARIA 속성 추가 (role=tablist/tab/listbox/option)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: TimePicker - 자유 입력 지원 (편집 모드)

**Files:**
- Modify: `src/components/ui/TimePicker.tsx`

현재는 `PopoverButton`이 button이라 타이핑이 불가능. 자유 입력을 지원하려면 input element로 전환 필요. Headless UI Popover 안에서도 input을 쓸 수 있도록 구조를 조정한다.

전략: `PopoverButton`을 `as="div"`로 감싸고, 그 안에 실제 `<input>`을 둔다. input의 focus/blur로 팝오버를 직접 제어하기보단, input은 자유 입력만 담당하고 클릭 시 팝오버가 열리도록 한다. 사용자는 (1) 칩으로 빠르게 선택하거나 (2) input에 직접 타이핑한 후 blur 시 파싱된다.

- [ ] **Step 1: TimePicker 본문에 자유 입력 처리 추가**

`useState` 부분에 input 텍스트 state 추가:

```tsx
const [inputText, setInputText] = useState<string>(() => formatTo12Hour(value))
const inputRef = useRef<HTMLInputElement>(null)

// 외부 value 변경 시 input 텍스트 동기화 (단, 사용자가 입력 중이 아닐 때만)
useEffect(() => {
  if (document.activeElement !== inputRef.current) {
    setInputText(formatTo12Hour(value))
  }
}, [value])

const handleInputBlur = () => {
  const parsed = parseTimeInput(inputText)
  if (parsed !== null && parsed !== value) {
    onChange(parsed)
    setInputText(formatTo12Hour(parsed))
  } else if (parsed === null) {
    // 파싱 실패: 직전 유효 value로 복원
    setInputText(formatTo12Hour(value))
  }
}
```

- [ ] **Step 2: PopoverButton 교체**

기존 `PopoverButton` 부분을 다음으로 교체:

```tsx
<PopoverButton
  as="div"
  className={cn(
    'flex items-center gap-2 w-full px-3 py-2 text-sm',
    'bg-white border border-at-border rounded-lg',
    'focus-within:ring-2 focus-within:ring-at-accent focus-within:border-at-accent',
    'text-at-text',
    disabled && 'bg-at-surface-alt text-at-text-weak cursor-not-allowed',
    'transition-colors',
    inputClassName
  )}
>
  {({ open }) => (
    <>
      <Clock className="w-4 h-4 text-at-text-weak shrink-0" />
      <input
        ref={inputRef}
        id={id}
        name={name}
        aria-label={ariaLabel}
        disabled={disabled}
        type="text"
        value={inputText}
        placeholder={placeholder}
        onChange={(e) => setInputText(e.target.value)}
        onBlur={handleInputBlur}
        className={cn(
          'flex-1 bg-transparent border-0 outline-none p-0 text-sm',
          'placeholder:text-at-text-weak',
          'disabled:cursor-not-allowed'
        )}
      />
      <ChevronDown
        className={cn(
          'w-4 h-4 text-at-text-weak shrink-0 transition-transform',
          open && 'rotate-180'
        )}
      />
    </>
  )}
</PopoverButton>
```

> **주의:** Headless UI v2 Popover에서 `as="div"`로 감싸면 div 클릭 시 패널이 토글된다. input 클릭은 div 클릭으로 버블링되어 패널이 열린다. input에 타이핑은 자연스럽게 이루어진다.

- [ ] **Step 3: 칩 클릭 시 inputText 동기화**

기존 `onChange(chip.value); close();` 부분을 다음으로 변경:

```tsx
onClick={() => {
  onChange(chip.value)
  setInputText(formatTo12Hour(chip.value))
  close()
}}
```

- [ ] **Step 4: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공, 타입 에러 0

- [ ] **Step 5: 커밋**

```bash
cd dental-clinic-manager
git add src/components/ui/TimePicker.tsx
git commit -m "$(cat <<'EOF'
feat(ui): TimePicker 자유 입력 지원 (편집 + blur 파싱)

- text input으로 직접 입력 ("14:30" 또는 "오후 2:30")
- blur 시 parseTimeInput으로 파싱, 실패 시 직전 유효 value로 복원
- 칩 클릭 시 inputText 동기화

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: 사용처 교체 - ClinicHoursSettings (병원 영업시간)

**Files:**
- Modify: `src/components/Management/ClinicHoursSettings.tsx`

영업 시작/종료 + 휴식 시작/종료 input을 모두 TimePicker로 교체. props: `step={30}`, `minHour={6}`, `maxHour={22}`.

- [ ] **Step 1: import 추가**

파일 상단의 import 부분에 추가:

```tsx
import { TimePicker } from '@/components/ui/TimePicker'
```

- [ ] **Step 2: 영업시간 input 교체 (라인 ~360, ~368)**

기존:
```tsx
<input
  type="time"
  value={day.open_time}
  onChange={(e) => handleDayChange(day.day_of_week, 'open_time', e.target.value)}
  step="1800"
  className="px-2 py-1.5 border border-at-border rounded-lg text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent w-[130px]"
/>
```

교체:
```tsx
<TimePicker
  value={day.open_time}
  onChange={(v) => handleDayChange(day.day_of_week, 'open_time', v)}
  step={30}
  minHour={6}
  maxHour={22}
  className="w-[140px]"
  aria-label="영업 시작 시간"
/>
```

종료 시간(`close_time`)도 동일 패턴으로 교체. `aria-label="영업 종료 시간"`.

- [ ] **Step 3: 단일 휴식시간 input 교체 (라인 ~391, ~399)**

기존 휴식 시작/종료 input 두 개를 TimePicker로 교체. props 동일(`step={30}`, `minHour={6}`, `maxHour={22}`). `aria-label`은 각각 "휴식 시작 시간" / "휴식 종료 시간".

- [ ] **Step 4: 다중 휴식시간 input 교체 (라인 ~433, ~441)**

`day.breaks.length > 1`인 경우의 휴식 시작/종료 input도 동일하게 교체. `aria-label`은 동일.

- [ ] **Step 5: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 6: 커밋**

```bash
cd dental-clinic-manager
git add src/components/Management/ClinicHoursSettings.tsx
git commit -m "$(cat <<'EOF'
refactor(clinic-hours): 영업/휴식 시간 input을 TimePicker로 교체

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 사용처 교체 - ScheduleManagement (근무 스케줄)

**Files:**
- Modify: `src/components/Attendance/ScheduleManagement.tsx`

근무 시작/종료 input 교체. props: `step={30}`, `minHour={6}`, `maxHour={22}`.

- [ ] **Step 1: import 추가**

```tsx
import { TimePicker } from '@/components/ui/TimePicker'
```

- [ ] **Step 2: 시작 시간 input 교체 (라인 ~363)**

기존:
```tsx
<input
  type="time"
  value={startTime}
  onChange={(e) => setStartTime(e.target.value)}
  disabled={!isWorking}
  className="px-2 py-1 border border-at-border rounded focus:ring-2 focus:ring-at-accent disabled:bg-at-surface-alt"
/>
```

교체:
```tsx
<TimePicker
  value={startTime}
  onChange={setStartTime}
  disabled={!isWorking}
  step={30}
  minHour={6}
  maxHour={22}
  className="w-[140px]"
  aria-label="근무 시작 시간"
/>
```

- [ ] **Step 3: 종료 시간 input 교체 (라인 ~378)**

`endTime` / `setEndTime`로 동일 패턴 적용. `aria-label="근무 종료 시간"`.

- [ ] **Step 4: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
cd dental-clinic-manager
git add src/components/Attendance/ScheduleManagement.tsx
git commit -m "refactor(schedule): 근무 스케줄 시간 input을 TimePicker로 교체

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 사용처 교체 - AdminAttendanceStats (출퇴근 편집)

**Files:**
- Modify: `src/components/Attendance/AdminAttendanceStats.tsx`

출근/퇴근 시간 input 교체. props: `step={15}` (분 단위 정밀 편집), `minHour={6}`, `maxHour={22}`.

- [ ] **Step 1: import 추가**

```tsx
import { TimePicker } from '@/components/ui/TimePicker'
```

- [ ] **Step 2: 출근 시간 input 교체 (라인 ~1011)**

기존:
```tsx
<input
  type="time"
  value={editFormData.check_in_time}
  onChange={(e) =>
    setEditFormData((prev) => ({
      ...prev,
      check_in_time: e.target.value,
    }))
  }
  ... 기존 className 그대로 사용 ...
/>
```

교체:
```tsx
<TimePicker
  value={editFormData.check_in_time}
  onChange={(v) =>
    setEditFormData((prev) => ({
      ...prev,
      check_in_time: v,
    }))
  }
  step={15}
  minHour={6}
  maxHour={22}
  className="w-full"
  aria-label="출근 시간"
/>
```

> 기존 input의 `className`(예: `w-full px-3 py-2 ...`)은 TimePicker `className`은 컨테이너에 적용되므로 `w-full`만 유지. 내부 스타일은 TimePicker가 디자인 시스템 토큰으로 처리.

- [ ] **Step 3: 퇴근 시간 input 교체 (라인 ~1029)**

`check_out_time`로 동일 패턴. `aria-label="퇴근 시간"`.

- [ ] **Step 4: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
cd dental-clinic-manager
git add src/components/Attendance/AdminAttendanceStats.tsx
git commit -m "refactor(attendance): 출퇴근 편집 시간 input을 TimePicker로 교체

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 사용처 교체 - ContractForm (계약서 시간)

**Files:**
- Modify: `src/components/Contract/ContractForm.tsx`

요일별 근무 시작/종료/휴게 시작/휴게 종료 input 4종을 TimePicker로 교체. props: `step={30}`, `minHour={6}`, `maxHour={22}`.

- [ ] **Step 1: import 추가**

```tsx
import { TimePicker } from '@/components/ui/TimePicker'
```

- [ ] **Step 2: 시작 시간 input 교체 (라인 ~630)**

기존:
```tsx
<input
  type="time"
  value={daySchedule?.start || ''}
  onChange={(e) => handleDayTimeChange(key, 'start', e.target.value)}
  className="w-full px-2 py-1 text-sm border border-at-border rounded focus:ring-2 focus:ring-at-accent"
/>
```

교체:
```tsx
<TimePicker
  value={daySchedule?.start || ''}
  onChange={(v) => handleDayTimeChange(key, 'start', v)}
  step={30}
  minHour={6}
  maxHour={22}
  className="w-full"
  aria-label="시작 시간"
/>
```

- [ ] **Step 3: 종료/휴게 시작/휴게 종료 input 교체 (라인 ~640, ~649, ~658)**

각각 `daySchedule?.end`, `daySchedule?.breakStart`, `daySchedule?.breakEnd`로 동일 패턴 적용. `handleDayTimeChange`의 두 번째 인자도 `'end'`, `'breakStart'`, `'breakEnd'`로 변경. `aria-label`은 각각 `종료 시간`, `휴게 시작 시간`, `휴게 종료 시간`.

- [ ] **Step 4: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
cd dental-clinic-manager
git add src/components/Contract/ContractForm.tsx
git commit -m "refactor(contract): 계약서 근무/휴게 시간 input을 TimePicker로 교체

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: 사용처 교체 - 마케팅 예약 (posts/new)

**Files:**
- Modify: `src/app/dashboard/marketing/posts/new/page.tsx`

마케팅 예약 시간 input 교체. props: `step={15}` (분 단위 자유 예약), `minHour={0}`, `maxHour={23}`.

- [ ] **Step 1: import 추가**

```tsx
import { TimePicker } from '@/components/ui/TimePicker'
```

- [ ] **Step 2: 시간 input 교체 (라인 ~907)**

기존:
```tsx
<input
  type="time"
  value={scheduleTime}
  onChange={(e) => setScheduleTime(e.target.value)}
  className="w-full px-3 py-2 text-sm border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white"
/>
```

교체:
```tsx
<TimePicker
  value={scheduleTime}
  onChange={setScheduleTime}
  step={15}
  minHour={0}
  maxHour={23}
  className="w-full"
  aria-label="예약 시간"
/>
```

- [ ] **Step 3: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 4: 커밋**

```bash
cd dental-clinic-manager
git add src/app/dashboard/marketing/posts/new/page.tsx
git commit -m "refactor(marketing): 예약 등록 시간 input을 TimePicker로 교체

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: 사용처 교체 - 마케팅 ScheduleModal

**Files:**
- Modify: `src/components/marketing/ScheduleModal.tsx`

마케팅 스케줄 모달 내 시간 input 교체. props: `step={15}`, `minHour={0}`, `maxHour={23}`.

- [ ] **Step 1: import 추가**

```tsx
import { TimePicker } from '@/components/ui/TimePicker'
```

- [ ] **Step 2: 시간 input 교체 (라인 ~78)**

기존:
```tsx
<input
  type="time"
  value={scheduleTime}
  onChange={(e) => setScheduleTime(e.target.value)}
  className="w-full px-3 py-2.5 text-sm border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white"
/>
```

교체:
```tsx
<TimePicker
  value={scheduleTime}
  onChange={setScheduleTime}
  step={15}
  minHour={0}
  maxHour={23}
  className="w-full"
  aria-label="예약 시간"
/>
```

- [ ] **Step 3: 빌드 검증**

Run: `cd dental-clinic-manager && npm run build`
Expected: 빌드 성공

- [ ] **Step 4: 커밋**

```bash
cd dental-clinic-manager
git add src/components/marketing/ScheduleModal.tsx
git commit -m "refactor(marketing): 스케줄 모달 시간 input을 TimePicker로 교체

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: 통합 빌드 검증 + 수동 회귀 테스트 + 배포

이 태스크는 코드 변경이 거의 없고, 기존 변경사항 전체를 검증하고 push한다.

- [ ] **Step 1: 전체 빌드 + ESLint**

Run:
```bash
cd dental-clinic-manager
npm run build
npm run lint
```
Expected: 빌드 성공, lint 에러 0

- [ ] **Step 2: dev 서버 실행**

Run: `cd dental-clinic-manager && npm run dev` (백그라운드)
Expected: `http://localhost:3000` 정상 응답

- [ ] **Step 3: Chrome DevTools MCP로 테스트 계정 로그인**

테스트 계정: `whitedc0902@gmail.com` / `ghkdgmltn81!`

`mcp__chrome-devtools__navigate_page`로 `http://localhost:3000` 접속 → 로그인 → 콘솔 에러 0 확인.

- [ ] **Step 4: 회귀 테스트 — 영업시간 설정**

1. 관리자 메뉴 → 병원 관리 → 영업시간 진입
2. 시작 시간 클릭 → 팝오버 열림 → "오전" 탭 → "9:00" 칩 클릭 → 팝오버 닫힘
3. input에 "오후 7:00" 직접 타이핑 → blur → "오후 7:00" 정상 표시
4. 저장 → 새로고침 → 값 유지 확인
5. 휴식 시간 추가/삭제 → 정상 동작 확인
6. 콘솔 에러/네트워크 에러 0

- [ ] **Step 5: 회귀 테스트 — 근무 스케줄**

1. 관리자 → 근무 관리 → 직원 스케줄 편집
2. 시작/종료 시간 변경 → 저장 → DB 반영 확인 (새로고침 후 유지)

- [ ] **Step 6: 회귀 테스트 — 출퇴근 통계 편집**

1. 관리자 → 출퇴근 통계 → 특정 레코드 편집
2. `09:53` 같은 분 단위 자유 입력 → blur → "오전 9:53" 표시 → 저장

- [ ] **Step 7: 회귀 테스트 — 마케팅 예약**

1. 마케팅 → 새 글 작성 → 예약 발행 옵션
2. 시간 09:15 자유 입력 → 예약 등록 → 목록에서 시간 확인

- [ ] **Step 8: 회귀 테스트 — 마케팅 스케줄 모달**

1. 마케팅 → 캘린더에서 일정 편집
2. 시간 변경 → 저장 동작 확인

- [ ] **Step 9: 회귀 테스트 — 계약서 폼**

1. 관리자 → 계약서 → 요일별 근무 시간 입력
2. 4개 시간(시작/종료/휴게 시작/휴게 종료) 모두 정상 동작 확인

- [ ] **Step 10: 키보드 / 모바일 회귀**

1. Tab 키로 TimePicker 포커스 → ESC로 팝오버 닫힘 확인
2. Chrome DevTools 디바이스 모드 → 375px iPhone SE → 영업시간 페이지에서 팝오버 잘림 없음, 칩 클릭 가능 확인

- [ ] **Step 11: 발견한 회귀 즉시 수정**

회귀 발견 시:
- 컴포넌트 자체 문제면 `TimePicker.tsx` 수정 (커밋: `fix(ui): TimePicker ...`)
- 사용처 props 문제면 해당 파일 수정 (커밋: `fix(<영역>): ...`)
- CLAUDE.md 원칙: "오류 발생 시 멈추지 말고 해결한 뒤 작업 지속"

- [ ] **Step 12: 모든 테스트 통과 후 push**

Run:
```bash
git push origin develop
```
Expected: push 성공. 실패 시 `git pull --rebase origin develop` 후 충돌 해결 → 다시 push.

---

## Self-Review 노트

**Spec 커버리지 확인** (작성자 자체 점검):
- ✅ 컴포넌트 위치 (`src/components/ui/TimePicker.tsx`) → Task 2
- ✅ Public API 전체 → Task 2 (props), Task 4 (자유 입력)
- ✅ 24시간 내부 데이터 + 12시간 표시 → Task 1 (`formatTo12Hour`, `parseTimeInput`)
- ✅ 자유 입력 + 파싱 + blur 처리 → Task 4
- ✅ 오전/오후 탭 + 자동 활성 → Task 3 (`getDefaultTab`)
- ✅ 칩 그리드 (4열, max-h-60) → Task 3
- ✅ 시각 디자인 토큰 → Task 2/3 (at-accent, at-border 등)
- ✅ 접근성 ARIA → Task 3
- ✅ 모바일 대응 (`max-w-[calc(100vw-2rem)]`) → Task 2
- ✅ 7곳 마이그레이션 매핑 → Task 5~10 (globals.css는 spec 4.2 참고대로 그대로 둠)
- ✅ 빌드 + 수동 회귀 테스트 → Task 11
- ✅ 롤백 전략 → 각 사용처가 별도 커밋이라 `git revert <hash>`로 즉시 롤백 가능

**Type/이름 일관성**:
- `TimePickerProps`, `TimeChip` 인터페이스 이름이 모든 태스크에서 일치
- `formatTo12Hour`, `parseTimeInput`, `generateChips`, `getDefaultTab` 함수명 일치
- `value: string`, `onChange: (value: string) => void` 시그니처 모든 사용처에서 일치
