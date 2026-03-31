import { BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { getConfig, setConfig } from './config-store';
import { log } from './logger';

// ============================================
// 첫 실행 설정 화면
// ============================================

let setupWindow: BrowserWindow | null = null;

export function createSetupWindow(onSaved: () => void): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 500,
    height: 400,
    resizable: false,
    frame: true,
    title: '클리닉 매니저 워커 설정',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const htmlPath = path.join(__dirname, '..', 'renderer', 'setup.html');
  setupWindow.loadFile(htmlPath);
  setupWindow.setMenuBarVisibility(false);

  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  // IPC 핸들러 등록 (중복 등록 방지)
  registerIpcHandlers(onSaved);
}

function registerIpcHandlers(onSaved: () => void): void {
  // 현재 설정 조회
  ipcMain.removeHandler('get-config');
  ipcMain.handle('get-config', () => {
    return getConfig();
  });

  // 연결 테스트
  ipcMain.removeHandler('test-connection');
  ipcMain.handle('test-connection', async (_event, data: { dashboardUrl: string; workerApiKey: string }) => {
    try {
      const url = `${data.dashboardUrl.replace(/\/$/, '')}/api/marketing/worker-api/poll`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${data.workerApiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        return { success: true, message: '연결 성공!' };
      }
      return { success: false, message: `연결 실패 (HTTP ${res.status})` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `연결 오류: ${msg}` };
    }
  });

  // 설정 저장
  ipcMain.removeHandler('save-config');
  ipcMain.handle('save-config', (_event, data: { dashboardUrl: string; workerApiKey: string }) => {
    try {
      setConfig({
        dashboardUrl: data.dashboardUrl,
        workerApiKey: data.workerApiKey,
      });
      log('info', `[SetupWindow] 설정 저장 완료: ${data.dashboardUrl}`);

      // 창 닫기 + 콜백 실행
      setTimeout(() => {
        setupWindow?.close();
        onSaved();
      }, 300);

      return { success: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('error', `[SetupWindow] 설정 저장 실패: ${msg}`);
      return { success: false, message: msg };
    }
  });
}

export function closeSetupWindow(): void {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.close();
  }
}
