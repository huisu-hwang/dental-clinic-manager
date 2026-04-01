import { autoUpdater } from 'electron-updater';
import { Notification } from 'electron';
import { log } from './logger';

const CHECK_INTERVAL = 60 * 60 * 1000; // 1시간마다 체크
let checkTimer: ReturnType<typeof setInterval> | null = null;

export function initAutoUpdater(): void {
  // 로그 설정
  autoUpdater.logger = {
    info: (msg: any) => log('info', `[Updater] ${msg}`),
    warn: (msg: any) => log('warn', `[Updater] ${msg}`),
    error: (msg: any) => log('error', `[Updater] ${msg}`),
    debug: (msg: any) => log('info', `[Updater:debug] ${msg}`),
  };

  // 자동 다운로드 활성화
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // 이벤트 핸들러
  autoUpdater.on('checking-for-update', () => {
    log('info', '[Updater] 업데이트 확인 중...');
  });

  autoUpdater.on('update-available', (info) => {
    log('info', `[Updater] 새 버전 발견: v${info.version}`);
    if (Notification.isSupported()) {
      new Notification({
        title: '클리닉 매니저 워커',
        body: `새 버전 v${info.version}을 다운로드 중입니다.`,
      }).show();
    }
  });

  autoUpdater.on('update-not-available', () => {
    log('info', '[Updater] 최신 버전 사용 중');
  });

  autoUpdater.on('download-progress', (progress) => {
    log('info', `[Updater] 다운로드 ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('info', `[Updater] 업데이트 다운로드 완료: v${info.version}`);
    if (Notification.isSupported()) {
      new Notification({
        title: '클리닉 매니저 워커 업데이트',
        body: `v${info.version} 다운로드 완료. 다음 재시작 시 자동 설치됩니다.`,
      }).show();
    }
  });

  autoUpdater.on('error', (err) => {
    log('error', `[Updater] 오류: ${err.message}`);
  });

  // 첫 체크 (앱 시작 30초 후)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log('error', `[Updater] 첫 체크 실패: ${err.message}`);
    });
  }, 30000);

  // 주기적 체크 (1시간마다)
  checkTimer = setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      log('error', `[Updater] 주기적 체크 실패: ${err.message}`);
    });
  }, CHECK_INTERVAL);
}

export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
