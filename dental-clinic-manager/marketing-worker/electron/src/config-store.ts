import Store from 'electron-store';

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
  lastUpdateCheck: string;   // 마지막 업데이트 확인 시각 (ISO)
  lastUpdatedAt: string;     // 마지막 업데이트 설치 시각 (ISO)
  latestVersion: string;     // 확인된 최신 버전
  updateStatus: string;      // 업데이트 상태 (up-to-date, available, downloading, downloaded)
  githubToken: string;       // GitHub PAT (private repo 업데이트용)
  // 덴트웹 브릿지 설정
  dentwebEnabled: boolean;
  dentwebDbServer: string;
  dentwebDbPort: number;
  dentwebDbDatabase: string;
  dentwebDbUser: string;
  dentwebDbPassword: string;
  dentwebDbUseWindowsAuth: boolean;
  dentwebClinicId: string;
  dentwebApiKey: string;
  dentwebSyncIntervalSeconds: number;
  dentwebSyncType: 'full' | 'incremental';
  // 덴트웹 동기화 상태 (이전 JSON state.ts 대체)
  dentwebLastSyncDate: string;
  dentwebLastSyncStatus: 'success' | 'error' | '';
  dentwebLastSyncPatientCount: number;
  dentwebTotalSyncs: number;
  dentwebConsecutiveErrors: number;
}

export interface AppConfig {
  dashboardUrl: string;
  workerApiKey: string;
  autoStart: boolean;
  autoUpdate: boolean;
  headless: boolean;
}

export interface UpdateMeta {
  lastUpdateCheck: string;
  lastUpdatedAt: string;
  latestVersion: string;
  updateStatus: string;
}

export interface DentwebConfig {
  enabled: boolean;
  dbServer: string;
  dbPort: number;
  dbDatabase: string;
  dbUser: string;
  dbPassword: string;
  dbUseWindowsAuth: boolean;
  clinicId: string;
  apiKey: string;
  syncIntervalSeconds: number;
  syncType: 'full' | 'incremental';
}

export interface DentwebState {
  lastSyncDate: string;
  lastSyncStatus: 'success' | 'error' | '';
  lastSyncPatientCount: number;
  totalSyncs: number;
  consecutiveErrors: number;
}

const store = new Store<StoreSchema>({
  name: 'clinic-manager-worker',
  defaults: {
    dashboardUrl: 'https://www.hi-clinic.co.kr',
    workerApiKey: '',
    autoStart: true,
    autoUpdate: true,
    headless: true,
    isConfigured: false,
    lastUpdateCheck: '',
    lastUpdatedAt: '',
    latestVersion: '',
    updateStatus: 'up-to-date',
    githubToken: '',
    // 덴트웹 브릿지 기본값 (원내 PC의 로컬 SQL Server)
    dentwebEnabled: false,
    dentwebDbServer: 'localhost',
    dentwebDbPort: 1433,
    dentwebDbDatabase: 'DENTWEBDB',
    dentwebDbUser: '',
    dentwebDbPassword: '',
    dentwebDbUseWindowsAuth: true,
    dentwebClinicId: '',
    dentwebApiKey: '',
    dentwebSyncIntervalSeconds: 300,
    dentwebSyncType: 'incremental',
    dentwebLastSyncDate: '',
    dentwebLastSyncStatus: '',
    dentwebLastSyncPatientCount: 0,
    dentwebTotalSyncs: 0,
    dentwebConsecutiveErrors: 0,
  },
});

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
  store.set('isConfigured', true);
}

/**
 * 업데이트 메타데이터 조회
 */
export function getUpdateMeta(): UpdateMeta {
  return {
    lastUpdateCheck: store.get('lastUpdateCheck'),
    lastUpdatedAt: store.get('lastUpdatedAt'),
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
 * 워커 환경변수로 변환 (기존 marketing-worker의 process.env에 주입)
 */
export function getWorkerEnvVars(): Record<string, string> {
  return {
    DASHBOARD_API_URL: store.get('dashboardUrl'),
    WORKER_API_KEY: store.get('workerApiKey'),
    MARKETING_WORKER_PORT: '4001',
  };
}

/**
 * 덴트웹 브릿지 설정 조회
 */
export function getDentwebConfig(): DentwebConfig {
  return {
    enabled: store.get('dentwebEnabled'),
    dbServer: store.get('dentwebDbServer'),
    dbPort: store.get('dentwebDbPort'),
    dbDatabase: store.get('dentwebDbDatabase'),
    dbUser: store.get('dentwebDbUser'),
    dbPassword: store.get('dentwebDbPassword'),
    dbUseWindowsAuth: store.get('dentwebDbUseWindowsAuth'),
    clinicId: store.get('dentwebClinicId'),
    apiKey: store.get('dentwebApiKey'),
    syncIntervalSeconds: store.get('dentwebSyncIntervalSeconds'),
    syncType: store.get('dentwebSyncType'),
  };
}

/**
 * 덴트웹 브릿지 설정 업데이트 (부분 업데이트 지원)
 */
export function setDentwebConfig(partial: Partial<DentwebConfig>): void {
  if (partial.enabled !== undefined) store.set('dentwebEnabled', partial.enabled);
  if (partial.dbServer !== undefined) store.set('dentwebDbServer', partial.dbServer);
  if (partial.dbPort !== undefined) store.set('dentwebDbPort', partial.dbPort);
  if (partial.dbDatabase !== undefined) store.set('dentwebDbDatabase', partial.dbDatabase);
  if (partial.dbUser !== undefined) store.set('dentwebDbUser', partial.dbUser);
  if (partial.dbPassword !== undefined) store.set('dentwebDbPassword', partial.dbPassword);
  if (partial.dbUseWindowsAuth !== undefined) store.set('dentwebDbUseWindowsAuth', partial.dbUseWindowsAuth);
  if (partial.clinicId !== undefined) store.set('dentwebClinicId', partial.clinicId);
  if (partial.apiKey !== undefined) store.set('dentwebApiKey', partial.apiKey);
  if (partial.syncIntervalSeconds !== undefined) store.set('dentwebSyncIntervalSeconds', partial.syncIntervalSeconds);
  if (partial.syncType !== undefined) store.set('dentwebSyncType', partial.syncType);
}

/**
 * 덴트웹 동기화 상태 조회 (이전 state.ts 대체)
 */
export function getDentwebState(): DentwebState {
  return {
    lastSyncDate: store.get('dentwebLastSyncDate'),
    lastSyncStatus: store.get('dentwebLastSyncStatus'),
    lastSyncPatientCount: store.get('dentwebLastSyncPatientCount'),
    totalSyncs: store.get('dentwebTotalSyncs'),
    consecutiveErrors: store.get('dentwebConsecutiveErrors'),
  };
}

/**
 * 덴트웹 동기화 상태 업데이트
 */
export function setDentwebState(partial: Partial<DentwebState>): void {
  if (partial.lastSyncDate !== undefined) store.set('dentwebLastSyncDate', partial.lastSyncDate);
  if (partial.lastSyncStatus !== undefined) store.set('dentwebLastSyncStatus', partial.lastSyncStatus);
  if (partial.lastSyncPatientCount !== undefined) store.set('dentwebLastSyncPatientCount', partial.lastSyncPatientCount);
  if (partial.totalSyncs !== undefined) store.set('dentwebTotalSyncs', partial.totalSyncs);
  if (partial.consecutiveErrors !== undefined) store.set('dentwebConsecutiveErrors', partial.consecutiveErrors);
}
