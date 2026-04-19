# 통합 워커 가드 모달 강화 설계

- 작성일: 2026-04-19
- 작업 유형: 기능 개선 (UX 강화)
- 상태: 설계 완료 / 구현 대기

## 개요

통합 워커가 필요한 기능을 사용자가 실행할 때, 워커가 **미설치** 또는 **오프라인** 상태이면 현재는 단순 `appAlert`로 "관리자에게 요청해주세요"라고만 안내한다. 이 안내에는 설치 링크도, 재시작/재설치 가이드도 없어 사용자가 스스로 문제를 해결할 수 없다.

본 작업은 기존 `useWorkerGuard` / `requireWorker` API 시그니처를 유지하면서 가드 내부의 안내 팝업만 강화한다.

- 미설치: **다운로드 버튼 + 5단계 설치 가이드**가 포함된 모달
- 오프라인: **자동 재시도(5초×3회) + 재시작 가이드 + 재설치 버튼**이 포함된 모달

## 배경 및 현황

### 기존 인프라 (재사용)

| 파일 | 역할 |
|---|---|
| [src/hooks/useWorkerStatus.ts](../../../src/hooks/useWorkerStatus.ts) | 상태 확인 hook (DB heartbeat + 로컬 ping) |
| [src/hooks/useWorkerGuard.ts](../../../src/hooks/useWorkerGuard.ts) | 가드 hook + 모듈 함수 `requireWorker` |
| [src/components/WorkerStatusBanner.tsx](../../../src/components/WorkerStatusBanner.tsx) | 상태 배너 (변경 없음) |
| [src/app/api/workers/status/route.ts](../../../src/app/api/workers/status/route.ts) | 5종 워커 상태 통합 조회 API |
| [src/app/api/marketing/worker-api/download/route.ts](../../../src/app/api/marketing/worker-api/download/route.ts) | OS 분기 다운로드 URL API (Windows `.exe` / Mac `.dmg`+스크립트) |

### 통합 워커 가정

5종 워커(`marketing`, `scraping`, `seo`, `dentweb`, `email`)는 **하나의 통합 워커 프로그램**에 속한다. 따라서:

- 다운로드 링크는 1개 (기존 `/api/marketing/worker-api/download` 재사용)
- 가드 메시지/UI는 워커 타입과 무관하게 동일
- 단, 호출 시 전달되는 `featureName`(예: "AI 글 발행", "홈택스 동기화")은 그대로 모달에 노출

### 가드 호출처 (기존)

| 파일 | 호출 |
|---|---|
| [src/app/dashboard/marketing/posts/new/page.tsx](../../../src/app/dashboard/marketing/posts/new/page.tsx) | `requireWorker('marketing', 'AI 글 발행')` |
| [src/components/SEO/KeywordAnalysis.tsx](../../../src/components/SEO/KeywordAnalysis.tsx) | `requireWorker('seo', 'SEO 키워드 분석')` |
| [src/components/Financial/HometaxSyncPanel.tsx](../../../src/components/Financial/HometaxSyncPanel.tsx) | `requireWorker('scraping', '홈택스 동기화')` |
| [src/hooks/useWorkerGuard.ts](../../../src/hooks/useWorkerGuard.ts) | `useWorkerGuard({ type, featureName })` 훅 정의 |

이 4곳의 호출 시그니처는 **변경하지 않는다**.

## 목표 / 비목표

### 목표

- 미설치 사용자가 **다운로드 → 설치 → 재확인**을 모달 안에서 완결할 수 있다
- 오프라인 사용자가 **자동 재시도 + 재시작 가이드**로 자체 해결할 수 있다
- 5종 워커(`marketing`/`scraping`/`seo`/`dentweb`/`email`) 모두 동일한 모달 경험을 받는다
- 기존 4곳 호출처는 코드 수정 없이 강화된 동작을 받는다

### 비목표

- 워커 프로세스 자동 시작 (브라우저는 로컬 프로세스 제어 불가)
- 자동 업데이트 알림 (별도 기능)
- `dentweb` / `email` 진입 지점에 신규 가드 호출 추가 (별도 PR 권장)
- 워커 자동 진단(로그 수집 등) — 가시적 상태(설치/온라인)만 판정

## 아키텍처

### 흐름

```
[사용자가 기능 클릭]
        ↓
requireWorker(type, featureName)
        ↓
GET /api/workers/status?type=...
        ↓
   ┌────┼─────────────┐
   ↓    ↓             ↓
[OK]  [미설치]      [오프라인]
return openWorkerGuardModal({ state: 'not_installed' | 'offline' })
true              ↓
            ┌─────┴──────┐
            ↓            ↓
         true          false
       (재확인 성공)  (취소)
```

### 신규/수정 파일

| 파일 | 종류 | 역할 |
|---|---|---|
| `src/components/WorkerGuardModal.tsx` | 신규 | Promise 기반 모달 컴포넌트 + `openWorkerGuardModal()` 헬퍼 |
| `src/lib/workers/installer.ts` | 신규 | OS 감지 (`detectOS`) + 다운로드 트리거 (`triggerWorkerDownload`) |
| `src/hooks/useWorkerGuard.ts` | 수정 | `appAlert` 대신 `openWorkerGuardModal` 호출. `guardAction` / `requireWorker`가 모달 결과 반환 |
| `src/app/api/marketing/worker-api/download/route.ts` | 변경 없음 | OS 분기 그대로 재사용 |
| `src/components/WorkerStatusBanner.tsx` | 변경 없음 | |
| 호출처 4개 파일 | 변경 없음 | 시그니처 동일 |

## 컴포넌트 명세

### `WorkerGuardModal` (Promise 기반)

```ts
type GuardState = 'not_installed' | 'offline'
type WorkerType = 'marketing' | 'scraping' | 'seo' | 'dentweb' | 'email'

interface OpenOptions {
  type: WorkerType
  featureName: string         // 모달 본문에 노출 (예: "AI 글 발행")
  state: GuardState
}

export function openWorkerGuardModal(opts: OpenOptions): Promise<boolean>
// resolve(true)  - 가드 통과 (모달 안에서 [다시 확인] 후 온라인 확인됨)
// resolve(false) - 사용자 취소 또는 닫기
```

#### 마운트 방식

- `appAlert`와 동일하게 `createRoot()`로 동적 마운트
- 모듈 레벨 싱글톤: 이미 열려있으면 기존 Promise를 반환 (중복 호출 방지)
- 닫힐 때 `root.unmount()` + 컨테이너 DOM 제거

#### 공통 레이아웃

```
┌──────────────────────────────────────────┐
│ 통합 워커 [상태 라벨]                  ✕ │
├──────────────────────────────────────────┤
│ {featureName} 기능을 사용하려면 통합     │
│ 워커가 [필요/실행 중이어야] 합니다.      │
│                                          │
│ [상태별 가이드 박스]                     │
│ [상태별 보조 영역]                       │
├──────────────────────────────────────────┤
│        [상태별 액션 버튼들]              │
└──────────────────────────────────────────┘
```

### 케이스 A: `state="not_installed"`

- **헤더**: `통합 워커 미설치`
- **본문 첫 줄**: `{featureName} 기능을 사용하려면 통합 워커가 설치되어 있어야 합니다.`
- **가이드 박스 (5단계)**:
  1. 아래 [통합 워커 다운로드] 버튼 클릭
  2. 다운로드된 `clinic-manager-worker-x.x.x-setup.exe` 실행
  3. 설치 마법사 안내에 따라 진행
  4. 설치 완료 후 자동 실행됨 (트레이 아이콘 확인)
  5. 1분 후 [다시 확인] 클릭
- **버튼**: `[취소]` `[다시 확인]` `[통합 워커 다운로드]` (primary)
- **자동 재시도**: **없음** (사용자 액션 필요)

### 케이스 B: `state="offline"`

- **헤더**: `통합 워커 응답 없음`
- **본문 첫 줄**: `{featureName} 기능을 사용하려면 통합 워커가 실행 중이어야 합니다.`
- **가이드 박스 (4단계)**:
  1. 작업 표시줄 우측 트레이 영역 확인
  2. 통합 워커 아이콘 우클릭 → "종료"
  3. 시작 메뉴에서 통합 워커 재실행
  4. 1분 후 [다시 확인] 클릭
- **자동 재시도 영역**:
  - 모달 열림 시 자동 시작
  - 5초 간격, 최대 3회 (총 15초)
  - 표시: `[자동 재시도] ●●○ (2/3) — 5초 후 다시 확인...` (점 인디케이터 + 카운트다운)
  - 성공 시: 모달 닫고 즉시 `true` 반환
  - 3회 모두 실패: `자동 확인 종료. 워커를 재시작 후 [다시 확인]을 눌러주세요.` 표시
  - 수동 [다시 확인] 클릭 시: 자동 카운터 리셋 후 즉시 1회 ping → 실패하면 다시 자동 5초×3회 반복
- **버튼**: `[취소]` `[재설치]` `[다시 확인]` (primary)
  - `[재설치]`는 다운로드 동작과 동일 (`triggerWorkerDownload`)
- **cleanup**: 모달 닫기/취소/언마운트 시 진행 중 타이머 정리

## 다운로드 + OS 감지

### `src/lib/workers/installer.ts`

```ts
export type DetectedOS = 'windows' | 'mac' | 'unknown'

export function detectOS(): DetectedOS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac'
  return 'unknown'
}

export async function triggerWorkerDownload(): Promise<
  | { ok: true }
  | { ok: false; reason: 'unsupported_os' | 'api_error' }
> {
  const os = detectOS()
  if (os === 'unknown') return { ok: false, reason: 'unsupported_os' }

  try {
    const res = await fetch(`/api/marketing/worker-api/download?os=${os}`)
    const contentType = res.headers.get('content-type') || ''

    if (contentType.includes('application/json')) {
      const data = await res.json() as { downloadUrl?: string }
      if (!data.downloadUrl) return { ok: false, reason: 'api_error' }
      window.location.assign(data.downloadUrl)
      return { ok: true }
    }

    // Mac shell script (binary): blob 다운로드
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

- Windows: GitHub Release `.exe` URL → `window.location.assign()`로 자동 다운로드
- Mac DMG: 동일하게 URL → `window.location.assign()`
- Mac shell: blob → anchor 다운로드
- Linux/모바일/기타: `unsupported_os` 반환 → 모달에서 토스트 표시

## `useWorkerGuard.ts` 변경

### `WorkerType` 확장 + `WORKER_LABELS` 보완

기존 `WorkerType`은 `'marketing' | 'scraping' | 'seo'`만 정의되어 있다. 통합 워커 가드의 일관성을 위해 `dentweb` / `email`을 추가한다 (호출 자체는 별도 PR이지만 타입은 미리 확장).

```ts
type WorkerType = 'marketing' | 'scraping' | 'seo' | 'dentweb' | 'email'

const WORKER_LABELS: Record<WorkerType, { defaultFeature: string }> = {
  marketing: { defaultFeature: '마케팅 기능' },
  scraping:  { defaultFeature: '데이터 연동' },
  seo:       { defaultFeature: 'SEO 키워드 분석' },
  dentweb:   { defaultFeature: '덴트웹 매출 동기화' },
  email:     { defaultFeature: '이메일 알림' },
}
```

`name` 필드(예: "마케팅 워커")는 모달 헤더가 "통합 워커 [상태]"로 고정되므로 더 이상 사용하지 않는다 (제거).

### `showGuardDialog` 변경

```ts
// Before
async function showGuardDialog(type, feature, state) {
  await appAlert({ ... 단순 메시지 ... })
}

// After
async function showGuardDialog(
  type: WorkerType,
  feature: string,
  state: WorkerState
): Promise<boolean> {
  const guardState: GuardState = !state.installed ? 'not_installed' : 'offline'
  return openWorkerGuardModal({ type, featureName: feature, state: guardState })
}

const guardAction = useCallback(async (): Promise<boolean> => {
  const state = await checkWorkerState(type)
  if (state.installed && state.online) return true
  return await showGuardDialog(type, feature, state)
}, [type, feature])

export async function requireWorker(type, featureName): Promise<boolean> {
  const state = await checkWorkerState(type)
  if (state.installed && state.online) return true
  const label = WORKER_LABELS[type]
  const feature = featureName || label.defaultFeature
  return await showGuardDialog(type, feature, state)
}
```

### `checkWorkerState` 분기 보완

`/api/workers/status?type=...`는 이미 `dentweb`/`email` 응답 키를 반환하므로 `checkWorkerState` switch에 두 케이스만 추가:

```ts
if (type === 'dentweb') return { installed: data.dentweb?.installed ?? false, online: data.dentweb?.online ?? false }
if (type === 'email')   return { installed: data.email?.installed   ?? false, online: data.email?.online   ?? false }
```

호출처 측면에서 동작 차이:

- **Before**: 가드 실패 시 알럿만 표시하고 `false` 반환. 사용자가 알럿 닫고 다시 버튼 눌러야 함
- **After**: 가드 실패 시 모달이 자동 재시도/재확인 → 성공하면 `true` 반환. **호출처는 분기 코드를 바꿀 필요 없음** (이미 `if (!await guardAction()) return` 패턴이라 `true` 받으면 자연스럽게 다음 코드 진행)

## 테스트 케이스

### 수동 테스트 (Chrome DevTools MCP)

1. **미설치 케이스**
   - DB의 `marketing_worker_control` 레코드 임시 삭제
   - `/dashboard/marketing/posts/new`에서 발행 시도
   - 모달 열림 → `[통합 워커 다운로드]` 클릭 → `.exe` 다운로드 시작 확인
   - `[다시 확인]` 클릭 → 여전히 미설치면 모달 유지

2. **오프라인 케이스 (자동 재시도)**
   - 워커 종료 (heartbeat 60초 경과 대기)
   - 발행 시도 → 모달 열림 + 자동 재시도 5초×3회 진행 표시
   - 3회 종료 후 안내 문구 노출
   - 워커 재실행 → `[다시 확인]` 클릭 → 모달 닫히고 발행 진행

3. **자동 재시도 중 워커 복구**
   - 모달 열린 상태에서 워커 재실행
   - 다음 자동 재시도 사이클에 온라인 감지 → 모달 자동 닫힘 → `true` 반환

4. **취소**
   - `[취소]` 클릭 → 자동 재시도 타이머 정리 → `false` 반환 → 호출처에서 기능 차단

5. **OS 미지원**
   - DevTools에서 User-Agent를 Linux로 변경 → `[다운로드]` 클릭 → 토스트 안내

### 엣지 케이스

- 모달 열린 채 페이지 이동: cleanup으로 타이머/마운트 정리
- 연속 호출 (중복 모달): 모듈 레벨 싱글톤으로 1개만 유지
- API 5초 타임아웃: 자동 재시도 1회로 카운트
- 네트워크 오류: 자동 재시도 그대로 진행, 마지막 실패 시 안내

## 영향 범위 요약

| 영역 | 변경 |
|---|---|
| 신규 파일 | `WorkerGuardModal.tsx`, `lib/workers/installer.ts` |
| 수정 파일 | `useWorkerGuard.ts` (내부만) |
| 호출처 4곳 | **수정 없음** |
| 백엔드 API | **수정 없음** (기존 status / download API 재사용) |
| DB 스키마 | **변경 없음** |

## 위험 요소

- **자동 재시도 타이머 누수**: cleanup 누락 시 메모리 누수 → 컴포넌트 unmount 훅에서 명시적 clearTimeout 필수
- **싱글톤 충돌**: 동일 페이지에서 여러 가드가 동시에 실행되는 경우 → 두 번째 호출은 첫 번째 Promise 재사용
- **OS 감지 부정확**: User-Agent 위조/모바일 데스크톱 모드 → fallback으로 Windows를 기본 추천하는 옵션 고려 가능 (현재 설계는 unsupported로 처리)
- **다운로드 API 인증**: `/api/marketing/worker-api/download`는 인증 필요. 비로그인 상태에서 가드 발동은 발생하지 않으므로 문제 없음
