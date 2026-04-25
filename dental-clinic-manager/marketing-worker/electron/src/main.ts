import { app, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { isFirstRun, getConfig, setConfig, getUpdateMeta, setUpdateMeta } from './config-store';
import { createTray, updateTrayStatus } from './tray';
import { start as startWorker, stop as stopWorker, onStatusChange, onPublishResult } from './worker-bridge';
import { startScraping, stopScraping, onScrapingStatusChange } from './scraping-bridge';
import { startSeoWorker, stopSeoWorker, onSeoStatusChange } from './seo-bridge';
import { startEmailMonitor, stopEmailMonitor, onEmailStatusChange } from './email-bridge';
import { startDentwebSync, stopDentwebSync, onDentwebStatusChange } from './dentweb-bridge';
import { log } from './logger';
import { initAutoUpdater, stopAutoUpdater, onBeforeUpdateRestart } from './updater';

// ============================================
// Electron 메인 프로세스 진입점
// 설정 화면 없이 자동으로 API Key를 등록하고 시작
// ============================================

const DASHBOARD_URL = 'https://www.hi-clinic.co.kr';

// 단일 인스턴스 잠금
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on('second-instance', () => {
  log('info', '[Main] 두 번째 인스턴스 감지: 기존 인스턴스로 포커스');
});

/**
 * 대시보드에서 API Key를 자동으로 가져와 설정
 */
async function autoRegister(): Promise<boolean> {
  try {
    log('info', '[Main] API Key 자동 등록 시도...');
    const res = await fetch(`${DASHBOARD_URL}/api/marketing/worker-api/register`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      log('error', `[Main] 자동 등록 실패 (HTTP ${res.status})`);
      return false;
    }
    const data = await res.json();
    if (data.apiKey) {
      setConfig({
        dashboardUrl: data.dashboardUrl || DASHBOARD_URL,
        workerApiKey: data.apiKey,
      });
      log('info', '[Main] API Key 자동 등록 완료');
      return true;
    }
    log('error', '[Main] API Key가 응답에 없음');
    return false;
  } catch (err) {
    log('error', `[Main] 자동 등록 오류: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Playwright 브라우저 경로 셋업
 * - 패키지된 앱: extraResources로 번들된 'browsers' 폴더 우선
 * - 개발 환경 / 번들 누락 시: 사용자 데이터 폴더의 'playwright-browsers'
 * 시스템 기본 경로(`AppData\Local\ms-playwright`)에 의존하지 않도록 명시 설정
 */
function setupPlaywrightBrowsersPath(): string {
  if (app.isPackaged) {
    const bundledPath = path.join(process.resourcesPath, 'browsers');
    if (fs.existsSync(bundledPath)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = bundledPath;
      log('info', `[Playwright] 번들된 브라우저 사용: ${bundledPath}`);
      return bundledPath;
    }
  }
  const userPath = path.join(app.getPath('userData'), 'playwright-browsers');
  process.env.PLAYWRIGHT_BROWSERS_PATH = userPath;
  log('info', `[Playwright] 사용자 데이터 경로 사용: ${userPath}`);
  return userPath;
}

/**
 * Chromium 누락 검사 + 자동 설치
 * - 누락 시 Electron의 Node 모드로 playwright cli를 실행하여 자동 다운로드
 * - 인터넷 미연결 / 권한 문제로 실패하더라도 발행 단계에서 명확한 에러로 실패 → 무한 대기 방지
 */
async function ensureChromiumInstalled(targetBrowsersPath: string): Promise<void> {
  try {
    const playwrightModule = require('playwright') as { chromium: { executablePath: () => string } };
    const execPath = playwrightModule.chromium.executablePath();
    if (execPath && fs.existsSync(execPath)) {
      log('info', `[Playwright] Chromium 확인 완료: ${execPath}`);
      return;
    }
    log('warn', `[Playwright] Chromium 누락 감지 (예상 경로: ${execPath || '미확인'})`);
  } catch (err) {
    log('warn', `[Playwright] Chromium 검사 오류: ${err instanceof Error ? err.message : String(err)}`);
  }

  log('info', `[Playwright] Chromium 자동 설치 시작 → ${targetBrowsersPath}`);

  await new Promise<void>((resolve) => {
    try {
      // playwright 패키지의 cli 경로 확인
      const playwrightPkg = require.resolve('playwright/package.json');
      const playwrightDir = path.dirname(playwrightPkg);
      const cliCandidates = [
        path.join(playwrightDir, 'cli.js'),
        path.join(playwrightDir, 'lib', 'cli', 'cli.js'),
      ];
      const cliPath = cliCandidates.find((p) => fs.existsSync(p));
      if (!cliPath) {
        log('error', '[Playwright] cli.js 경로를 찾을 수 없음 → 자동 설치 불가');
        resolve();
        return;
      }

      // Electron 자체 바이너리를 Node 모드로 실행 (외부 node/npx 의존 제거)
      const child = spawn(process.execPath, [cliPath, 'install', 'chromium'], {
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: '1',
          PLAYWRIGHT_BROWSERS_PATH: targetBrowsersPath,
        },
        stdio: 'pipe',
      });

      let stderr = '';
      child.stdout?.on('data', (d) => log('info', `[Playwright Install] ${d.toString().trim()}`));
      child.stderr?.on('data', (d) => {
        const msg = d.toString().trim();
        stderr += msg;
        log('warn', `[Playwright Install ERR] ${msg}`);
      });

      const timeout = setTimeout(() => {
        try { child.kill(); } catch { /* ignore */ }
        log('error', '[Playwright] Chromium 설치 타임아웃 (10분 초과)');
        resolve();
      }, 10 * 60 * 1000);

      child.on('exit', (code) => {
        clearTimeout(timeout);
        if (code === 0) {
          log('info', '[Playwright] Chromium 자동 설치 완료');
        } else {
          log('error', `[Playwright] Chromium 자동 설치 실패 (exit ${code}): ${stderr.slice(0, 500)}`);
        }
        resolve();
      });

      child.on('error', (err) => {
        clearTimeout(timeout);
        log('error', `[Playwright] Chromium 자동 설치 spawn 오류: ${err.message}`);
        resolve();
      });
    } catch (err) {
      log('error', `[Playwright] Chromium 자동 설치 시도 오류: ${err instanceof Error ? err.message : String(err)}`);
      resolve();
    }
  });
}

async function onAppReady(): Promise<void> {
  log('info', '[Main] App ready');

  // Playwright 브라우저 경로 설정 + 누락 시 자동 설치
  // - 마케팅 워커가 발행 시 Chromium을 launch하기 전에 환경을 보장한다.
  const browsersPath = setupPlaywrightBrowsersPath();
  await ensureChromiumInstalled(browsersPath);

  // 최초 설치 시각 기록
  const meta = getUpdateMeta();
  if (!meta.installedAt) {
    setUpdateMeta({ installedAt: new Date().toISOString() });
  }

  createTray();
  initAutoUpdater();

  // 업데이트 재시작 전 모든 워커 브릿지 정리
  onBeforeUpdateRestart(() => {
    log('info', '[Main] 업데이트 재시작 전 워커 정리 중...');
    stopScraping();
    stopSeoWorker();
    stopEmailMonitor();
    stopDentwebSync();
    stopWorker();
  });

  onStatusChange((status, message) => {
    updateTrayStatus(status, message);
  });

  onPublishResult((result) => {
    if (result.success) {
      log('info', `[Main] 발행 성공: ${result.title || ''} (${result.url || ''})`);
    } else {
      log('warn', `[Main] 발행 실패: ${result.error || ''}`);
    }
  });

  // 첫 실행: 자동으로 API Key 등록
  if (isFirstRun()) {
    log('info', '[Main] 첫 실행: 자동 설정 시작');
    const registered = await autoRegister();
    if (registered) {
      if (Notification.isSupported()) {
        new Notification({
          title: '클리닉 매니저 워커',
          body: '설정이 완료되었습니다. 워커가 시작됩니다.',
        }).show();
      }
    } else {
      if (Notification.isSupported()) {
        new Notification({
          title: '클리닉 매니저 워커',
          body: '자동 설정에 실패했습니다. 대시보드에서 워커 API Key를 확인해주세요.',
        }).show();
      }
      updateTrayStatus('error', '설정 실패');
      return;
    }
  }

  onScrapingStatusChange((status, message) => {
    if (status === 'scraping') {
      log('info', `[Main] 스크래핑: ${message || '진행 중'}`);
    }
  });

  onSeoStatusChange((status, message) => {
    if (status === 'analyzing') {
      log('info', `[Main] SEO 분석: ${message || '진행 중'}`);
    }
  });

  onEmailStatusChange((status, message) => {
    if (status === 'processing') {
      log('info', `[Main] 이메일: ${message || '처리 중'}`);
    }
  });

  onDentwebStatusChange((status, message) => {
    if (status === 'syncing') {
      log('info', `[Main] 덴트웹: ${message || '동기화 중'}`);
    } else if (status === 'error' || status === 'db_disconnected') {
      log('warn', `[Main] 덴트웹: ${message || '오류'}`);
    }
  });

  applyAutoStart();
  await startWorker();
  startScraping();
  startSeoWorker();
  startEmailMonitor();

  // DentWeb 브릿지: 항상 시작 (내부에서 auto-register → enable 처리)
  // 첫 실행 시 clinic 설정이 없더라도 autoRegisterDentweb()이 worker API Key로 설정 조회.
  startDentwebSync().catch((err) => {
    log('error', `[Main] DentWeb 시작 실패: ${err instanceof Error ? err.message : String(err)}`);
  });
}

function applyAutoStart(): void {
  const cfg = getConfig();
  app.setLoginItemSettings({
    openAtLogin: cfg.autoStart,
    openAsHidden: true,
    path: process.execPath,
    args: ['--hidden'],
  });
}

// macOS: 트레이 전용 앱 — Dock 아이콘 숨기기
if (process.platform === 'darwin' && app.dock) {
  app.dock.hide();
}

app.whenReady().then(onAppReady).catch((err) => {
  log('error', `[Main] 치명적 오류: ${err instanceof Error ? err.message : String(err)}`);
  app.quit();
});

app.on('window-all-closed', () => {
  // 트레이에 상주 - 종료하지 않음
});

app.on('before-quit', async () => {
  log('info', '[Main] 앱 종료 중...');
  stopAutoUpdater();
  stopScraping();
  stopSeoWorker();
  stopEmailMonitor();
  stopDentwebSync();
  await stopWorker();
});
