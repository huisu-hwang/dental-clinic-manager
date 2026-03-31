# Marketing Worker Electron App

**Created:** 2026-03-30
**Status:** Draft - Pending Approval
**Complexity:** MEDIUM-HIGH

---

## Context

현재 마케팅 워커(`marketing-worker/`)는 Node.js CLI 앱으로, 사용자 PC에서 `.bat`/`.command` 스크립트를 통해 설치/실행된다. 이 방식은 다음 문제가 있다:

1. **설치 난이도**: Node.js 설치, npm install, .env 파일 수동 설정 필요
2. **UX 부재**: 터미널 창에 로그만 출력, 상태 확인이 어려움
3. **안정성**: 터미널 닫으면 종료, Windows 재부팅 시 자동 시작 불가
4. **배포**: tarball 다운로드 + 쉘 스크립트 실행 방식

Electron으로 감싸면 **원클릭 설치, 시스템 트레이 상주, 자동 시작**이 가능하다.

## Existing Code to Reuse (변경 최소화)

기존 `marketing-worker/` 코드의 핵심 모듈은 그대로 재사용한다:

| 모듈 | 경로 | 변경 | 비고 |
|------|------|------|------|
| `api-client.ts` | `marketing-worker/api-client.ts` | 없음 | 대시보드 API 통신 |
| `scheduler.ts` | `marketing-worker/scheduler.ts` | 최소 | cron -> setInterval 전환 |
| `publisher/naver-blog-publisher.ts` | `marketing-worker/publisher/` | 없음 | 네이버 블로그 발행 로직 |
| `publisher/typing-simulator.ts` | `marketing-worker/publisher/` | 없음 | 타이핑 시뮬레이션 |
| `publisher/image-processor.ts` | `marketing-worker/publisher/` | 없음 | 이미지 처리 |
| `utils/delay.ts` | `marketing-worker/utils/` | 없음 | 딜레이 유틸 |
| `config.ts` | `marketing-worker/config.ts` | 수정 | dotenv -> electron-store |

## Work Objectives

1. Electron 트레이 앱으로 마케팅 워커를 패키징하여, Windows 사용자가 `.exe` 인스톨러를 다운로드-실행만 하면 워커가 동작하도록 한다.
2. 기존 워커 로직(`scheduler`, `publisher`, `api-client`)은 최대한 그대로 유지하고, 진입점과 설정 관리만 Electron에 맞게 교체한다.
3. 대시보드에서 인스톨러를 다운로드할 수 있도록 배포 파이프라인을 구성한다.

## Guardrails

### Must Have
- Windows `.exe` NSIS 인스톨러 (electron-builder)
- 시스템 트레이 아이콘 (상태 표시: 실행중/중지/오류)
- 첫 실행 시 설정 입력 화면 (Dashboard URL, Worker API Key)
- Windows 시작 시 자동 실행 (선택 가능)
- 기존 `api-client.ts`, `publisher/` 코드 무변경 재사용
- 대시보드 `/admin/marketing` 페이지에서 인스톨러 다운로드 링크

### Must NOT Have
- macOS/Linux 빌드 (이번 스코프 아님, 추후 확장)
- 복잡한 GUI (에디터, 콘텐츠 뷰어 등)
- 기존 CLI 워커 삭제 (하위 호환 유지)
- Electron 앱 내에 Playwright 번들 (시스템의 Playwright 사용)
- 자동 업데이트 (MVP에서 제외, 추후 electron-updater로 추가)

---

## Task Flow

```
[Step 1: 프로젝트 구조]
        |
[Step 2: Electron Main Process + Tray]
        |
[Step 3: 설정 관리 + 첫 실행 화면]
        |
[Step 4: 워커 로직 통합]
        |
[Step 5: 빌드 + 배포]
```

---

## Detailed TODOs

### Step 1: Electron 프로젝트 구조 셋업

**목표:** `marketing-worker/electron/` 디렉토리에 Electron 앱 스캐폴딩 생성

**작업 내용:**
- `marketing-worker/electron/` 디렉토리 생성
- `package.json` 생성 (electron, electron-builder, electron-store 의존성)
- `tsconfig.json` 생성 (기존 marketing-worker tsconfig 기반)
- 디렉토리 구조:
  ```
  marketing-worker/electron/
  ├── package.json
  ├── tsconfig.json
  ├── src/
  │   ├── main.ts          # Electron 메인 프로세스 진입점
  │   ├── tray.ts           # 시스템 트레이 관리
  │   ├── setup-window.ts   # 첫 실행 설정 화면
  │   ├── config-store.ts   # electron-store 기반 설정
  │   └── worker-bridge.ts  # 기존 워커 코드 연결 어댑터
  ├── assets/
  │   ├── icon.ico          # Windows 트레이 아이콘
  │   └── icon.png          # 일반 아이콘
  └── renderer/
      └── setup.html        # 첫 실행 설정 페이지 (단순 HTML)
  ```

**Acceptance Criteria:**
- [ ] `cd marketing-worker/electron && npm install` 성공
- [ ] `npx electron .` 실행 시 빈 Electron 창이 뜸
- [ ] TypeScript 컴파일 에러 없음

---

### Step 2: Electron Main Process + 시스템 트레이

**목표:** 트레이 아이콘으로 상주하는 Electron 앱 구현

**작업 내용:**
- `main.ts`: Electron app ready 이벤트에서 트레이 생성, 메인 윈도우는 숨김
- `tray.ts`: 시스템 트레이 아이콘 + 컨텍스트 메뉴 구현
  - 메뉴 항목: 상태 표시(실행중/중지), 시작/중지 토글, 설정, 로그 보기, 종료
  - 트레이 아이콘 상태별 색상/뱃지 변경 (초록=실행중, 회색=중지, 빨강=오류)
- `main.ts`: `app.setLoginItemSettings()` 로 Windows 시작 시 자동 실행
- 단일 인스턴스 보장 (`app.requestSingleInstanceLock()`)
- 닫기 버튼 클릭 시 트레이로 최소화 (종료 아님)

**Acceptance Criteria:**
- [ ] 앱 실행 시 시스템 트레이에 아이콘 표시
- [ ] 트레이 우클릭 시 컨텍스트 메뉴 표시
- [ ] "종료" 메뉴 클릭 시 앱 종료
- [ ] 두 번째 인스턴스 실행 시 기존 인스턴스로 포커스

---

### Step 3: 설정 관리 + 첫 실행 설정 화면

**목표:** `electron-store`로 설정을 영구 저장하고, 첫 실행 시 설정 입력 화면 표시

**작업 내용:**
- `config-store.ts`: `electron-store` 래퍼
  - 저장 항목: `dashboardUrl`, `workerApiKey`, `autoStart` (boolean), `headless` (boolean)
  - 기존 `config.ts`의 `CONFIG` 객체와 동일한 형태로 export
- `setup-window.ts`: BrowserWindow로 설정 입력 폼 표시
  - Dashboard URL 입력 (기본값: `https://hayan-dental.vercel.app`)
  - Worker API Key 입력
  - "연결 테스트" 버튼 (api-client의 `init()` 호출로 검증)
  - "저장" 시 electron-store에 저장 후 창 닫고 워커 시작
- `renderer/setup.html`: 간단한 HTML + inline CSS/JS (프레임워크 없음)
- `main.ts`: 첫 실행 감지 (설정 없으면 setup window, 있으면 바로 워커 시작)

**Acceptance Criteria:**
- [ ] 첫 실행 시 설정 입력 화면 표시
- [ ] URL + API Key 입력 후 "연결 테스트" 시 대시보드 연결 확인
- [ ] 설정 저장 후 앱 재시작 시 설정 화면 건너뜀
- [ ] 트레이 메뉴 "설정"에서 설정 화면 다시 열기 가능

---

### Step 4: 기존 워커 로직 통합

**목표:** 기존 `scheduler.ts`, `api-client.ts`, `publisher/` 코드를 Electron main process에서 실행

**작업 내용:**
- `worker-bridge.ts`: 기존 워커 코드를 Electron에서 실행하는 어댑터
  - `config-store.ts`에서 설정을 읽어 기존 `CONFIG` 형태로 변환
  - `scheduler.ts`의 `startScheduler()`를 호출하되, `node-cron` 대신 `setInterval` 사용 버전 생성
    - 또는: `node-cron`을 그대로 사용 (Electron main process에서 동작 확인 필요)
  - 워커 상태(running/stopped/error)를 트레이에 반영
  - 발행 이벤트 발생 시 트레이 알림 (Notification API)
- `scheduler.ts` 변경 (marketing-worker 루트):
  - `startScheduler()`가 `node-cron` 또는 `setInterval` 선택 가능하도록 옵션 파라미터 추가
  - 또는 별도 `startSchedulerInterval()` 함수 export (기존 함수 무변경)
- Playwright 경로: Electron에서 시스템에 설치된 Playwright Chromium 경로를 자동 감지
  - `PLAYWRIGHT_BROWSERS_PATH` 환경변수 또는 기본 경로에서 탐색
  - 없으면 첫 실행 시 `npx playwright install chromium` 자동 실행

**Acceptance Criteria:**
- [ ] Electron 앱에서 워커 시작/중지 토글 동작
- [ ] 스케줄러가 5분 간격으로 대시보드 API 폴링
- [ ] 발행 성공 시 Windows 알림 표시
- [ ] 발행 실패 시 트레이 아이콘 빨간색 + 에러 알림
- [ ] 트레이 메뉴 "로그 보기"에서 최근 로그 확인 가능

---

### Step 5: 빌드, 패키징, 배포

**목표:** Windows `.exe` 인스톨러 생성 및 대시보드에서 다운로드 가능

**작업 내용:**
- `electron-builder` 설정 (`electron-builder.yml` 또는 `package.json` 내):
  - Target: `nsis` (Windows 인스톨러)
  - App name: "하얀치과 마케팅 워커"
  - 아이콘 설정
  - `extraResources`로 Playwright 브라우저 바이너리 포함 여부 결정
    - 옵션 A: 포함 (인스톨러 크기 ~200MB 증가, 오프라인 설치 가능)
    - 옵션 B: 미포함 (첫 실행 시 다운로드, 인스톨러 ~30MB)
- 빌드 스크립트: `npm run build:win` -> electron-builder 실행
- 대시보드 배포:
  - 빌드된 `.exe`를 Supabase Storage 또는 별도 호스팅에 업로드
  - 기존 `WorkerInstallBanner` 컴포넌트 수정: tarball 대신 `.exe` 다운로드 링크
  - `/api/marketing/worker-api/download` 라우트 수정: OS 감지 후 `.exe` URL 리다이렉트

**Acceptance Criteria:**
- [ ] `npm run build:win` 실행 시 `.exe` 인스톨러 생성
- [ ] 인스톨러 실행 -> 설치 -> 앱 실행 -> 트레이 아이콘 표시 (E2E)
- [ ] 대시보드 `/admin/marketing`에서 "워커 다운로드" 버튼 클릭 시 `.exe` 다운로드
- [ ] 설치된 앱이 Windows 재부팅 후 자동 시작 (설정 활성화 시)

---

## Success Criteria

1. Windows 사용자가 대시보드에서 `.exe`를 다운로드-설치-실행하면, 별도 설정 없이 (API Key만 입력) 마케팅 워커가 동작한다.
2. 시스템 트레이에 상주하며 상태를 확인할 수 있다.
3. 기존 CLI 워커(`marketing-worker/`)는 변경 없이 계속 동작한다 (하위 호환).
4. 발행 성공/실패 시 Windows 알림이 표시된다.

---

## Open Questions

아래 항목은 구현 시점에 결정이 필요하다:

1. **Playwright 번들 포함 여부**: 인스톨러에 Chromium을 포함할지(~200MB), 첫 실행 시 다운로드할지(~30MB 인스톨러). 사용자 네트워크 환경에 따라 결정.
2. **node-cron vs setInterval**: Electron main process에서 `node-cron`이 정상 동작하는지 확인 필요. 문제 있으면 `setInterval`로 전환.
3. **로그 뷰어 구현 수준**: MVP에서는 트레이 툴팁 + 파일 로그로 충분한지, 별도 로그 윈도우가 필요한지.
4. **인스톨러 호스팅**: Supabase Storage (5GB 무료), GitHub Releases, 또는 Vercel 정적 파일 중 어디에 호스팅할지.
5. **macOS 지원 시점**: 현재 Mac mini 서버에서는 CLI 워커로 충분하지만, 추후 macOS `.dmg` 빌드 필요 여부.
