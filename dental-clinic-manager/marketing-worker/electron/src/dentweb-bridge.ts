import { execFileSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { DentwebApiClient, DentwebConfig, PatientSyncData } from './dentweb-api-client';
import { getConfig, getDentwebConfig, setDentwebConfig, DentwebDbConfig } from './config-store';
import { log } from './logger';

// ============================================
// DentWeb DB 동기화 브릿지
// MS SQL Server 자동 감지 → 연결 → 주기적 동기화
// ============================================

export type DentwebStatus = 'idle' | 'polling' | 'syncing' | 'error';

type StatusCallback = (status: DentwebStatus, message?: string) => void;

let apiClient: DentwebApiClient | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let currentStatus: DentwebStatus = 'idle';
let dentwebConfig: DentwebConfig | null = null;
const statusCallbacks: StatusCallback[] = [];

// 동기화 상태 파일
const STATE_FILE = path.join(app.getPath('userData'), 'dentweb-sync-state.json');
const AGENT_VERSION = '1.0.0';

interface SyncState {
  lastSyncDate: string | null;
  lastSyncStatus: 'success' | 'error' | null;
  totalSyncs: number;
}

function loadSyncState(): SyncState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { lastSyncDate: null, lastSyncStatus: null, totalSyncs: 0 };
}

function saveSyncState(state: SyncState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch { /* ignore */ }
}

function setStatus(status: DentwebStatus, message?: string): void {
  currentStatus = status;
  statusCallbacks.forEach(cb => cb(status, message));
}

export function getDentwebStatus(): DentwebStatus {
  return currentStatus;
}

export function onDentwebStatusChange(cb: StatusCallback): void {
  statusCallbacks.push(cb);
}

// ============================================
// SQL Server 자동 감지 (Windows 전용)
// ============================================

function detectSqlServer(): string | null {
  if (process.platform !== 'win32') {
    log('info', '[DentWeb] Windows가 아닌 환경 - SQL Server 감지 건너뜀');
    return null;
  }

  const instances = [
    { service: 'MSSQLSERVER', server: 'localhost' },
    { service: 'MSSQL$SQLEXPRESS', server: 'localhost\\SQLEXPRESS' },
    { service: 'MSSQL$DENTWEB', server: 'localhost\\DENTWEB' },
  ];

  for (const inst of instances) {
    try {
      execFileSync('sc', ['query', inst.service], { stdio: 'pipe' });
      log('info', `[DentWeb] SQL Server 감지: ${inst.server} (${inst.service})`);
      return inst.server;
    } catch { /* not found */ }
  }

  log('warn', '[DentWeb] SQL Server 인스턴스를 찾을 수 없음');
  return null;
}

// ============================================
// DB 연결 및 쿼리
// ============================================

let sqlPool: unknown = null;

async function connectDB(dbConfig: DentwebDbConfig): Promise<boolean> {
  try {
    // mssql은 Windows에서만 사용 가능 — 동적 import
    const sql = require('mssql');

    const sqlConfig: Record<string, unknown> = {
      server: dbConfig.server,
      port: dbConfig.port,
      database: dbConfig.database,
      options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 10000,
        requestTimeout: 30000,
      },
      pool: { min: 0, max: 5, idleTimeoutMillis: 30000 },
    };

    if (dbConfig.auth === 'windows') {
      sqlConfig.options = {
        ...(sqlConfig.options as Record<string, unknown>),
        trustedConnection: true,
      };
      sqlConfig.authentication = {
        type: 'ntlm',
        options: { domain: '', userName: '', password: '' },
      };
    } else {
      sqlConfig.user = dbConfig.user;
      sqlConfig.password = dbConfig.password;
    }

    sqlPool = await new sql.ConnectionPool(sqlConfig).connect();
    log('info', '[DentWeb] DB 연결 성공');
    return true;
  } catch (err) {
    log('error', `[DentWeb] DB 연결 실패: ${err instanceof Error ? err.message : err}`);
    sqlPool = null;
    return false;
  }
}

async function disconnectDB(): Promise<void> {
  if (sqlPool) {
    try {
      await (sqlPool as { close: () => Promise<void> }).close();
    } catch { /* ignore */ }
    sqlPool = null;
  }
}

async function queryPatients(since?: string): Promise<PatientSyncData[]> {
  if (!sqlPool) return [];
  const sql = require('mssql');
  const pool = sqlPool as { request: () => unknown };

  try {
    let result;
    if (since) {
      const req = pool.request() as {
        input: (name: string, type: unknown, value: unknown) => { query: (q: string) => Promise<{ recordset: Record<string, unknown>[] }> };
        query: (q: string) => Promise<{ recordset: Record<string, unknown>[] }>;
      };
      result = await req
        .input('sinceDate', sql.DateTime, new Date(since))
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
    } else {
      const req = pool.request() as {
        query: (q: string) => Promise<{ recordset: Record<string, unknown>[] }>;
      };
      result = await req.query(`
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
    }

    return result.recordset.map(formatPatient);
  } catch (err) {
    log('error', `[DentWeb] 환자 조회 실패: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}

function formatDate(d: unknown): string | undefined {
  if (!d || !(d instanceof Date)) return undefined;
  return d.toISOString().split('T')[0];
}

function formatPatient(row: Record<string, unknown>): PatientSyncData {
  return {
    dentweb_patient_id: String(row.dentweb_patient_id),
    chart_number: (row.chart_number as string) || undefined,
    patient_name: String(row.patient_name || ''),
    phone_number: (row.phone_number as string) || undefined,
    birth_date: formatDate(row.birth_date),
    gender: (row.gender as string) || undefined,
    last_visit_date: formatDate(row.last_visit_date),
    last_treatment_type: (row.last_treatment_type as string) || undefined,
    next_appointment_date: formatDate(row.next_appointment_date),
    registration_date: formatDate(row.registration_date),
    is_active: true,
  };
}

// ============================================
// 동기화 실행
// ============================================

let isSyncing = false;

async function runSync(): Promise<void> {
  if (isSyncing || !apiClient || !dentwebConfig) return;
  isSyncing = true;

  const state = loadSyncState();

  try {
    const syncType = state.lastSyncDate ? 'incremental' : 'full';
    setStatus('syncing', `${syncType === 'full' ? '전체' : '증분'} 동기화 중...`);

    const patients = await queryPatients(state.lastSyncDate || undefined);
    log('info', `[DentWeb] ${patients.length}명 환자 조회 (${syncType})`);

    if (patients.length === 0) {
      state.lastSyncDate = new Date().toISOString();
      state.lastSyncStatus = 'success';
      saveSyncState(state);
      setStatus('polling');
      return;
    }

    const result = await apiClient.syncPatients(
      dentwebConfig.clinic_id,
      dentwebConfig.api_key,
      patients,
      syncType,
      AGENT_VERSION
    );

    if (result.success) {
      log('info', `[DentWeb] 동기화 완료: 전체 ${result.total_records}, 신규 ${result.new_records}, 업데이트 ${result.updated_records}`);
      state.lastSyncDate = new Date().toISOString();
      state.lastSyncStatus = 'success';
      state.totalSyncs++;
    } else {
      log('error', `[DentWeb] 동기화 실패: ${result.error}`);
      state.lastSyncStatus = 'error';
    }

    saveSyncState(state);
    setStatus('polling');
  } catch (err) {
    log('error', `[DentWeb] 동기화 오류: ${err instanceof Error ? err.message : err}`);
    state.lastSyncStatus = 'error';
    saveSyncState(state);
    setStatus('polling');
  } finally {
    isSyncing = false;
  }
}

// ============================================
// 공개 API
// ============================================

export async function startDentwebBridge(): Promise<void> {
  const cfg = getConfig();
  if (!cfg.dashboardUrl || !cfg.workerApiKey) return;

  apiClient = new DentwebApiClient();
  setStatus('polling');
  log('info', '[DentWeb] 브릿지 시작');

  // 1. 서버에서 DentWeb 설정 조회
  dentwebConfig = await apiClient.fetchConfig();
  if (!dentwebConfig) {
    log('warn', '[DentWeb] DentWeb 설정을 찾을 수 없음 — 주기적으로 재시도');
    syncTimer = setInterval(async () => {
      if (!apiClient) return;
      dentwebConfig = await apiClient.fetchConfig();
      if (dentwebConfig && dentwebConfig.is_active) {
        clearInterval(syncTimer!);
        syncTimer = null;
        await initDbAndStartSync();
      }
    }, 60000);
    return;
  }

  if (!dentwebConfig.is_active) {
    log('info', '[DentWeb] 동기화 비활성화 상태');
    return;
  }

  await initDbAndStartSync();
}

async function initDbAndStartSync(): Promise<void> {
  if (!dentwebConfig) return;

  // 2. SQL Server 감지 및 연결
  let dbConfig = getDentwebConfig();

  if (!dbConfig.server) {
    const detected = detectSqlServer();
    if (detected) {
      dbConfig = { ...dbConfig, server: detected };
      setDentwebConfig(dbConfig);
    }
  }

  if (!dbConfig.server) {
    log('warn', '[DentWeb] SQL Server를 찾을 수 없음 — polling 상태 유지');
    setStatus('polling', 'SQL Server 미감지');
    return;
  }

  // DB 연결 시도 (Windows 인증 우선)
  const connected = await connectDB(dbConfig);
  if (!connected) {
    if (dbConfig.auth === 'windows' && dbConfig.user && dbConfig.password) {
      log('info', '[DentWeb] Windows 인증 실패, SQL 인증으로 재시도...');
      const sqlConfig = { ...dbConfig, auth: 'sql' as const };
      const sqlConnected = await connectDB(sqlConfig);
      if (sqlConnected) {
        setDentwebConfig(sqlConfig);
      } else {
        log('warn', '[DentWeb] DB 연결 실패 — polling 상태 유지');
        setStatus('polling', 'DB 연결 실패');
        return;
      }
    } else {
      log('warn', '[DentWeb] DB 연결 실패 — polling 상태 유지');
      setStatus('polling', 'DB 연결 실패');
      return;
    }
  }

  // 3. 최초 동기화
  log('info', '[DentWeb] 최초 동기화 실행...');
  await runSync();

  // 4. 주기적 동기화
  const intervalMs = (dentwebConfig.sync_interval_seconds || 300) * 1000;
  log('info', `[DentWeb] ${dentwebConfig.sync_interval_seconds}초 간격으로 동기화 스케줄링`);

  syncTimer = setInterval(async () => {
    if (!apiClient || !dentwebConfig) return;

    const status = await apiClient.checkStatus(dentwebConfig.clinic_id, dentwebConfig.api_key);
    if (status.success && status.data?.is_active) {
      await runSync();
    } else if (status.success && !status.data?.is_active) {
      log('info', '[DentWeb] 동기화 비활성화 — 건너뜀');
    } else {
      await runSync();
    }
  }, intervalMs);
}

export function stopDentwebBridge(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
  disconnectDB();
  apiClient = null;
  dentwebConfig = null;
  setStatus('idle');
  log('info', '[DentWeb] 브릿지 중지');
}
