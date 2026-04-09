import { testConnection, disconnectDB } from './dentweb/db';
import { runSync, isSyncInProgress } from './dentweb/sync';
import { checkStatus, fetchWorkerConfig } from './dentweb/api-client';
import { getDentwebConfig, setDentwebConfig } from './config-store';
import { log } from './logger';

// ============================================
// 덴트웹 브릿지
// 원내 PC의 덴트웹 MS SQL Server DB에서 환자 데이터를 읽어
// Supabase로 주기적으로 동기화하는 내장 브릿지 (이전 dentweb-bridge-agent 통합)
// ============================================

export type DentwebBridgeStatus =
  | 'idle'
  | 'polling'
  | 'syncing'
  | 'error'
  | 'db-unavailable'
  | 'not-configured';

type StatusCallback = (status: DentwebBridgeStatus, message?: string) => void;

let pollTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: DentwebBridgeStatus = 'idle';
let currentMessage: string | undefined;
const statusCallbacks: StatusCallback[] = [];

// DB 연결 실패 시 재시도 주기 (밀리초)
const DB_RETRY_INTERVAL_MS = 60 * 1000; // 1분

export function onDentwebStatusChange(cb: StatusCallback): void {
  statusCallbacks.push(cb);
}

export function getDentwebBridgeStatus(): { status: DentwebBridgeStatus; message?: string } {
  return { status: currentStatus, message: currentMessage };
}

function setStatus(status: DentwebBridgeStatus, message?: string): void {
  currentStatus = status;
  currentMessage = message;
  statusCallbacks.forEach((cb) => {
    try {
      cb(status, message);
    } catch (err) {
      log('error', `[Dentweb] Status callback error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}

/**
 * 덴트웹 브릿지 시작
 *
 * 흐름:
 * 1. 대시보드에서 덴트웹 설정 자동 조회 (clinic_id, api_key)
 * 2. 설정이 없으면 'not-configured' 상태로 대기 (다른 브릿지 동작 방해 X)
 * 3. DB 연결 테스트 → 실패해도 polling 유지 ('db-unavailable' 상태)
 * 4. 설정된 주기마다 runSync() 호출
 */
export async function startDentweb(): Promise<void> {
  // 이전 타이머 정리
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  // 1. 대시보드에서 워커용 덴트웹 설정 내려받기 (비동기, 실패해도 계속 진행)
  try {
    const configResult = await fetchWorkerConfig();
    if (configResult.success && configResult.data) {
      setDentwebConfig({
        enabled: configResult.data.is_active,
        clinicId: configResult.data.clinic_id,
        apiKey: configResult.data.api_key,
        syncIntervalSeconds: configResult.data.sync_interval_seconds,
      });
      log(
        'info',
        `[Dentweb] 대시보드에서 설정 조회 완료 (clinic: ${configResult.data.clinic_id.slice(0, 8)}..., interval: ${configResult.data.sync_interval_seconds}s, active: ${configResult.data.is_active})`
      );
    } else {
      log('info', `[Dentweb] 대시보드 설정 조회 실패 또는 미구성: ${configResult.error || 'no data'}`);
    }
  } catch (err) {
    log(
      'warn',
      `[Dentweb] 대시보드 설정 조회 오류: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const cfg = getDentwebConfig();

  // 2. 설정 검증
  if (!cfg.enabled) {
    setStatus('not-configured', '덴트웹 동기화가 비활성화 상태입니다');
    log('info', '[Dentweb] 덴트웹 동기화 비활성화 — 대기 모드');
    return;
  }

  if (!cfg.clinicId || !cfg.apiKey) {
    setStatus('not-configured', 'clinic_id 또는 api_key가 설정되지 않았습니다');
    log('warn', '[Dentweb] clinic_id 또는 api_key 누락 — 대시보드에서 덴트웹 동기화를 설정해주세요');
    return;
  }

  // 3. DB 연결 테스트 (실패해도 멈추지 않음)
  setStatus('polling', '초기 DB 연결 확인 중...');
  const dbOk = await testConnection();

  if (!dbOk) {
    setStatus('db-unavailable', `덴트웹 DB 연결 실패 (${cfg.dbServer}:${cfg.dbPort})`);
    log(
      'warn',
      `[Dentweb] 덴트웹 DB 연결 실패 — ${DB_RETRY_INTERVAL_MS / 1000}초 후 재시도. 다른 브릿지는 정상 동작합니다.`
    );
    // DB 연결 실패 시 1분마다 재시도
    pollTimer = setInterval(() => {
      retryDbOrSync().catch((err) => {
        log('error', `[Dentweb] 재시도 오류: ${err instanceof Error ? err.message : String(err)}`);
      });
    }, DB_RETRY_INTERVAL_MS);
    return;
  }

  log('info', '[Dentweb] DB 연결 성공 — 최초 동기화 실행');

  // 4. 최초 동기화
  await runSyncWithStatus();

  // 5. 주기적 동기화 스케줄러
  const intervalMs = cfg.syncIntervalSeconds * 1000;
  pollTimer = setInterval(() => {
    runSyncWithStatus().catch((err) => {
      log('error', `[Dentweb] 스케줄된 동기화 오류: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, intervalMs);

  log('info', `[Dentweb] 덴트웹 브릿지 시작 완료 (${cfg.syncIntervalSeconds}초 주기)`);
}

/**
 * DB 연결이 끊긴 상태에서 주기적으로 재시도
 * 연결이 복구되면 정상 동기화 루프로 전환
 */
async function retryDbOrSync(): Promise<void> {
  if (currentStatus === 'db-unavailable') {
    // DB 재연결 시도
    const dbOk = await testConnection();
    if (dbOk) {
      log('info', '[Dentweb] DB 연결 복구 — 정상 동기화 루프로 전환');
      // 기존 retry 타이머 정리 후 정상 주기로 재스케줄
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      await runSyncWithStatus();

      const cfg = getDentwebConfig();
      pollTimer = setInterval(() => {
        runSyncWithStatus().catch((err) => {
          log('error', `[Dentweb] 스케줄된 동기화 오류: ${err instanceof Error ? err.message : String(err)}`);
        });
      }, cfg.syncIntervalSeconds * 1000);
    }
    return;
  }

  // 정상 상태에서는 주기적 동기화 실행
  await runSyncWithStatus();
}

/**
 * 상태 원격 확인 + 동기화 실행
 * 원격에서 비활성화된 경우 건너뜀
 */
async function runSyncWithStatus(): Promise<void> {
  if (isSyncInProgress()) {
    return;
  }

  try {
    // 원격 상태 확인 (실패해도 동기화는 진행 — 오프라인 내성)
    const statusResult = await checkStatus();
    if (statusResult.success && statusResult.data && !statusResult.data.is_active) {
      log('info', '[Dentweb] 원격 상태가 비활성 — 동기화 건너뜀');
      setStatus('polling', '비활성 상태');
      return;
    }

    setStatus('syncing', '환자 데이터 동기화 중...');
    const result = await runSync();

    if (result.success) {
      setStatus('polling');
    } else {
      // DB 연결 오류로 인한 실패인 경우 'db-unavailable'로 전환
      const errMsg = result.error || 'unknown';
      if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ConnectionError|Failed to connect/i.test(errMsg)) {
        setStatus('db-unavailable', `DB 연결 실패: ${errMsg}`);
      } else {
        setStatus('error', errMsg);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[Dentweb] 동기화 실행 중 오류: ${msg}`);
    setStatus('error', msg);
  }
}

/**
 * 덴트웹 브릿지 중지 + DB 연결 해제
 */
export async function stopDentweb(): Promise<void> {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  try {
    await disconnectDB();
  } catch {
    // ignore
  }
  setStatus('idle');
  log('info', '[Dentweb] 덴트웹 브릿지 중지');
}
