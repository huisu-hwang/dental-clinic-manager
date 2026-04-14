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
    if (!workerApiKey) return false;

    const res = await fetch(`${dashboardUrl}/api/dentweb/worker-config`, {
      headers: { 'Authorization': `Bearer ${workerApiKey}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return false;
    const data = await res.json();

    if (data.clinic_id && data.api_key) {
      setConfig({
        dentwebClinicId: data.clinic_id,
        dentwebApiKey: data.api_key,
        dentwebSyncInterval: data.sync_interval_seconds || 300,
      });
      log('info', '[DentWeb] 자동 등록 완료');
      return true;
    }
    return false;
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
      setStatus('polling');
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
      setStatus('polling');
    } else {
      log('error', `[DentWeb] 동기화 실패: ${result.error}`);
      setConfig({ dentwebLastSyncStatus: 'error' });
      setStatus('error', result.error);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `[DentWeb] 동기화 오류: ${msg}`);
    setConfig({ dentwebLastSyncStatus: 'error' });

    // Check if DB connection lost
    if (pool && !pool.connected) {
      pool = null;
      setStatus('db_disconnected', msg);
    } else {
      setStatus('error', msg);
    }
  } finally {
    isSyncing = false;
  }
}

/* ------------------------------------------------------------------ */
/*  Exported start / stop                                              */
/* ------------------------------------------------------------------ */

export async function startDentwebSync(): Promise<void> {
  const cfg = getDentwebConfig();

  if (!cfg.enabled) {
    log('info', '[DentWeb] 비활성화 상태, 시작하지 않음');
    return;
  }

  // Auto-register if no clinic config
  if (!cfg.clinicId || !cfg.apiKey) {
    log('info', '[DentWeb] clinic 설정 없음, 자동 등록 시도...');
    const registered = await autoRegisterDentweb();
    if (!registered) {
      setStatus('error', '자동 등록 실패');
      return;
    }
  }

  // Auto-detect SQL Server if not configured or default
  if (cfg.dbServer === 'localhost' && cfg.dbAuthType === 'windows') {
    await detectSqlServer();
  }

  log('info', `[DentWeb] 동기화 시작 (주기: ${cfg.syncInterval}초)`);
  setStatus('polling');

  // Run first sync immediately
  await runSync();

  // Start interval
  const interval = (getDentwebConfig().syncInterval || 300) * 1000;
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
  if (pool) {
    try { await pool.close(); } catch { /* ignore */ }
    pool = null;
  }
  setStatus('idle');
  log('info', '[DentWeb] 동기화 중지됨');
}
