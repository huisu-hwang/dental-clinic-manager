import { BrowserWindow, ipcMain, app } from 'electron';
import path from 'path';
import { getStatus as getWorkerStatus, start as startWorker, stop as stopWorker } from './worker-bridge';
import { getScrapingStatus } from './scraping-bridge';
import { getSeoStatus } from './seo-bridge';
import { getEmailMonitorStatus } from './email-bridge';
import { getDentwebStatus } from './dentweb-bridge';
import { Logger } from './logger';
import { getVersionInfo } from './updater';
import { getUpdateMeta } from './config-store';

// ============================================
// 상태 창 관리
// ============================================

const log = new Logger('StatusWindow');

let statusWindow: BrowserWindow | null = null;

export function createStatusWindow(): void {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.focus();
    return;
  }

  statusWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: true,
    frame: true,
    title: `클리닉 매니저 워커 v${app.getVersion()}`,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // loadFile 후 page가 title을 overwrite하지 않도록 명시적으로 유지
  statusWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  const htmlPath = path.join(__dirname, '..', 'renderer', 'status.html');
  statusWindow.loadFile(htmlPath);
  statusWindow.setMenuBarVisibility(false);

  statusWindow.on('closed', () => {
    statusWindow = null;
    unregisterIpcHandlers();
  });

  registerIpcHandlers();
  log.info('상태 창 생성 완료');
}

function registerIpcHandlers(): void {
  // 현재 워커 상태 반환
  ipcMain.removeHandler('get-worker-status');
  ipcMain.handle('get-worker-status', () => {
    return {
      worker: getWorkerStatus(),
      scraping: getScrapingStatus(),
      seo: getSeoStatus(),
      email: getEmailMonitorStatus(),
      dentweb: getDentwebStatus(),
    };
  });

  // 워커 시작/중지 토글
  ipcMain.removeHandler('toggle-worker');
  ipcMain.handle('toggle-worker', async () => {
    const current = getWorkerStatus();
    if (current === 'running') {
      stopWorker();
      log.info('워커 중지 (상태 창에서 요청)');
      return { status: 'stopped' };
    } else {
      await startWorker();
      log.info('워커 시작 (상태 창에서 요청)');
      return { status: 'running' };
    }
  });

  // 버전 정보 반환
  ipcMain.removeHandler('get-version-info');
  ipcMain.handle('get-version-info', () => {
    const versionInfo = getVersionInfo();
    const updateMeta = getUpdateMeta();
    return { ...versionInfo, ...updateMeta };
  });

  // 최근 로그 반환
  ipcMain.removeHandler('get-logs');
  ipcMain.handle('get-logs', () => {
    return Logger.getRecentLogs(100);
  });
}

function unregisterIpcHandlers(): void {
  ipcMain.removeHandler('get-worker-status');
  ipcMain.removeHandler('toggle-worker');
  ipcMain.removeHandler('get-version-info');
  ipcMain.removeHandler('get-logs');
}

export function closeStatusWindow(): void {
  if (statusWindow && !statusWindow.isDestroyed()) {
    statusWindow.close();
  }
}
