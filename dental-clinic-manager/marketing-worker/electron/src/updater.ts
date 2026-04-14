import { autoUpdater } from 'electron-updater';
import { app, Notification } from 'electron';
import { log } from './logger';
import { getConfig, getGithubToken, setUpdateMeta } from './config-store';

const CHECK_INTERVAL = 30 * 60 * 1000; // 30분마다 체크
let checkTimer: ReturnType<typeof setInterval> | null = null;
// 수동 체크 시에만 모든 결과를 알림으로 표시
let isManualCheck = false;

// Graceful shutdown 콜백 (업데이트 재시작 전 호출)
const shutdownCallbacks: Array<() => void> = [];

/**
 * 업데이트 재시작 전 호출할 정리 콜백 등록
 */
export function onBeforeUpdateRestart(cb: () => void): void {
  shutdownCallbacks.push(cb);
}

function notify(title: string, body: string): void {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
}

export function initAutoUpdater(): void {
  // 로그 설정
  autoUpdater.logger = {
    info: (msg: unknown) => log('info', `[Updater] ${msg}`),
    warn: (msg: unknown) => log('warn', `[Updater] ${msg}`),
    error: (msg: unknown) => log('error', `[Updater] ${msg}`),
    debug: (msg: unknown) => log('info', `[Updater:debug] ${msg}`),
  };

  // 자동 다운로드 활성화
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = true;

  // Private repo 토큰 설정
  const ghToken = getGithubToken();
  if (ghToken) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'huisu-hwang',
      repo: 'dental-clinic-manager',
      token: ghToken,
    });
    log('info', '[Updater] GitHub 토큰 설정 완료 (private repo 지원)');
  }

  // 이벤트 핸들러
  autoUpdater.on('checking-for-update', () => {
    log('info', '[Updater] 업데이트 확인 중...');
    setUpdateMeta({ lastUpdateCheck: new Date().toISOString() });
  });

  autoUpdater.on('update-available', (info) => {
    log('info', `[Updater] 새 버전 발견: v${info.version}`);
    setUpdateMeta({
      latestVersion: info.version,
      updateStatus: 'downloading',
    });
    notify('클리닉 매니저 워커', `새 버전 v${info.version}을 다운로드 중입니다.`);
    isManualCheck = false;
  });

  autoUpdater.on('update-not-available', (info) => {
    log('info', '[Updater] 최신 버전 사용 중');
    setUpdateMeta({
      latestVersion: info.version,
      updateStatus: 'up-to-date',
      // 현재 버전의 GitHub 릴리즈 날짜 (서버에 배포된 날짜)
      currentVersionReleasedAt: info.releaseDate || '',
    });
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
    setUpdateMeta({
      latestVersion: info.version,
      updateStatus: 'downloaded',
      lastUpdatedAt: new Date().toISOString(),
    });
    notify('클리닉 매니저 워커 업데이트', `v${info.version} 다운로드 완료. 10초 후 자동 재시작됩니다.`);
    isManualCheck = false;

    // 10초 후 자동 재시작 (사용자에게 알림 볼 시간 제공)
    setTimeout(() => {
      log('info', '[Updater] 자동 재시작 시작...');
      try {
        // graceful shutdown 콜백 실행
        for (const cb of shutdownCallbacks) {
          try { cb(); } catch { /* ignore */ }
        }
      } catch (err) {
        log('error', `[Updater] Shutdown 콜백 오류: ${err instanceof Error ? err.message : String(err)}`);
      }
      autoUpdater.quitAndInstall(false, true);
    }, 10000);
  });

  autoUpdater.on('error', (err) => {
    log('error', `[Updater] 오류: ${err.message}`);
    setUpdateMeta({ updateStatus: 'up-to-date' });
    if (isManualCheck) {
      notify('클리닉 매니저 워커', '업데이트 확인에 실패했습니다. 네트워크를 확인해주세요.');
      isManualCheck = false;
    }
  });

  // 자동 업데이트 설정에 따라 자동 체크 시작
  startAutoCheckIfEnabled();
}

/**
 * 자동 업데이트 설정에 따라 주기적 체크 시작/중지
 */
export function startAutoCheckIfEnabled(): void {
  // 기존 타이머 정리
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }

  const cfg = getConfig();
  if (!cfg.autoUpdate) {
    log('info', '[Updater] 자동 업데이트 비활성화 상태');
    return;
  }

  log('info', '[Updater] 자동 업데이트 활성화');

  // 첫 체크 (앱 시작 30초 후)
  setTimeout(() => {
    if (!getConfig().autoUpdate) return;
    autoUpdater.checkForUpdates().catch((err) => {
      log('error', `[Updater] 첫 체크 실패: ${err.message}`);
    });
  }, 30000);

  // 주기적 체크 (30분마다)
  checkTimer = setInterval(() => {
    if (!getConfig().autoUpdate) return;
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

/**
 * 버전 정보 반환 (상태 창에서 사용)
 */
export function getVersionInfo() {
  return {
    currentVersion: app.getVersion(),
  };
}

export function stopAutoUpdater(): void {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}
