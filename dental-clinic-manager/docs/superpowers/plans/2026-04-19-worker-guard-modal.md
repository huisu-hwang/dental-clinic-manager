# 통합 워커 가드 모달 강화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 통합 워커가 미설치/오프라인일 때 단순 알럿 대신 다운로드/재시작 가이드와 자동 재시도가 포함된 모달로 사용자가 자체 해결할 수 있게 한다.

**Architecture:** 신규 `WorkerGuardModal` (Promise 기반 동적 마운트 모달) + `installer.ts` (OS 감지 + 다운로드 트리거) 추가. 기존 `useWorkerGuard.ts` 내부 `showGuardDialog`만 모달 호출로 교체. 호출처 4곳은 시그니처 동일하므로 무수정.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Tailwind 4, lucide-react, react-dom `createRoot`, 기존 `/api/workers/status` + `/api/marketing/worker-api/download`.

**Spec:** [docs/superpowers/specs/2026-04-19-worker-guard-modal-design.md](../specs/2026-04-19-worker-guard-modal-design.md)

**테스트 전략:** 이 프로젝트는 Jest/Vitest 단위 테스트 인프라가 없다. 검증은 다음 3단계로 한다:
1. `npm run lint` — TypeScript/ESLint 통과
2. `npm run build` — 프로덕션 빌드 통과
3. Chrome DevTools MCP 수동 통합 테스트 (Task 6)

---

## File Structure

| 경로 | 종류 | 책임 |
|---|---|---|
| `src/lib/workers/installer.ts` | 신규 | OS 감지 (`detectOS`), 다운로드 트리거 (`triggerWorkerDownload`) |
| `src/components/WorkerGuardModal.tsx` | 신규 | Promise 기반 가드 모달 + `openWorkerGuardModal()` 헬퍼 |
| `src/hooks/useWorkerGuard.ts` | 수정 | `WorkerType` 확장, `WORKER_LABELS` 슬림화, `showGuardDialog`가 모달 호출, `checkWorkerState`에 dentweb/email 분기 추가 |

---

## Task 1: OS 감지 + 다운로드 트리거 유틸

**Files:**
- Create: `src/lib/workers/installer.ts`

- [ ] **Step 1: 디렉토리/파일 생성 및 구현**

```ts
// src/lib/workers/installer.ts

export type DetectedOS = 'windows' | 'mac' | 'unknown'

/**
 * navigator.userAgent로 OS 감지.
 * SSR 환경에서는 'unknown' 반환.
 */
export function detectOS(): DetectedOS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac'
  return 'unknown'
}

export type DownloadResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported_os' | 'api_error' }

/**
 * 통합 워커 인스톨러 다운로드를 트리거한다.
 * - Windows: GitHub Release `.exe` URL → window.location.assign() 자동 다운로드
 * - Mac (DMG 있음): GitHub Release `.dmg` URL → window.location.assign()
 * - Mac (DMG 없음): /api 응답이 shell script binary → blob anchor 다운로드
 * - Linux/모바일: unsupported_os
 */
export async function triggerWorkerDownload(): Promise<DownloadResult> {
  const os = detectOS()
  if (os === 'unknown') return { ok: false, reason: 'unsupported_os' }

  try {
    const res = await fetch(`/api/marketing/worker-api/download?os=${os}`)
    if (!res.ok) return { ok: false, reason: 'api_error' }

    const contentType = res.headers.get('content-type') || ''

    // JSON 응답: { downloadUrl } → 직접 이동
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { downloadUrl?: string }
      if (!data.downloadUrl) return { ok: false, reason: 'api_error' }
      window.location.assign(data.downloadUrl)
      return { ok: true }
    }

    // 바이너리 응답 (Mac shell script): blob 다운로드
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = os === 'mac' ? 'marketing-worker-setup.command' : 'marketing-worker-setup.sh'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'api_error' }
  }
}
```

- [ ] **Step 2: 타입/lint 검증**

Run: `npx tsc --noEmit` (또는 `npm run lint`)
Expected: 신규 파일 관련 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add src/lib/workers/installer.ts
git commit -m "feat(worker): OS 감지 + 통합 워커 다운로드 트리거 유틸 추가

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: WorkerGuardModal 기본 구조 + 미설치 케이스

**Files:**
- Create: `src/components/WorkerGuardModal.tsx`

- [ ] **Step 1: 모달 기본 구조 + Promise 헬퍼 작성**

```tsx
// src/components/WorkerGuardModal.tsx
'use client'

import { useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AlertTriangle, Download, RefreshCw, X, Loader2 } from 'lucide-react'
import { triggerWorkerDownload } from '@/lib/workers/installer'

export type GuardState = 'not_installed' | 'offline'
export type WorkerType = 'marketing' | 'scraping' | 'seo' | 'dentweb' | 'email'

interface OpenOptions {
  type: WorkerType
  featureName: string
  state: GuardState
}

interface ModalProps extends OpenOptions {
  onResolve: (result: boolean) => void
}

// =====================================================
// Singleton mount (중복 호출 방지)
// =====================================================

let activePromise: Promise<boolean> | null = null
let activeRoot: Root | null = null
let activeContainer: HTMLDivElement | null = null

function unmountModal() {
  if (activeRoot) {
    activeRoot.unmount()
    activeRoot = null
  }
  if (activeContainer && activeContainer.parentNode) {
    activeContainer.parentNode.removeChild(activeContainer)
    activeContainer = null
  }
  activePromise = null
}

export function openWorkerGuardModal(opts: OpenOptions): Promise<boolean> {
  if (activePromise) return activePromise

  activePromise = new Promise<boolean>((resolve) => {
    activeContainer = document.createElement('div')
    document.body.appendChild(activeContainer)
    activeRoot = createRoot(activeContainer)

    const handleResolve = (result: boolean) => {
      resolve(result)
      // 다음 tick에 unmount (React state 정리 시간 확보)
      setTimeout(unmountModal, 0)
    }

    activeRoot.render(<WorkerGuardModal {...opts} onResolve={handleResolve} />)
  })

  return activePromise
}

// =====================================================
// 워커 상태 재핑 (모달 내부 사용)
// =====================================================

async function pingWorkerStatus(type: WorkerType): Promise<{ installed: boolean; online: boolean }> {
  try {
    const res = await fetch(`/api/workers/status?type=${type}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { installed: false, online: false }
    const data = await res.json()
    const slot = data[type]
    return {
      installed: slot?.installed ?? false,
      online: slot?.online ?? false,
    }
  } catch {
    return { installed: false, online: false }
  }
}

// =====================================================
// Modal Component
// =====================================================

function WorkerGuardModal({ type, featureName, state, onResolve }: ModalProps) {
  const [downloading, setDownloading] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const isNotInstalled = state === 'not_installed'

  const handleDownload = async () => {
    setDownloading(true)
    setDownloadError(null)
    const result = await triggerWorkerDownload()
    setDownloading(false)
    if (!result.ok) {
      setDownloadError(
        result.reason === 'unsupported_os'
          ? 'Windows 또는 macOS에서만 지원됩니다.'
          : '다운로드 URL을 가져올 수 없습니다. 잠시 후 다시 시도해주세요.'
      )
    }
  }

  const handleRecheck = async () => {
    setRechecking(true)
    const status = await pingWorkerStatus(type)
    setRechecking(false)
    if (status.installed && status.online) {
      onResolve(true)
    }
    // else: 모달 유지 — 미설치/오프라인 상태 그대로
  }

  const handleCancel = () => onResolve(false)

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4"
      onClick={handleCancel}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {isNotInstalled ? '통합 워커 미설치' : '통합 워커 응답 없음'}
            </h2>
          </div>
          <button
            onClick={handleCancel}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          <p className="text-sm text-gray-700">
            <strong>{featureName}</strong> 기능을 사용하려면 통합 워커가{' '}
            {isNotInstalled ? '설치되어 있어야' : '실행 중이어야'} 합니다.
          </p>

          {isNotInstalled ? (
            <NotInstalledGuide />
          ) : (
            <OfflineGuide /* Task 3에서 자동 재시도 추가 */ />
          )}

          {downloadError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {downloadError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
          <button
            onClick={handleCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            취소
          </button>
          {!isNotInstalled && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? '다운로드 중...' : '재설치'}
            </button>
          )}
          <button
            onClick={handleRecheck}
            disabled={rechecking}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {rechecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            다시 확인
          </button>
          {isNotInstalled && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              통합 워커 다운로드
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// =====================================================
// 가이드 컴포넌트
// =====================================================

function NotInstalledGuide() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="mb-2 font-medium text-amber-900">설치 방법</p>
      <ol className="list-decimal space-y-1 pl-5 text-amber-800">
        <li>아래 [통합 워커 다운로드] 버튼을 클릭합니다.</li>
        <li>다운로드된 <code className="rounded bg-amber-100 px-1">clinic-manager-worker-x.x.x-setup.exe</code>를 실행합니다.</li>
        <li>설치 마법사 안내에 따라 진행합니다.</li>
        <li>설치 완료 후 자동 실행됩니다 (작업 표시줄 트레이 아이콘 확인).</li>
        <li>1분 후 [다시 확인]을 눌러주세요.</li>
      </ol>
    </div>
  )
}

function OfflineGuide() {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
      <p className="mb-2 font-medium text-amber-900">해결 방법</p>
      <ol className="list-decimal space-y-1 pl-5 text-amber-800">
        <li>작업 표시줄 우측 트레이 영역을 확인합니다.</li>
        <li>통합 워커 아이콘을 우클릭하여 "종료"합니다.</li>
        <li>시작 메뉴에서 통합 워커를 다시 실행합니다.</li>
        <li>1분 후 [다시 확인]을 눌러주세요.</li>
      </ol>
    </div>
  )
}
```

> **참고:** `OfflineGuide`는 Task 3에서 자동 재시도 영역이 추가됩니다. 지금은 가이드만 표시.

- [ ] **Step 2: 타입/lint 검증**

Run: `npm run lint`
Expected: WorkerGuardModal 관련 오류 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/WorkerGuardModal.tsx
git commit -m "feat(worker): WorkerGuardModal 기본 구조 + 미설치 케이스 추가

- Promise 기반 동적 마운트 (createRoot)
- 싱글톤 보호 (중복 호출 방지)
- 미설치/오프라인 분기 UI
- 다운로드/재확인 액션

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: WorkerGuardModal 자동 재시도 (오프라인 케이스)

**Files:**
- Modify: `src/components/WorkerGuardModal.tsx`

- [ ] **Step 1: `OfflineGuide`를 자동 재시도 포함 컴포넌트로 교체**

`OfflineGuide` 함수 정의를 제거하고, 모달 본문 내 `<OfflineGuide />` 호출 위치에 `<OfflineSection ... />`을 사용하도록 변경.

```tsx
// (1) ModalProps 사용 측 - 본문 분기 부분 교체
{isNotInstalled ? (
  <NotInstalledGuide />
) : (
  <OfflineSection
    type={type}
    onAutoRecovered={() => onResolve(true)}
  />
)}
```

```tsx
// (2) 새 컴포넌트 정의 (기존 OfflineGuide 자리 교체)
interface OfflineSectionProps {
  type: WorkerType
  onAutoRecovered: () => void
}

function OfflineSection({ type, onAutoRecovered }: OfflineSectionProps) {
  const MAX_ATTEMPTS = 3
  const INTERVAL_MS = 5000

  const [attempt, setAttempt] = useState(0) // 0..MAX_ATTEMPTS (완료 횟수)
  const [secondsLeft, setSecondsLeft] = useState(INTERVAL_MS / 1000)
  const [exhausted, setExhausted] = useState(false)

  useEffect(() => {
    if (exhausted) return
    if (attempt >= MAX_ATTEMPTS) {
      setExhausted(true)
      return
    }

    let cancelled = false
    let countdownTimer: ReturnType<typeof setInterval> | null = null
    let tickRemaining = INTERVAL_MS / 1000

    setSecondsLeft(tickRemaining)
    countdownTimer = setInterval(() => {
      tickRemaining -= 1
      if (cancelled) return
      setSecondsLeft(Math.max(0, tickRemaining))
    }, 1000)

    const fireTimer = setTimeout(async () => {
      if (cancelled) return
      const status = await pingWorkerStatus(type)
      if (cancelled) return
      if (status.installed && status.online) {
        onAutoRecovered()
        return
      }
      setAttempt((n) => n + 1)
    }, INTERVAL_MS)

    return () => {
      cancelled = true
      if (countdownTimer) clearInterval(countdownTimer)
      clearTimeout(fireTimer)
    }
  }, [attempt, exhausted, type, onAutoRecovered])

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
        <p className="mb-2 font-medium text-amber-900">해결 방법</p>
        <ol className="list-decimal space-y-1 pl-5 text-amber-800">
          <li>작업 표시줄 우측 트레이 영역을 확인합니다.</li>
          <li>통합 워커 아이콘을 우클릭하여 "종료"합니다.</li>
          <li>시작 메뉴에서 통합 워커를 다시 실행합니다.</li>
          <li>1분 후 [다시 확인]을 눌러주세요.</li>
        </ol>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <RefreshCw className={`h-3.5 w-3.5 ${exhausted ? '' : 'animate-spin'}`} />
        {exhausted ? (
          <span>자동 확인 종료. 워커를 재시작 후 [다시 확인]을 눌러주세요.</span>
        ) : (
          <span>
            자동 재시도{' '}
            <DotIndicator current={attempt} total={MAX_ATTEMPTS} />{' '}
            ({attempt + 1}/{MAX_ATTEMPTS}) — {secondsLeft}초 후 다시 확인...
          </span>
        )}
      </div>
    </div>
  )
}

function DotIndicator({ current, total }: { current: number; total: number }) {
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`inline-block h-1.5 w-1.5 rounded-full ${
            i < current ? 'bg-amber-600' : 'bg-amber-300'
          }`}
        />
      ))}
    </span>
  )
}
```

- [ ] **Step 2: 수동 [다시 확인] 클릭 시 자동 카운터 리셋 + onAutoRecovered 안정화**

`WorkerGuardModal` 컴포넌트에서 `OfflineSection`이 자체적으로 `attempt` 상태를 가지므로, 수동 재핑이 성공하면 모달이 닫혀 자동으로 cleanup된다. 실패한 경우 자동 재시도 사이클을 처음부터 재시작해야 한다.

`OfflineSection`에 `key`를 부여해 부모에서 리셋 가능하게 한다. 또한 `onAutoRecovered` 콜백은 `useCallback`으로 안정화해 자식의 `useEffect` 무한 재실행을 방지한다. `useCallback` import를 추가한다.

```tsx
// 상단 import에 useCallback 추가
import { useCallback, useEffect, useState } from 'react'
```

```tsx
// WorkerGuardModal 함수 본문
const [offlineCycleKey, setOfflineCycleKey] = useState(0)

const handleAutoRecovered = useCallback(() => {
  onResolve(true)
}, [onResolve])

const handleRecheck = async () => {
  setRechecking(true)
  const status = await pingWorkerStatus(type)
  setRechecking(false)
  if (status.installed && status.online) {
    onResolve(true)
    return
  }
  // 실패 시 OfflineSection 재마운트 (자동 재시도 카운터 리셋)
  if (!isNotInstalled) {
    setOfflineCycleKey((k) => k + 1)
  }
}

// 본문 분기:
{isNotInstalled ? (
  <NotInstalledGuide />
) : (
  <OfflineSection
    key={offlineCycleKey}
    type={type}
    onAutoRecovered={handleAutoRecovered}
  />
)}
```

> **주의:** 모달 컴포넌트에 전달되는 `onResolve` 자체는 `openWorkerGuardModal` 헬퍼 안에서 한 번만 생성되어 안정적이지만, 화살표 함수 `() => onResolve(true)`를 매 렌더 새로 만드는 것은 자식 useEffect 의존성에 들어가면 위험하므로 명시적으로 `useCallback`을 사용한다.

- [ ] **Step 3: 타입/lint 검증**

Run: `npm run lint`
Expected: 오류 없음. (특히 `useEffect` deps 경고가 없는지 확인)

- [ ] **Step 4: 커밋**

```bash
git add src/components/WorkerGuardModal.tsx
git commit -m "feat(worker): 오프라인 케이스에 자동 재시도(5s×3) 추가

- 모달 마운트 시 자동 시작
- 점 인디케이터 + 카운트다운 표시
- 수동 [다시 확인] 실패 시 자동 카운터 리셋
- cleanup 보장 (cancelled flag + clearTimeout/clearInterval)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: useWorkerGuard 통합 + WorkerType 확장

**Files:**
- Modify: `src/hooks/useWorkerGuard.ts`

- [ ] **Step 1: `WorkerType` 확장 + `WORKER_LABELS` 슬림화**

기존 정의를 다음으로 교체:

```ts
type WorkerType = 'marketing' | 'scraping' | 'seo' | 'dentweb' | 'email'

interface WorkerGuardOptions {
  type: WorkerType
  featureName?: string
}

const WORKER_LABELS: Record<WorkerType, { defaultFeature: string }> = {
  marketing: { defaultFeature: '마케팅 기능' },
  scraping:  { defaultFeature: '데이터 연동' },
  seo:       { defaultFeature: 'SEO 키워드 분석' },
  dentweb:   { defaultFeature: '덴트웹 매출 동기화' },
  email:     { defaultFeature: '이메일 알림' },
}
```

> **참고:** 기존 `name` 필드 (예: '마케팅 워커')는 모달 헤더가 "통합 워커 [상태]"로 고정되므로 더 이상 사용하지 않는다. `label.name` 참조가 코드에 있으면 모두 제거.

- [ ] **Step 2: `checkWorkerState`에 dentweb/email 분기 추가**

기존 함수에서 `if (type === 'seo')` 다음에 두 분기를 추가:

```ts
async function checkWorkerState(type: WorkerType): Promise<WorkerState> {
  try {
    const res = await fetch(`/api/workers/status?type=${type}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return { installed: false, online: false }

    const data = await res.json()
    if (type === 'marketing') {
      return {
        installed: data.marketing?.installed ?? false,
        online: data.marketing?.online ?? false,
      }
    }
    if (type === 'scraping') {
      return {
        installed: data.scraping?.installed ?? false,
        online: data.scraping?.online ?? false,
      }
    }
    if (type === 'seo') {
      return {
        installed: data.seo?.installed ?? false,
        online: data.seo?.online ?? false,
      }
    }
    if (type === 'dentweb') {
      return {
        installed: data.dentweb?.installed ?? false,
        online: data.dentweb?.online ?? false,
      }
    }
    if (type === 'email') {
      return {
        installed: data.email?.installed ?? false,
        online: data.email?.online ?? false,
      }
    }
    return { installed: false, online: false }
  } catch {
    return { installed: false, online: false }
  }
}
```

- [ ] **Step 3: `showGuardDialog`를 모달 호출로 교체**

기존 `appAlert` 호출을 모두 제거하고 다음으로 교체:

```ts
import { openWorkerGuardModal, type GuardState } from '@/components/WorkerGuardModal'
// (기존 import { appAlert } from '@/components/ui/AppDialog' 라인 제거)

async function showGuardDialog(
  type: WorkerType,
  feature: string,
  state: WorkerState
): Promise<boolean> {
  const guardState: GuardState = !state.installed ? 'not_installed' : 'offline'
  return openWorkerGuardModal({ type, featureName: feature, state: guardState })
}
```

- [ ] **Step 4: `guardAction` / `requireWorker`가 모달 결과를 반환하도록 수정**

```ts
// useWorkerGuard 내부
const guardAction = useCallback(async (): Promise<boolean> => {
  const state = await checkWorkerState(type)
  if (state.installed && state.online) return true
  return await showGuardDialog(type, feature, state)
}, [type, feature])
```

```ts
// 모듈 함수
export async function requireWorker(type: WorkerType, featureName?: string): Promise<boolean> {
  const label = WORKER_LABELS[type]
  const feature = featureName || label.defaultFeature
  const state = await checkWorkerState(type)
  if (state.installed && state.online) return true
  return await showGuardDialog(type, feature, state)
}
```

> **주의:** `useWorkerGuard` 함수 내에서 기존 `const label = WORKER_LABELS[type]`을 읽는 부분도 `name` 참조가 있으면 제거하고 `defaultFeature`만 사용하도록 정리.

- [ ] **Step 5: 타입/lint 검증**

Run: `npm run lint`
Expected: 오류 없음. 특히 호출처 4곳에서 타입 호환성 유지 확인 (`requireWorker`/`guardAction` 모두 `Promise<boolean>` 반환은 이전과 동일).

- [ ] **Step 6: 커밋**

```bash
git add src/hooks/useWorkerGuard.ts
git commit -m "feat(worker): useWorkerGuard를 WorkerGuardModal 호출로 강화

- WorkerType에 dentweb/email 추가
- WORKER_LABELS에서 사용하지 않는 name 필드 제거
- checkWorkerState에 dentweb/email 분기 추가
- showGuardDialog가 appAlert 대신 openWorkerGuardModal 호출
- guardAction/requireWorker가 모달 결과(true/false) 반환

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 빌드 검증

**Files:** (없음 — 검증만)

- [ ] **Step 1: 풀 빌드 실행**

Run: `npm run build`
Expected: 빌드 성공. 신규 모듈/컴포넌트가 번들에 포함되고 타입 오류 없음.

- [ ] **Step 2: 빌드 실패 시 처리**

빌드 오류가 발생하면 즉시 원인 파악 후 수정 → 다시 `npm run build` 실행. 성공할 때까지 반복 (CLAUDE.md 최상위 지시사항에 따라 멈추지 않음).

- [ ] **Step 3: lint 실행**

Run: `npm run lint`
Expected: 신규/수정 파일 관련 ESLint 경고/오류 없음.

> 이 단계는 별도 commit 없음 (코드 변경 없음).

---

## Task 6: Chrome DevTools MCP 수동 통합 테스트

**Files:** (없음 — 검증만)

테스트 계정으로 로그인 후 시나리오 수행. 실패 시 코드 수정 → Task 5 빌드부터 재실행.

테스트 계정 (CLAUDE.md 참조):
- 일반: `whitedc0902@gmail.com` / `ghkdgmltn81!`
- 마스터: `sani81@gmail.com` / `ghkdgmltn81!`

dev 서버 실행: `npm run dev` (background)

- [ ] **시나리오 1: 미설치 케이스**

1. Supabase MCP로 임시 실행: `DELETE FROM marketing_worker_control WHERE id = 'main';` (또는 별도 환경에서 진행)
2. Chrome DevTools MCP로 `http://localhost:3000/auth` 이동 → 로그인
3. `/dashboard/marketing/posts/new` 이동 → 발행 버튼 클릭
4. **확인**: "통합 워커 미설치" 모달이 표시됨
5. 모달의 [통합 워커 다운로드] 클릭
6. **확인**: 네트워크 탭에 `/api/marketing/worker-api/download?os=windows` 요청 발생, GitHub Release `.exe` URL로 자동 이동/다운로드 시작
7. [취소] 클릭 → 모달 닫힘, 발행 진행되지 않음
8. 테스트 후 control 레코드 복원 (`INSERT ...`) — 또는 별도 테스트 환경 사용

- [ ] **시나리오 2: 오프라인 케이스 + 자동 재시도**

1. Supabase MCP로 실행: `UPDATE marketing_worker_control SET watchdog_online = false, last_updated = NOW() - INTERVAL '5 minutes' WHERE id = 'main';`
2. 발행 시도 → "통합 워커 응답 없음" 모달 열림
3. **확인**: 자동 재시도 영역이 5초 카운트다운 시작 (●●● 점 인디케이터)
4. **확인**: 5초 × 3회 진행 후 "자동 확인 종료..." 메시지 표시
5. [다시 확인] 클릭 → 즉시 1회 ping 후 실패 → 자동 사이클 다시 시작 (점 인디케이터 리셋 확인)
6. [재설치] 클릭 → 다운로드 트리거 확인

- [ ] **시나리오 3: 자동 복구**

1. 시나리오 2 상태에서 모달 열어둔 채로
2. Supabase MCP로 실행: `UPDATE marketing_worker_control SET watchdog_online = true, last_updated = NOW() WHERE id = 'main';`
3. **확인**: 다음 자동 재시도 사이클(최대 5초 후)에 모달 자동 닫힘 + 발행 진행

- [ ] **시나리오 4: 취소**

1. 모달 열림 상태에서 [취소] 또는 X 또는 배경 클릭
2. **확인**: 모달 닫힘, 호출처에서 `false` 받아 기능 차단됨
3. **확인**: DevTools Performance/Memory에서 타이머 누수 없음 (다시 가드 호출 시 새 모달이 정상 동작)

- [ ] **시나리오 5: OS 미지원**

1. Chrome DevTools `Network conditions`에서 User-Agent를 `Mozilla/5.0 (X11; Linux x86_64)`로 변경
2. 발행 시도 → 미설치 모달
3. [통합 워커 다운로드] 클릭
4. **확인**: 모달 본문에 "Windows 또는 macOS에서만 지원됩니다." 빨간 박스 표시

- [ ] **시나리오 6: 정상 케이스 회귀**

1. control 정상 복원: `UPDATE marketing_worker_control SET watchdog_online = true, last_updated = NOW() WHERE id = 'main';`
2. 발행 시도 → 모달 표시되지 않음, 정상 발행 진행
3. SEO 키워드 분석 페이지에서도 동일 확인 (`scraping`, `seo` 가드도 정상)

> **주의:** 시나리오 6 모두 통과해야 다음 Task로 진행. 실패 시 원인 파악 → 코드 수정 → Task 5 빌드부터 재실행.

---

## Task 7: develop 브랜치 푸시

**Files:** (없음 — Git 작업만)

- [ ] **Step 1: 변경 내역 최종 확인**

Run: `git log --oneline origin/develop..HEAD`
Expected: Task 1, 2, 3, 4의 4개 커밋이 표시됨.

- [ ] **Step 2: develop으로 푸시**

```bash
git push origin develop
```

푸시 실패 시 원인 파악 → 해결(예: `git pull --rebase origin develop`) → 다시 푸시. 성공할 때까지 반복.

- [ ] **Step 3: 푸시 검증**

Run: `gh run list --branch develop --limit 3`
Expected: 가장 최신 커밋의 CI/Vercel 빌드가 시작됨. 실패 시 원인 파악 후 수정.

---

## 완료 조건

- [ ] Task 1~4의 4개 커밋이 develop 브랜치에 푸시됨
- [ ] `npm run build` 성공
- [ ] `npm run lint` 통과
- [ ] Chrome DevTools 시나리오 1~6 모두 통과
- [ ] 호출처 4곳(`useWorkerGuard.ts`, `posts/new/page.tsx`, `KeywordAnalysis.tsx`, `HometaxSyncPanel.tsx`) 코드 변경 없음
- [ ] Vercel preview 빌드 성공 확인
