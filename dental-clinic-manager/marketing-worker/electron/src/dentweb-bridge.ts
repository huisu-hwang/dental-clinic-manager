import sql from 'mssql';
import { getConfig, setConfig, getDentwebConfig } from './config-store';
import { log } from './logger';

/* ------------------------------------------------------------------ */
/*  Status management                                                  */
/* ------------------------------------------------------------------ */

let currentStatus = 'idle';
const statusCallbacks: Array<(status: string, message?: string) => void> = [];

function setStatus(status: string, message?: string): void {
  currentStatus = status;
  for (const cb of statusCallbacks) {
    try { cb(status, message); } catch { /* ignore */ }
  }
}

export function getDentwebStatus(): string {
  return currentStatus;
}

export function onDentwebStatusChange(cb: (status: string, message?: string) => void): void {
  statusCallbacks.push(cb);
}

/* ------------------------------------------------------------------ */
/*  DB config builder                                                  */
/* ------------------------------------------------------------------ */

function buildSqlConfig(): sql.config {
  const cfg = getDentwebConfig();
  const baseConfig: sql.config = {
    server: cfg.dbServer,
    port: cfg.dbPort,
    database: cfg.dbDatabase,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 10000,
      requestTimeout: 30000,
    },
    pool: { min: 0, max: 5, idleTimeoutMillis: 30000 },
  };

  if (cfg.dbAuthType === 'windows') {
    baseConfig.authentication = {
      type: 'ntlm',
      options: { domain: '', userName: '', password: '' },
    };
  } else {
    baseConfig.user = cfg.dbUser;
    baseConfig.password = cfg.dbPassword;
  }
  return baseConfig;
}

/* ------------------------------------------------------------------ */
/*  Formatting helpers                                                 */
/* ------------------------------------------------------------------ */

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

function formatPatientRow(row: Record<string, unknown>) {
  return {
    dentweb_patient_id: String(row.dentweb_patient_id),
    chart_number: (row.chart_number as string) || null,
    patient_name: String(row.patient_name || ''),
    phone_number: (row.phone_number as string) || null,
    birth_date: formatDate(row.birth_date as Date | null),
    gender: (row.gender as string) || null,
    last_visit_date: formatDate(row.last_visit_date as Date | null),
    last_treatment_type: (row.last_treatment_type as string) || null,
    next_appointment_date: formatDate(row.next_appointment_date as Date | null),
    registration_date: formatDate(row.registration_date as Date | null),
    is_active: true,
  };
}

/* ------------------------------------------------------------------ */
/*  Patient queries                                                    */
/* ------------------------------------------------------------------ */

async function getAllPatients(pool: sql.ConnectionPool) {
  const result = await pool.request().query(`
    SELECT
      CAST(PT_ID AS VARCHAR) AS dentweb_patient_id,
      PT_CHARTNO AS chart_number,
      PT_NAME AS patient_name,
      PT_HP AS phone_number,
      PT_BIRTH AS birth_date,
      PT_SEX AS gender,
      (SELECT MAX(RCP_DATE) FROM RECEIPT WHERE RCP_PTID = PATIENT.PT_ID) AS last_visit_date,
      (SELECT TOP 1 TX_NAME FROM TREAT_DETAIL
       INNER JOIN RECEIPT ON TREAT_DETAIL.TD_RCPID = RECEIPT.RCP_ID
       WHERE RECEIPT.RCP_PTID = PATIENT.PT_ID
       ORDER BY RECEIPT.RCP_DATE DESC) AS last_treatment_type,
      PT_MEMO_DATE AS next_appointment_date,
      PT_FIRSTDATE AS registration_date
    FROM PATIENT
    WHERE PT_NAME IS NOT NULL AND PT_NAME != ''
    ORDER BY PT_ID
  `);
  return result.recordset.map(formatPatientRow);
}

async function getUpdatedPatients(pool: sql.ConnectionPool, since: Date) {
  const result = await pool.request()
    .input('sinceDate', sql.DateTime, since)
    .query(`
      SELECT
        CAST(PT_ID AS VARCHAR) AS dentweb_patient_id,
        PT_CHARTNO AS chart_number,
        PT_NAME AS patient_name,
        PT_HP AS phone_number,
        PT_BIRTH AS birth_date,
        PT_SEX AS gender,
        (SELECT MAX(RCP_DATE) FROM RECEIPT WHERE RCP_PTID = PATIENT.PT_ID) AS last_visit_date,
        (SELECT TOP 1 TX_NAME FROM TREAT_DETAIL
         INNER JOIN RECEIPT ON TREAT_DETAIL.TD_RCPID = RECEIPT.RCP_ID
         WHERE RECEIPT.RCP_PTID = PATIENT.PT_ID
         ORDER BY RECEIPT.RCP_DATE DESC) AS last_treatment_type,
        PT_MEMO_DATE AS next_appointment_date,
        PT_FIRSTDATE AS registration_date
      FROM PATIENT
      WHERE PT_NAME IS NOT NULL AND PT_NAME != ''
        AND (PT_EDITDATE >= @sinceDate
             OR PT_ID IN (SELECT RCP_PTID FROM RECEIPT WHERE RCP_DATE >= @sinceDate))
      ORDER BY PT_ID
    `);
  return result.recordset.map(formatPatientRow);
}

/* ------------------------------------------------------------------ */
/*  API client with retry                                              */
/* ------------------------------------------------------------------ */

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];

async function fetchWithRetry(url: string, options?: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        const delay = RETRY_DELAYS[attempt] || 8000;
        log('warn', `[DentWeb] 네트워크 오류, ${delay / 1000}초 후 재시도 (${attempt + 1}/${retries})...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError || new Error('All retries failed');
}

async function syncPatientsToServer(patients: Record<string, unknown>[], syncType: 'full' | 'incremental') {
  const cfg = getDentwebConfig();
  const { dashboardUrl } = getConfig();
  const url = `${dashboardUrl}/api/dentweb/sync`;

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clinic_id: cfg.clinicId,
      api_key: cfg.apiKey,
      sync_type: syncType,
      patients,
      agent_version: '2.0.0-electron',
    }),
  });

  return await response.json();
}

/* ------------------------------------------------------------------ */
/*  Auto-registration                                                  */
/* ------------------------------------------------------------------ */

async function autoRegisterDentweb(): Promise<boolean> {
  try {
    const { dashboardUrl, workerApiKey } = getConfig();
    if (!workerApiKey) {
      log('warn', '[DentWeb] 자동 등록 실패: workerApiKey 가 비어있음');
      return false;
    }

    // 통합 워커 API 경로 사용 (verifyWorkerApiKey 헬퍼를 통해 인증).
    // 이전에 사용하던 /api/dentweb/worker-config 는 존재하지 않는
    // marketing_worker_control.clinic_id 컬럼을 조회하여 PostgREST 에러로
    // 항상 401 을 반환함 — /api/marketing/worker-api/dentweb/config 가 정상 경로.
    const url = `${dashboardUrl}/api/marketing/worker-api/dentweb/config`;
    log('info', `[DentWeb] 자동 등록 요청: ${url}`);
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${workerApiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      log('error', `[DentWeb] 자동 등록 실패: HTTP ${res.status} ${res.statusText} — ${errText.slice(0, 200)}`);
      return false;
    }

    const data = await res.json();
    if (!data?.success || !data?.config) {
      log('error', `[DentWeb] 자동 등록 실패: 응답 형식 오류 ${JSON.stringify(data).slice(0, 200)}`);
      return false;
    }

    const config = data.config as {
      clinic_id?: string;
      api_key?: string;
      sync_interval_seconds?: number;
      is_active?: boolean;
    };

    if (!config.clinic_id || !config.api_key) {
      log('error', `[DentWeb] 자동 등록 실패: clinic_id/api_key 누락 (${JSON.stringify(config).slice(0, 200)})`);
      return false;
    }

    setConfig({
      dentwebEnabled: true,
      dentwebClinicId: config.clinic_id,
      dentwebApiKey: config.api_key,
      dentwebSyncInterval: config.sync_interval_seconds || 300,
    });
    log('info', `[DentWeb] 자동 등록 완료 (clinic=${config.clinic_id.slice(0, 8)}..., enabled=true)`);
    return true;
  } catch (err) {
    log('error', `[DentWeb] 자동 등록 실패: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  SQL Server auto-detection                                          */
/* ------------------------------------------------------------------ */

async function detectSqlServer(): Promise<boolean> {
  const candidates = [
    { server: 'localhost', database: 'DENTWEBDB' },
    { server: 'localhost\\SQLEXPRESS', database: 'DENTWEBDB' },
    { server: 'localhost\\DENTWEB', database: 'DENTWEBDB' },
    { server: 'localhost', database: 'DentWeb' },
  ];

  for (const candidate of candidates) {
    try {
      const testConfig: sql.config = {
        server: candidate.server,
        database: candidate.database,
        port: 1433,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          connectTimeout: 5000,
          requestTimeout: 5000,
        },
        authentication: { type: 'ntlm', options: { domain: '', userName: '', password: '' } },
        pool: { min: 0, max: 1 },
      };

      const testPool = await new sql.ConnectionPool(testConfig).connect();
      // Check if PATIENT table exists
      const result = await testPool.request().query(
        "SELECT TOP 1 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'PATIENT'"
      );
      await testPool.close();

      if (result.recordset.length > 0) {
        log('info', `[DentWeb] DB 자동 감지 성공: ${candidate.server}/${candidate.database}`);
        setConfig({
          dentwebDbServer: candidate.server,
          dentwebDbDatabase: candidate.database,
        });
        return true;
      }
    } catch {
      // Try next candidate
    }
  }
  log('warn', '[DentWeb] DB 자동 감지 실패 — 수동 설정 필요');
  return false;
}

/* ------------------------------------------------------------------ */
/*  Main sync loop                                                     */
/* ------------------------------------------------------------------ */

let isSyncing = false;
let pool: sql.ConnectionPool | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastSyncError: string | null = null;

const HEARTBEAT_INTERVAL_MS = 60 * 1000;

/**
 * Dashboard에 brid agent가 살아있음을 주기적으로 통지한다.
 * - sync 성공/실패/스킵과 무관하게 동작한다.
 * - DB 연결 여부와 마지막 오류를 함께 보고한다.
 */
async function sendHeartbeat(): Promise<void> {
  try {
    const cfg = getDentwebConfig();
    if (!cfg.clinicId || !cfg.apiKey) return;
    const { dashboardUrl } = getConfig();
    const url = `${dashboardUrl}/api/dentweb/heartbeat`;
    const dbConnected = !!(pool && pool.connected);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: cfg.clinicId,
        api_key: cfg.apiKey,
        agent_version: '2.0.0-electron',
        db_connected: dbConnected,
        last_error: lastSyncError,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      log('warn', `[DentWeb] heartbeat HTTP ${response.status}`);
    }
  } catch (err) {
    log('warn', `[DentWeb] heartbeat 실패: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function runSync(): Promise<void> {
  if (isSyncing) {
    log('warn', '[DentWeb] 이미 동기화 진행 중, 건너뜀');
    return;
  }

  isSyncing = true;
  setStatus('syncing');

  try {
    const cfg = getDentwebConfig();

    // Ensure DB connection
    if (!pool || !pool.connected) {
      pool = await new sql.ConnectionPool(buildSqlConfig()).connect();
      log('info', '[DentWeb] SQL Server 연결 성공');
    }

    // Determine sync type
    let patients;
    let syncType: 'full' | 'incremental';
    const lastSync = cfg.lastSyncDate ? new Date(cfg.lastSyncDate) : null;

    if (!lastSync) {
      syncType = 'full';
      log('info', '[DentWeb] 전체 동기화 시작...');
      patients = await getAllPatients(pool);
    } else {
      syncType = 'incremental';
      log('info', `[DentWeb] 증분 동기화 시작 (since ${lastSync.toISOString()})...`);
      patients = await getUpdatedPatients(pool, lastSync);
    }

    log('info', `[DentWeb] ${patients.length}명 환자 발견`);

    if (patients.length === 0) {
      setConfig({
        dentwebLastSyncDate: new Date().toISOString(),
        dentwebLastSyncStatus: 'success',
      });
      lastSyncError = null;
      setStatus('polling');
      // 환자 0명이어도 heartbeat로 서버에 alive 통지 (workers/status 오프라인 방지)
      await sendHeartbeat();
      return;
    }

    // Send to server
    const result = await syncPatientsToServer(patients, syncType);

    if (result.success) {
      log('info', `[DentWeb] 동기화 완료: 총 ${result.total_records}, 신규 ${result.new_records}, 수정 ${result.updated_records}`);
      setConfig({
        dentwebLastSyncDate: new Date().toISOString(),
        dentwebLastSyncStatus: 'success',
        dentwebLastSyncPatientCount: result.total_records || 0,
      });
      lastSyncError = null;
      setStatus('polling');
    } else {
      log('error', `[DentWeb] 동기화 실패: ${result.error}`);
      setConfig({ dentwebLastSyncStatus: 'error' });
      lastSyncError = result.error || 'sync failed';
      setStatus('error', result.error);
      await sendHeartbeat();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[DentWeb] 동기화 오류: ${msg}`);
    setConfig({ dentwebLastSyncStatus: 'error' });
    lastSyncError = msg;

    // Check if DB connection lost
    if (pool && !pool.connected) {
      pool = null;
      setStatus('db_disconnected', msg);
    } else {
      setStatus('error', msg);
    }
    // 실패해도 heartbeat로 alive 통지
    await sendHeartbeat();
  } finally {
    isSyncing = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Exported start / stop                                              */
/* ------------------------------------------------------------------ */

export async function startDentwebSync(): Promise<void> {
  let cfg = getDentwebConfig();

  // Auto-register if no clinic config (enabled 플래그도 함께 설정됨)
  if (!cfg.clinicId || !cfg.apiKey) {
    log('info', '[DentWeb] clinic 설정 없음, 자동 등록 시도...');
    const registered = await autoRegisterDentweb();
    if (!registered) {
      setStatus('error', '자동 등록 실패');
      // 자동 등록 실패해도 다음 사이클에 재시도할 수 있도록 예외는 던지지 않음
      return;
    }
    cfg = getDentwebConfig();
  }

  // Auto-detect SQL Server if not configured or default
  if (cfg.dbServer === 'localhost' && cfg.dbAuthType === 'windows') {
    await detectSqlServer();
    cfg = getDentwebConfig();
  }

  log('info', `[DentWeb] 동기화 시작 (주기: ${cfg.syncInterval}초)`);
  setStatus('polling');

  // Heartbeat timer 시작 (DB 연결 실패 상황에서도 alive 통지)
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  await sendHeartbeat();
  heartbeatTimer = setInterval(() => {
    sendHeartbeat().catch(() => { /* already logged */ });
  }, HEARTBEAT_INTERVAL_MS);

  // Run first sync immediately
  await runSync();

  // Start interval
  const interval = (getDentwebConfig().syncInterval || 300) * 1000;
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    runSync().catch(err => {
      log('error', `[DentWeb] 스케줄 동기화 오류: ${err instanceof Error ? err.message : String(err)}`);
    });
  }, interval);
}

export async function stopDentwebSync(): Promise<void> {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  if (pool) {
    try { await pool.close(); } catch { /* ignore */ }
    pool = null;
  }
  setStatus('idle');
  log('info', '[DentWeb] 동기화 중지됨');
}
