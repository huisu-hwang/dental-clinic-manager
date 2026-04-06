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
}

export interface AppConfig {
  dashboardUrl: string;
  workerApiKey: string;
  autoStart: boolean;
  autoUpdate: boolean;
  headless: boolean;
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
 * 워커 환경변수로 변환 (기존 marketing-worker의 process.env에 주입)
 */
export function getWorkerEnvVars(): Record<string, string> {
  return {
    DASHBOARD_API_URL: store.get('dashboardUrl'),
    WORKER_API_KEY: store.get('workerApiKey'),
    MARKETING_WORKER_PORT: '4001',
  };
}
