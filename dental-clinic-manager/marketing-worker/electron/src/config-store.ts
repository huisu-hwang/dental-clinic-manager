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
  lastUpdateCheck: string;         // 마지막 업데이트 확인 시각 (ISO)
  lastUpdatedAt: string;           // 마지막 업데이트 설치 시각 (ISO)
  installedAt: string;             // 최초 설치 시각 (ISO)
  currentVersionReleasedAt: string; // 현재 버전 GitHub 릴리즈 날짜 (ISO)
  latestVersion: string;           // 확인된 최신 버전
  updateStatus: string;            // 업데이트 상태 (up-to-date, available, downloading, downloaded)
  githubToken: string;       // GitHub PAT (private repo 업데이트용)
  // DentWeb DB 설정
  dentwebDbServer: string;
  dentwebDbPort: number;
  dentwebDbDatabase: string;
  dentwebDbAuth: string;     // 'windows' | 'sql'
  dentwebDbUser: string;
  dentwebDbPassword: string;
}

export interface AppConfig {
  dashboardUrl: string;
  workerApiKey: string;
  autoStart: boolean;
  autoUpdate: boolean;
  headless: boolean;
}

export interface DentwebDbConfig {
  server: string;
  port: number;
  database: string;
  auth: 'windows' | 'sql';
  user: string;
  password: string;
}

export interface UpdateMeta {
  lastUpdateCheck: string;
  lastUpdatedAt: string;
  installedAt: string;
  currentVersionReleasedAt: string;
  latestVersion: string;
  updateStatus: string;
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
    installedAt: '',
    currentVersionReleasedAt: '',
    latestVersion: '',
    updateStatus: 'up-to-date',
    githubToken: '',
    dentwebDbServer: '',
    dentwebDbPort: 1433,
    dentwebDbDatabase: 'DENTWEBDB',
    dentwebDbAuth: 'windows',
    dentwebDbUser: '',
    dentwebDbPassword: '',
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
 * DentWeb DB 설정 조회
 */
export function getDentwebConfig(): DentwebDbConfig {
  return {
    server: store.get('dentwebDbServer'),
    port: store.get('dentwebDbPort'),
    database: store.get('dentwebDbDatabase'),
    auth: (store.get('dentwebDbAuth') as 'windows' | 'sql') || 'windows',
    user: store.get('dentwebDbUser'),
    password: store.get('dentwebDbPassword'),
  };
}

/**
 * DentWeb DB 설정 저장
 */
export function setDentwebConfig(cfg: Partial<DentwebDbConfig>): void {
  if (cfg.server !== undefined) store.set('dentwebDbServer', cfg.server);
  if (cfg.port !== undefined) store.set('dentwebDbPort', cfg.port);
  if (cfg.database !== undefined) store.set('dentwebDbDatabase', cfg.database);
  if (cfg.auth !== undefined) store.set('dentwebDbAuth', cfg.auth);
  if (cfg.user !== undefined) store.set('dentwebDbUser', cfg.user);
  if (cfg.password !== undefined) store.set('dentwebDbPassword', cfg.password);
}
