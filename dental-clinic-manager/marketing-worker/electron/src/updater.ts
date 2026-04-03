import { autoUpdater } from 'electron-updater';
import { Notification } from 'electron';
import { log } from './logger';

const CHECK_INTERVAL = 60 * 60 * 1000; // 1시간마다 체크
let checkTimer: ReturnType<typeof setInterval> | null = null;
// 수동 체크 시에만 모든 결과를 알림으로 표시
let isManualCheck = false;

function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

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
    notify('클리닉 매니저 워커', `새 버전 v${info.version}을 다운로드 중입니다.`);
    isManualCheck = false;
  });

  autoUpdater.on('update-not-available', () => {
    log('info', '[Updater] 최신 버전 사용 중');
    if (isManualCheck) {
      notify('클리닉 매니저 워커', '현재 최신 버전을 사용 중입니다.');
      isManualCheck = false;
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    log('info', `[Updater] 다운로드 ${Math.round(progress.percent)}%`);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log('info', `[Updater] 업데이트 다운로드 완료: v${info.version}`);
    notify('클리닉 매니저 워커 업데이트', `v${info.version} 다운로드 완료. 다음 재시작 시 자동 설치됩니다.`);
    isManualCheck = false;
  });

  autoUpdater.on('error', (err) => {
    log('error', `[Updater] 오류: ${err.message}`);
    if (isManualCheck) {
      notify('클리닉 매니저 워커', '업데이트 확인에 실패했습니다. 네트워크를 확인해주세요.');
      isManualCheck = false;
    }
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

/**
 * 수동 업데이트 확인 (트레이 메뉴에서 호출)
 * 결과를 Notification으로 표시
 */
export function checkForUpdatesManually(): void {
  isManualCheck = true;
  notify('클리닉 매니저 워커', '업데이트를 확인하고 있습니다...');
  autoUpdater.checkForUpdates().catch((err) => {
    log('error', `[Updater] 수동 체크 실패: ${err.message}`);
    notify('클리닉 매니저 워커', '업데이트 확인에 실패했습니다. 네트워크를 확인해주세요.');
    isManualCheck = false;
  });
}

export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
