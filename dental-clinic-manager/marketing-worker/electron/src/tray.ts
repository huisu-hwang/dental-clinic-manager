import { Tray, Menu, app, Notification, nativeImage } from 'electron';
import path from 'path';
import { getConfig, setConfig } from './config-store';
import { start as startWorker, stop as stopWorker, getStatus } from './worker-bridge';
import { createSetupWindow } from './setup-window';
import { log } from './logger';

// ============================================
// 시스템 트레이 관리
// ============================================

let tray: Tray | null = null;
let currentStatusLabel = '중지됨';

export function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.ico');
  let icon = nativeImage.createFromPath(iconPath);

  // ico 파일이 없으면 빈 이미지 사용 (개발 중 fallback)
  if (icon.isEmpty()) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('하얀치과 마케팅 워커 - 중지됨');
  rebuildMenu();
  log('info', '[Tray] 트레이 생성 완료');
}

function rebuildMenu(): void {
  if (!tray) return;

  const cfg = getConfig();
  const status = getStatus();
  const isRunning = status === 'running';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: `상태: ${currentStatusLabel}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: isRunning ? '워커 중지' : '워커 시작',
      click: async () => {
        if (isRunning) {
          await stopWorker();
        } else {
          await startWorker();
        }
        rebuildMenu();
      },
    },
    { type: 'separator' },
    {
      label: '설정 열기',
      click: () => {
        createSetupWindow(() => {
          log('info', '[Tray] 설정 재저장: 워커 재시작');
          startWorker();
        });
      },
    },
    {
      label: '시작 시 자동 실행',
      type: 'checkbox',
      checked: cfg.autoStart,
      click: (menuItem) => {
        setConfig({ autoStart: menuItem.checked });
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true,
          path: process.execPath,
          args: ['--hidden'],
        });
        log('info', `[Tray] 자동 실행: ${menuItem.checked}`);
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * 상태 업데이트 - 트레이 툴팁 + 메뉴 갱신
 */
export function updateTrayStatus(
  status: 'running' | 'stopped' | 'error',
  message?: string
): void {
  const labels: Record<string, string> = {
    running: '실행 중',
    stopped: '중지됨',
    error: '오류',
  };

  currentStatusLabel = message ? `${labels[status]}: ${message}` : labels[status];

  if (tray) {
    tray.setToolTip(`하얀치과 마케팅 워커 - ${currentStatusLabel}`);
  }

  rebuildMenu();
  log('info', `[Tray] 상태 업데이트: ${currentStatusLabel}`);
}

/**
 * 발행 성공 Notification
 */
export function notifyPublishSuccess(title: string, url?: string): void {
  if (!Notification.isSupported()) return;
  new Notification({
    title: '발행 성공',
    body: `"${title}" 발행이 완료되었습니다.${url ? `\n${url}` : ''}`,
  }).show();
}

/**
 * 발행 실패 Notification
 */
export function notifyPublishError(title: string, error?: string): void {
  if (!Notification.isSupported()) return;
  new Notification({
    title: '발행 실패',
    body: `"${title}" 발행에 실패했습니다.${error ? `\n${error}` : ''}`,
  }).show();
}
