import Store from 'electron-store';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// ============================================
// 설정 저장소 (electron-store 기반)
// main.ts, tray.ts, worker-bridge.ts에서 사용하는 함수형 API
// ============================================

interface StoreSchema {
  dashboardUrl: string;
  workerApiKey: string;
  autoStart: boolean;
  autoUpdate: boolean;
  headless: boolean;
  isConfigured: boolean;
  // 업데이트 메타데이터
  lastUpdateCheck: string;         // 마지막 업데이트 확인 시각 (ISO)
  lastUpdatedAt: string;           // 마지막 업데이트 설치 시각 (ISO)
  installedAt: string;             // 최초 설치 시각 (ISO)
  currentVersionReleasedAt: string; // 현재 버전 GitHub 릴리즈 날짜 (ISO)
  latestVersion: string;           // 확인된 최신 버전
  updateStatus: string;            // 업데이트 상태 (up-to-date, available, downloading, downloaded)
  githubToken: string;       // GitHub PAT (private repo 업데이트용)
  // DentWeb bridge
  dentwebEnabled: boolean;
  dentwebDbServer: string;
  dentwebDbPort: number;
  dentwebDbDatabase: string;
  dentwebDbAuthType: 'windows' | 'sql';
  dentwebDbUser: string;
  dentwebDbPassword: string;
  dentwebClinicId: string;
  dentwebApiKey: string;
  dentwebSyncInterval: number;
  dentwebLastSyncDate: string;
  dentwebLastSyncStatus: string;
  dentwebLastSyncPatientCount: number;
}

export interface AppConfig {
  dashboardUrl: string;
  workerApiKey: string;
  autoStart: boolean;
  autoUpdate: boolean;
  headless: boolean;
  // DentWeb bridge
  dentwebEnabled: boolean;
  dentwebDbServer: string;
  dentwebDbPort: number;
  dentwebDbDatabase: string;
  dentwebDbAuthType: 'windows' | 'sql';
  dentwebDbUser: string;
  dentwebDbPassword: string;
  dentwebClinicId: string;
  dentwebApiKey: string;
  dentwebSyncInterval: number;
  dentwebLastSyncDate: string;
  dentwebLastSyncStatus: string;
  dentwebLastSyncPatientCount: number;
}

export interface UpdateMeta {
  lastUpdateCheck: string;
  lastUpdatedAt: string;
  installedAt: string;
  currentVersionReleasedAt: string;
  latestVersion: string;
  updateStatus: string;
}

const storeDefaults: StoreSchema = {
  dashboardUrl: 'https://www.hi-clinic.co.kr',
  workerApiKey: '',
  autoStart: true,
  autoUpdate: true,
  headless: true,
  isConfigured: false,
  lastUpdateCheck: '',
  lastUpdatedAt: '',
  installedAt: '',
  currentVersionReleasedAt: '',
  latestVersion: '',
  updateStatus: 'up-to-date',
  githubToken: '',
  // DentWeb bridge defaults
  dentwebEnabled: false,
  dentwebDbServer: 'localhost',
  dentwebDbPort: 1433,
  dentwebDbDatabase: 'DENTWEBDB',
  dentwebDbAuthType: 'windows',
  dentwebDbUser: '',
  dentwebDbPassword: '',
  dentwebClinicId: '',
  dentwebApiKey: '',
  dentwebSyncInterval: 300,
  dentwebLastSyncDate: '',
  dentwebLastSyncStatus: '',
  dentwebLastSyncPatientCount: 0,
};

function createStore(): Store<StoreSchema> {
  try {
    return new Store<StoreSchema>({
      name: 'clinic-manager-worker',
      defaults: storeDefaults,
    });
  } catch (err) {
    // 설정 파일이 손상된 경우: 백업 후 삭제하고 재생성
    console.error('[config-store] 설정 파일 손상 감지, 초기화 진행:', err);
    try {
      const userDataPath = app.getPath('userData');
      const configPath = path.join(userDataPath, 'clinic-manager-worker.json');
      if (fs.existsSync(configPath)) {
        const backupPath = configPath + '.corrupt.' + Date.now();
        fs.renameSync(configPath, backupPath);
        console.log(`[config-store] 손상된 파일 백업: ${backupPath}`);
      }
    } catch (backupErr) {
      console.error('[config-store] 백업 실패, 파일 직접 삭제 시도:', backupErr);
      try {
        const userDataPath = app.getPath('userData');
        const configPath = path.join(userDataPath, 'clinic-manager-worker.json');
        fs.unlinkSync(configPath);
      } catch { /* 무시 */ }
    }
    return new Store<StoreSchema>({
      name: 'clinic-manager-worker',
      defaults: storeDefaults,
    });
  }
}

const store = createStore();

/**
 * 첫 실행 여부 확인
 */
export function isFirstRun(): boolean {
  return !store.get('isConfigured') || !store.get('workerApiKey');
}

/**
 * 전체 설정 반환
 */
export function getConfig(): AppConfig {
  return {
    dashboardUrl: store.get('dashboardUrl'),
    workerApiKey: store.get('workerApiKey'),
    autoStart: store.get('autoStart'),
    autoUpdate: store.get('autoUpdate'),
    headless: store.get('headless'),
    // DentWeb bridge
    dentwebEnabled: store.get('dentwebEnabled'),
    dentwebDbServer: store.get('dentwebDbServer'),
    dentwebDbPort: store.get('dentwebDbPort'),
    dentwebDbDatabase: store.get('dentwebDbDatabase'),
    dentwebDbAuthType: store.get('dentwebDbAuthType'),
    dentwebDbUser: store.get('dentwebDbUser'),
    dentwebDbPassword: store.get('dentwebDbPassword'),
    dentwebClinicId: store.get('dentwebClinicId'),
    dentwebApiKey: store.get('dentwebApiKey'),
    dentwebSyncInterval: store.get('dentwebSyncInterval'),
    dentwebLastSyncDate: store.get('dentwebLastSyncDate'),
    dentwebLastSyncStatus: store.get('dentwebLastSyncStatus'),
    dentwebLastSyncPatientCount: store.get('dentwebLastSyncPatientCount'),
  };
}

/**
 * 설정 업데이트 (부분 업데이트 지원)
 */
export function setConfig(partial: Partial<AppConfig>): void {
  if (partial.dashboardUrl !== undefined) store.set('dashboardUrl', partial.dashboardUrl);
  if (partial.workerApiKey !== undefined) store.set('workerApiKey', partial.workerApiKey);
  if (partial.autoStart !== undefined) store.set('autoStart', partial.autoStart);
  if (partial.autoUpdate !== undefined) store.set('autoUpdate', partial.autoUpdate);
  if (partial.headless !== undefined) store.set('headless', partial.headless);
  // DentWeb bridge
  if (partial.dentwebEnabled !== undefined) store.set('dentwebEnabled', partial.dentwebEnabled);
  if (partial.dentwebDbServer !== undefined) store.set('dentwebDbServer', partial.dentwebDbServer);
  if (partial.dentwebDbPort !== undefined) store.set('dentwebDbPort', partial.dentwebDbPort);
  if (partial.dentwebDbDatabase !== undefined) store.set('dentwebDbDatabase', partial.dentwebDbDatabase);
  if (partial.dentwebDbAuthType !== undefined) store.set('dentwebDbAuthType', partial.dentwebDbAuthType);
  if (partial.dentwebDbUser !== undefined) store.set('dentwebDbUser', partial.dentwebDbUser);
  if (partial.dentwebDbPassword !== undefined) store.set('dentwebDbPassword', partial.dentwebDbPassword);
  if (partial.dentwebClinicId !== undefined) store.set('dentwebClinicId', partial.dentwebClinicId);
  if (partial.dentwebApiKey !== undefined) store.set('dentwebApiKey', partial.dentwebApiKey);
  if (partial.dentwebSyncInterval !== undefined) store.set('dentwebSyncInterval', partial.dentwebSyncInterval);
  if (partial.dentwebLastSyncDate !== undefined) store.set('dentwebLastSyncDate', partial.dentwebLastSyncDate);
  if (partial.dentwebLastSyncStatus !== undefined) store.set('dentwebLastSyncStatus', partial.dentwebLastSyncStatus);
  if (partial.dentwebLastSyncPatientCount !== undefined) store.set('dentwebLastSyncPatientCount', partial.dentwebLastSyncPatientCount);
  store.set('isConfigured', true);
}

/**
 * 업데이트 메타데이터 조회
 */
export function getUpdateMeta(): UpdateMeta {
  return {
    lastUpdateCheck: store.get('lastUpdateCheck'),
    lastUpdatedAt: store.get('lastUpdatedAt'),
    installedAt: store.get('installedAt'),
    currentVersionReleasedAt: store.get('currentVersionReleasedAt'),
    latestVersion: store.get('latestVersion'),
    updateStatus: store.get('updateStatus'),
  };
}

/**
 * 업데이트 메타데이터 저장
 */
export function setUpdateMeta(partial: Partial<UpdateMeta>): void {
  if (partial.lastUpdateCheck !== undefined) store.set('lastUpdateCheck', partial.lastUpdateCheck);
  if (partial.lastUpdatedAt !== undefined) store.set('lastUpdatedAt', partial.lastUpdatedAt);
  if (partial.installedAt !== undefined) store.set('installedAt', partial.installedAt);
  if (partial.currentVersionReleasedAt !== undefined) store.set('currentVersionReleasedAt', partial.currentVersionReleasedAt);
  if (partial.latestVersion !== undefined) store.set('latestVersion', partial.latestVersion);
  if (partial.updateStatus !== undefined) store.set('updateStatus', partial.updateStatus);
}

/**
 * GitHub 토큰 조회/설정 (private repo 업데이트용)
 */
export function getGithubToken(): string {
  return store.get('githubToken');
}

export function setGithubToken(token: string): void {
  store.set('githubToken', token);
}

/**
 * DentWeb 브릿지 설정만 반환
 */
export function getDentwebConfig() {
  return {
    enabled: store.get('dentwebEnabled'),
    dbServer: store.get('dentwebDbServer'),
    dbPort: store.get('dentwebDbPort'),
    dbDatabase: store.get('dentwebDbDatabase'),
    dbAuthType: store.get('dentwebDbAuthType'),
    dbUser: store.get('dentwebDbUser'),
    dbPassword: store.get('dentwebDbPassword'),
    clinicId: store.get('dentwebClinicId'),
    apiKey: store.get('dentwebApiKey'),
    syncInterval: store.get('dentwebSyncInterval'),
    lastSyncDate: store.get('dentwebLastSyncDate'),
    lastSyncStatus: store.get('dentwebLastSyncStatus'),
    lastSyncPatientCount: store.get('dentwebLastSyncPatientCount'),
  };
}

/**
 * 워커 환경변수로 변환 (기존 marketing-worker의 process.env에 주입)
 */
export function getWorkerEnvVars(): Record<string, string> {
  return {
    DASHBOARD_API_URL: store.get('dashboardUrl'),
    WORKER_API_KEY: store.get('workerApiKey'),
    MARKETING_WORKER_PORT: '4001',
  };
}
