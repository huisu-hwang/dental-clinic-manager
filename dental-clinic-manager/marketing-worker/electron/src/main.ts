import { app } from 'electron';
import path from 'path';
import { isFirstRun, getConfig, setConfig } from './config-store';
import { createTray, updateTrayStatus } from './tray';
import { createSetupWindow } from './setup-window';
import { start as startWorker, stop as stopWorker, onStatusChange, onPublishResult } from './worker-bridge';
import { log } from './logger';

// ============================================
// Electron 메인 프로세스 진입점
// ============================================

// 단일 인스턴스 잠금
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// 두 번째 인스턴스 실행 시 기존 창에 포커스
app.on('second-instance', () => {
  log('info', '[Main] 두 번째 인스턴스 감지: 기존 인스턴스로 포커스');
});

async function onAppReady(): Promise<void> {
  log('info', '[Main] App ready');

  // 트레이 생성
  createTray();

  // 워커 상태 변경 -> 트레이 업데이트
  onStatusChange((status, message) => {
    updateTrayStatus(status, message);
  });

  // 발행 결과 -> Notification
  onPublishResult((result) => {
    // Notification은 tray.ts에서 처리하므로 여기서는 로그만
    if (result.success) {
      log('info', `[Main] 발행 성공: ${result.title || ''} (${result.url || ''})`);
    } else {
      log('warn', `[Main] 발행 실패: ${result.error || ''}`);
    }
  });

  // 첫 실행 여부 확인
  if (isFirstRun()) {
    log('info', '[Main] 첫 실행: 설정 창 표시');
    createSetupWindow(async () => {
      log('info', '[Main] 설정 완료: 워커 시작');
      applyAutoStart();
      await startWorker();
    });
  } else {
    log('info', '[Main] 설정 존재: 워커 시작');
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

// 모든 창이 닫혀도 종료하지 않음 (트레이 상주)
app.on('window-all-closed', () => {
  // 트레이에 상주 - 종료하지 않음
});

app.on('before-quit', async () => {
  log('info', '[Main] 앱 종료 중...');
  await stopWorker();
});
