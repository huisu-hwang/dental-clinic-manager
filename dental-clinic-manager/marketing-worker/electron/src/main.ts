import { app, Notification } from 'electron';
import { isFirstRun, getConfig, setConfig } from './config-store';
import { createTray, updateTrayStatus } from './tray';
import { start as startWorker, stop as stopWorker, onStatusChange, onPublishResult } from './worker-bridge';
import { createSetupWindow } from './setup-window';
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

// 자동 등록 대신 Setup 창 표시로 변경됨

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

  // 첫 실행 여부 체크 (또는 API Key가 없는 경우)
  const cfg = getConfig();
  if (isFirstRun() || !cfg.workerApiKey) {
    log('info', '[Main] 설정 필요: 로그인(설정) 창 표시');
    createSetupWindow(async () => {
      log('info', '[Main] 설정 완료. 워커를 시작합니다.');
      if (Notification.isSupported()) {
        new Notification({
          title: '클리닉 매니저 워커',
          body: '설정이 완료되었습니다. 워커가 시작됩니다.',
        }).show();
      }
      applyAutoStart();
      await startWorker();
    });
  } else {
    log('info', '[Main] 설정 완료 상태. 자동 시작');
    applyAutoStart();
    await startWorker();
  }
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
