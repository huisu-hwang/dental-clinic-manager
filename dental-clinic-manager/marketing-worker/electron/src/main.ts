import { app, Notification } from 'electron';
import { isFirstRun, getConfig, setConfig } from './config-store';
import { createTray, updateTrayStatus } from './tray';
import { start as startWorker, stop as stopWorker, onStatusChange, onPublishResult } from './worker-bridge';
import { log } from './logger';

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

async function onAppReady(): Promise<void> {
  log('info', '[Main] App ready');

  createTray();

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

  applyAutoStart();
  await startWorker();
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

app.whenReady().then(onAppReady).catch((err) => {
  log('error', `[Main] 치명적 오류: ${err instanceof Error ? err.message : String(err)}`);
  app.quit();
});

app.on('window-all-closed', () => {
  // 트레이에 상주 - 종료하지 않음
});

app.on('before-quit', async () => {
  log('info', '[Main] 앱 종료 중...');
  await stopWorker();
});
