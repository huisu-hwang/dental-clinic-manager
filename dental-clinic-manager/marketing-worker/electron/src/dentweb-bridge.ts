import sql from 'mssql';
import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { getConfig, setConfig, getDentwebConfig } from './config-store';
import { log } from './logger';
import { DentwebApiClient } from './dentweb-api-client';

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

  // Named instance 분리: 'localhost\DENTWEB' → server='localhost', instanceName='DENTWEB'
  let serverHost = cfg.dbServer;
  let instanceName: string | undefined;
  const backslashIdx = cfg.dbServer.indexOf('\\');
  if (backslashIdx > 0) {
    serverHost = cfg.dbServer.substring(0, backslashIdx);
    instanceName = cfg.dbServer.substring(backslashIdx + 1);
  }

  const baseConfig: sql.config = {
    server: serverHost,
    database: cfg.dbDatabase,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 10000,
      requestTimeout: 30000,
      instanceName,
    },
    pool: { min: 0, max: 5, idleTimeoutMillis: 30000 },
  };

  // Named instance인 경우 SQL Browser가 포트를 자동 해결하므로 port를 지정하지 않음.
  // default instance인 경우에만 port 지정.
  if (!instanceName) {
    baseConfig.port = cfg.dbPort;
  }

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

/** DentWeb varchar(8) 날짜 '20260416' → '2026-04-16' */
function formatDentwebDate(dateStr: string | null | undefined): string | null {
  if (!dateStr || dateStr.length < 8) return null;
  const d = dateStr.replace(/\s/g, '');
  if (d.length < 8 || !/^\d{8}/.test(d)) return null;
  const year = parseInt(d.slice(0, 4), 10);
  const month = parseInt(d.slice(4, 6), 10);
  const day = parseInt(d.slice(6, 8), 10);
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  // JavaScript Date로 실제 유효성 검증 (윤년 등)
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function formatPatientRow(row: Record<string, unknown>) {
  // b성별: false(0)=남, true(1)=여
  const genderBit = row['b성별'];
  const gender = genderBit === true || genderBit === 1 ? 'F' : genderBit === false || genderBit === 0 ? 'M' : null;

  return {
    dentweb_patient_id: String(row['n환자ID']),
    chart_number: (row['sz차트번호'] as string) || null,
    patient_name: String(row['sz이름'] || ''),
    phone_number: (row['sz휴대폰번호'] as string) || null,
    birth_date: formatDentwebDate(row['sz생년월일'] as string),
    gender,
    last_visit_date: formatDentwebDate(row['sz최종내원일'] as string),
    last_treatment_type: (row['last_treatment_type'] as string) || null,
    next_appointment_date: formatDentwebDate(row['next_appointment_date'] as string),
    registration_date: formatDentwebDate((row['sz등록시각'] as string)?.slice(0, 8)),
    is_active: true,
  };
}

/* ------------------------------------------------------------------ */
/*  Patient queries                                                    */
/* ------------------------------------------------------------------ */

/**
 * DentWeb 실제 스키마:
 *   TB_환자정보: n환자ID, sz차트번호, sz이름, sz휴대폰번호, sz생년월일, b성별,
 *               sz최종내원일(varchar(8)), sz등록시각(varchar(14)), t수정시각(datetime)
 *   TB_접수목록: sz접수시각(char), n환자ID, sz진료내용
 *   TB_세부처치내역: n환자ID, sz진료일(char), sz수가코드
 *   TB_치료수가표: nID, sz이름 (수가 이름)
 *   TB_예약목록: n환자ID, sz예약시각(char), sz예약내용
 */

const PATIENT_QUERY_BASE = `
  SELECT
    p.n환자ID,
    p.sz차트번호,
    p.sz이름,
    p.sz휴대폰번호,
    p.sz생년월일,
    p.b성별,
    p.sz최종내원일,
    p.sz등록시각,
    -- 최근 진료 코드 (세부처치내역에서 취소되지 않은 최신 항목)
    (SELECT TOP 1 t.sz수가코드
     FROM TB_세부처치내역 t
     WHERE t.n환자ID = p.n환자ID AND t.b취소 = 0
     ORDER BY t.sz진료일 DESC, t.nID DESC) AS last_treatment_type,
    -- 다음 예약 (오늘 이후)
    (SELECT TOP 1 LEFT(a.sz예약시각, 8)
     FROM TB_예약목록 a
     WHERE a.n환자ID = p.n환자ID AND a.sz예약시각 >= CONVERT(VARCHAR(8), GETDATE(), 112)
     ORDER BY a.sz예약시각 ASC) AS next_appointment_date
  FROM TB_환자정보 p
  WHERE p.sz이름 IS NOT NULL AND p.sz이름 != ''
`;

async function getAllPatients(pool: sql.ConnectionPool) {
  const result = await pool.request().query(`${PATIENT_QUERY_BASE} ORDER BY p.n환자ID`);
  return result.recordset.map(formatPatientRow);
}

async function getUpdatedPatients(pool: sql.ConnectionPool, since: Date) {
  const sinceStr = since.toISOString().slice(0, 10).replace(/-/g, ''); // '20260416'
  const result = await pool.request()
    .input('sinceDate', sql.DateTime, since)
    .input('sinceDateStr', sql.VarChar, sinceStr)
    .query(`
      ${PATIENT_QUERY_BASE}
        AND (p.t수정시각 >= @sinceDate
             OR p.n환자ID IN (SELECT n환자ID FROM TB_접수목록 WHERE LEFT(sz접수시각, 8) >= @sinceDateStr))
      ORDER BY p.n환자ID
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

const DCM_BRIDGE_PASSWORD = 'Dcm!Bridge2026#';

/**
 * SYSTEM 권한 스케줄 태스크를 이용하여 전용 SQL Server 읽기 전용 로그인을 생성한다.
 * SQL Server가 LocalSystem으로 실행 중인 경우에만 동작.
 */
async function createDedicatedSqlLogin(): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');

    const sqlScript = `
IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = 'dcm_bridge')
  CREATE LOGIN [dcm_bridge] WITH PASSWORD = '${DCM_BRIDGE_PASSWORD}', DEFAULT_DATABASE=[master], CHECK_POLICY=OFF;

DECLARE @dbName NVARCHAR(128);
DECLARE db_cursor CURSOR FOR
  SELECT name FROM sys.databases WHERE name IN ('DentWeb','DENTWEBDB');
OPEN db_cursor;
FETCH NEXT FROM db_cursor INTO @dbName;
WHILE @@FETCH_STATUS = 0
BEGIN
  DECLARE @sql NVARCHAR(MAX);
  SET @sql = 'USE [' + @dbName + ']; IF NOT EXISTS (SELECT * FROM sys.database_principals WHERE name = ''dcm_bridge'') CREATE USER [dcm_bridge] FOR LOGIN [dcm_bridge]; EXEC sp_addrolemember ''db_datareader'', ''dcm_bridge'';';
  EXEC sp_executesql @sql;
  FETCH NEXT FROM db_cursor INTO @dbName;
END
CLOSE db_cursor;
DEALLOCATE db_cursor;
`;

    const tmpDir = os.tmpdir();
    const sqlFile = path.join(tmpDir, 'dcm_create_login.sql');
    const outFile = path.join(tmpDir, 'dcm_create_login.out');
    fs.writeFileSync(sqlFile, sqlScript, 'utf8');

    // PowerShell로 SYSTEM 스케줄 태스크 생성/실행
    const psScript = `
$action = New-ScheduledTaskAction -Execute 'sqlcmd' -Argument '-S localhost\\DENTWEB -E -i "${sqlFile.replace(/\\/g, '\\\\')}" -o "${outFile.replace(/\\/g, '\\\\')}"'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName 'DcmBridgeLogin' -Action $action -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName 'DcmBridgeLogin'
Start-Sleep -Seconds 8
$info = Get-ScheduledTaskInfo -TaskName 'DcmBridgeLogin'
Unregister-ScheduledTask -TaskName 'DcmBridgeLogin' -Confirm:$false
Write-Output $info.LastTaskResult
`;

    const result = execSync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      encoding: 'utf8',
      timeout: 20000,
    }).trim();

    // Clean up
    try { fs.unlinkSync(sqlFile); } catch { /* ignore */ }
    try { fs.unlinkSync(outFile); } catch { /* ignore */ }

    if (result === '0') {
      log('info', '[DentWeb] 전용 SQL 로그인 생성 완료 (dcm_bridge)');
      return true;
    }
    log('warn', `[DentWeb] 전용 SQL 로그인 생성 태스크 결과: ${result}`);
    return false;
  } catch (err) {
    log('error', `[DentWeb] 전용 SQL 로그인 생성 실패: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * Windows 레지스트리에서 SQL Server 인스턴스의 TCP 포트를 읽어온다.
 * 실패 시 undefined 반환.
 */
async function readSqlPortFromRegistry(instanceId: string): Promise<number | undefined> {
  try {
    const { execSync } = await import('child_process');
    const regPath = `HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server\\${instanceId}\\MSSQLServer\\SuperSocketNetLib\\Tcp\\IPAll`;
    const output = execSync(`reg query "${regPath}" /v TcpPort`, { encoding: 'utf8', timeout: 5000 });
    const match = output.match(/TcpPort\s+REG_SZ\s+(\d+)/);
    if (match) return parseInt(match[1], 10);
  } catch { /* 레지스트리 읽기 실패 — 무시 */ }
  return undefined;
}

/**
 * Windows 레지스트리에서 SQL Server 인스턴스 ID 목록을 찾는다.
 * 예: MSSQL15.DENTWEB, MSSQL15.MSSQLSERVER 등
 */
async function findSqlInstanceIds(): Promise<string[]> {
  try {
    const { execSync } = await import('child_process');
    const output = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server" /v InstalledInstances',
      { encoding: 'utf8', timeout: 5000 },
    );
    // InstalledInstances가 multi-string이므로 직접 서브키 탐색으로 폴백
    // MSSQL*.* 형태의 서브키 목록 가져오기
    const subkeysOutput = execSync(
      'reg query "HKLM\\SOFTWARE\\Microsoft\\Microsoft SQL Server"',
      { encoding: 'utf8', timeout: 5000 },
    );
    const ids: string[] = [];
    for (const line of subkeysOutput.split('\n')) {
      const m = line.match(/\\(MSSQL\d+\.\w+)\s*$/);
      if (m) ids.push(m[1]);
    }
    return ids;
  } catch { return []; }
}

interface DetectCandidate {
  server: string;
  instanceName?: string;
  port?: number;
  database: string;
  authType: 'windows' | 'sql';
  user?: string;
  password?: string;
}

async function detectSqlServer(): Promise<boolean> {
  log('info', '[DentWeb] DB 자동 감지 시작...');

  // 1. 레지스트리에서 DENTWEB 인스턴스 포트 확인
  const instanceIds = await findSqlInstanceIds();
  let dentwebPort: number | undefined;
  let dentwebInstanceId: string | undefined;
  for (const id of instanceIds) {
    if (id.toUpperCase().includes('DENTWEB')) {
      dentwebInstanceId = id;
      dentwebPort = await readSqlPortFromRegistry(id);
      if (dentwebPort) {
        log('info', `[DentWeb] 레지스트리에서 포트 감지: ${id} → TCP ${dentwebPort}`);
      }
      break;
    }
  }

  // 2. 후보 목록 생성 (우선순위 순)
  const databases = ['DentWeb', 'DENTWEBDB'];
  const candidates: DetectCandidate[] = [];

  // 2a. DENTWEB named instance — instanceName 방식 (SQL Browser 사용)
  for (const db of databases) {
    candidates.push({ server: 'localhost', instanceName: 'DENTWEB', database: db, authType: 'windows' });
  }

  // 2b. DENTWEB named instance — 레지스트리에서 읽은 정확한 포트 사용
  if (dentwebPort) {
    for (const db of databases) {
      candidates.push({ server: 'localhost', port: dentwebPort, database: db, authType: 'windows' });
    }
  }

  // 2c. 기본 인스턴스 (port 1433)
  for (const db of databases) {
    candidates.push({ server: 'localhost', port: 1433, database: db, authType: 'windows' });
  }

  // 2d. SQLEXPRESS named instance
  for (const db of databases) {
    candidates.push({ server: 'localhost', instanceName: 'SQLEXPRESS', database: db, authType: 'windows' });
  }

  // 2e. dcm_bridge 전용 로그인 (이미 생성된 경우)
  for (const db of databases) {
    candidates.push({ server: 'localhost', instanceName: 'DENTWEB', database: db, authType: 'sql', user: 'dcm_bridge', password: DCM_BRIDGE_PASSWORD });
  }
  if (dentwebPort) {
    for (const db of databases) {
      candidates.push({ server: 'localhost', port: dentwebPort, database: db, authType: 'sql', user: 'dcm_bridge', password: DCM_BRIDGE_PASSWORD });
    }
  }

  // 2f. SA 계정 시도 (일반적인 DentWeb 기본 비밀번호들)
  const saPasswords = ['', 'sa', '1234', 'dentweb', 'DentWeb', 'password'];
  if (dentwebPort) {
    for (const db of databases) {
      for (const pw of saPasswords) {
        candidates.push({ server: 'localhost', port: dentwebPort, database: db, authType: 'sql', user: 'sa', password: pw });
      }
    }
  }
  for (const db of databases) {
    candidates.push({ server: 'localhost', instanceName: 'DENTWEB', database: db, authType: 'sql', user: 'sa', password: '' });
    candidates.push({ server: 'localhost', instanceName: 'DENTWEB', database: db, authType: 'sql', user: 'sa', password: 'sa' });
  }

  for (const candidate of candidates) {
    try {
      const testConfig: sql.config = {
        server: candidate.server,
        database: candidate.database,
        options: {
          encrypt: false,
          trustServerCertificate: true,
          connectTimeout: 5000,
          requestTimeout: 5000,
          instanceName: candidate.instanceName,
        },
        pool: { min: 0, max: 1 },
      };

      // Named instance는 port 지정하지 않음 (SQL Browser가 해결)
      if (!candidate.instanceName && candidate.port) {
        testConfig.port = candidate.port;
      }

      if (candidate.authType === 'windows') {
        testConfig.authentication = { type: 'ntlm', options: { domain: '', userName: '', password: '' } };
      } else {
        testConfig.user = candidate.user || 'sa';
        testConfig.password = candidate.password || '';
      }

      const testPool = await new sql.ConnectionPool(testConfig).connect();
      // Check if PATIENT table exists
      const result = await testPool.request().query(
        "SELECT TOP 1 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TB_환자정보'"
      );
      await testPool.close();

      if (result.recordset.length > 0) {
        // 서버 주소 형식 복원 (config-store 저장용)
        const serverAddr = candidate.instanceName
          ? `${candidate.server}\\${candidate.instanceName}`
          : candidate.server;
        log('info', `[DentWeb] DB 자동 감지 성공: ${serverAddr}/${candidate.database} (${candidate.authType} auth, port=${candidate.port || 'auto'})`);
        const configUpdate: Record<string, unknown> = {
          dentwebDbServer: serverAddr,
          dentwebDbDatabase: candidate.database,
          dentwebDbAuthType: candidate.authType,
        };
        if (candidate.port && !candidate.instanceName) {
          configUpdate.dentwebDbPort = candidate.port;
        }
        if (candidate.authType === 'sql') {
          configUpdate.dentwebDbUser = candidate.user || 'sa';
          configUpdate.dentwebDbPassword = candidate.password || '';
        }
        setConfig(configUpdate as Parameters<typeof setConfig>[0]);
        return true;
      }
    } catch (err) {
      const label = candidate.instanceName
        ? `${candidate.server}\\${candidate.instanceName}`
        : `${candidate.server}:${candidate.port}`;
      log('debug', `[DentWeb] 후보 실패: ${label}/${candidate.database} (${candidate.authType}) — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // 모든 후보 실패 — 전용 SQL 로그인 자동 생성 시도
  log('info', '[DentWeb] 기존 인증 방법 실패 — 전용 SQL 로그인(dcm_bridge) 자동 생성 시도...');
  const loginCreated = await createDedicatedSqlLogin();
  if (loginCreated) {
    // 생성된 로그인으로 재시도
    const dbNames = ['DentWeb', 'DENTWEBDB'];
    for (const db of dbNames) {
      try {
        const testConfig: sql.config = {
          server: 'localhost',
          database: db,
          options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000, requestTimeout: 5000, instanceName: 'DENTWEB' },
          user: 'dcm_bridge', password: DCM_BRIDGE_PASSWORD,
          pool: { min: 0, max: 1 },
        };
        const testPool = await new sql.ConnectionPool(testConfig).connect();
        const result = await testPool.request().query(
          "SELECT TOP 1 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TB_환자정보'"
        );
        await testPool.close();
        if (result.recordset.length > 0) {
          log('info', `[DentWeb] 전용 로그인으로 DB 감지 성공: localhost\\DENTWEB/${db}`);
          setConfig({
            dentwebDbServer: 'localhost\\DENTWEB',
            dentwebDbDatabase: db,
            dentwebDbAuthType: 'sql',
            dentwebDbUser: 'dcm_bridge',
            dentwebDbPassword: DCM_BRIDGE_PASSWORD,
          } as Parameters<typeof setConfig>[0]);
          return true;
        }
      } catch (err) {
        log('debug', `[DentWeb] dcm_bridge 로그인 시도 실패 (${db}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // instanceName 방식이 안 되면 직접 포트로도 시도
    if (dentwebPort) {
      for (const db of dbNames) {
        try {
          const testConfig: sql.config = {
            server: 'localhost',
            port: dentwebPort,
            database: db,
            options: { encrypt: false, trustServerCertificate: true, connectTimeout: 5000, requestTimeout: 5000 },
            user: 'dcm_bridge', password: DCM_BRIDGE_PASSWORD,
            pool: { min: 0, max: 1 },
          };
          const testPool = await new sql.ConnectionPool(testConfig).connect();
          const result = await testPool.request().query(
            "SELECT TOP 1 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TB_환자정보'"
          );
          await testPool.close();
          if (result.recordset.length > 0) {
            log('info', `[DentWeb] 전용 로그인으로 DB 감지 성공: localhost:${dentwebPort}/${db}`);
            setConfig({
              dentwebDbServer: 'localhost',
              dentwebDbPort: dentwebPort,
              dentwebDbDatabase: db,
              dentwebDbAuthType: 'sql',
              dentwebDbUser: 'dcm_bridge',
              dentwebDbPassword: DCM_BRIDGE_PASSWORD,
            } as Parameters<typeof setConfig>[0]);
            return true;
          }
        } catch { /* next */ }
      }
    }
  }

  log('warn', '[DentWeb] DB 자동 감지 실패 — 수동 설정 필요');
  return false;
}

/* ------------------------------------------------------------------ */
/*  Monthly revenue queries                                            */
/* ------------------------------------------------------------------ */

interface MonthlyRevenue {
  year: number;
  month: number;
  insurance_revenue: number;
  non_insurance_revenue: number;
  other_revenue: number;
}

/**
 * 덴트웹 DB에서 월별 수입 합계를 조회한다.
 * - TB_진료비내역: 기간별 진료비 통계 원본 (공단부담금 + 본인부담금 + 비급여)
 * - TB_수입지출장부: 기타 수입 (b수입지출=0)
 *
 * 보험수입 = 공단부담금 + 본인부담금 (TB_진료비내역)
 * 비보험수입 = 비급여진료비 (TB_진료비내역)
 */
async function getMonthlyRevenue(dbPool: sql.ConnectionPool, year: number, month: number): Promise<MonthlyRevenue> {
  const yyyyMM = `${year}${String(month).padStart(2, '0')}`;

  // 1. 진료비내역에서 보험/비보험 합계 (기간별 진료비 통계 기준)
  const treatmentResult = await dbPool.request()
    .input('yyyyMM', sql.VarChar, yyyyMM)
    .query(`
      SELECT
        COALESCE(SUM(n공단부담금), 0) + COALESCE(SUM(n본인부담금), 0) AS insurance_revenue,
        COALESCE(SUM(n비급여진료비), 0) AS non_insurance_revenue
      FROM TB_진료비내역
      WHERE LEFT(sz진료일, 6) = @yyyyMM
    `);

  const treatRow = treatmentResult.recordset[0] || {};

  // 2. 수입지출장부에서 기타 수입 합계 (b수입지출=0 → 수입)
  const ledgerResult = await dbPool.request()
    .input('yyyyMM', sql.VarChar, yyyyMM)
    .query(`
      SELECT COALESCE(SUM(n총액), 0) AS other_revenue
      FROM TB_수입지출장부
      WHERE b수입지출 = 0 AND LEFT(sz작성시각, 6) = @yyyyMM
    `);

  const ledgerRow = ledgerResult.recordset[0] || {};

  return {
    year,
    month,
    insurance_revenue: treatRow.insurance_revenue || 0,
    non_insurance_revenue: treatRow.non_insurance_revenue || 0,
    other_revenue: ledgerRow.other_revenue || 0,
  };
}

/**
 * 단일 월 수입 데이터를 서버에 전송하고 성공 여부 반환
 */
async function syncSingleMonthRevenue(
  dbPool: sql.ConnectionPool,
  year: number,
  month: number,
  clinicId: string,
  apiKey: string,
  dashboardUrl: string,
): Promise<boolean> {
  try {
    const revenue = await getMonthlyRevenue(dbPool, year, month);

    // 수입이 0이어도 전송하여 revenue_records에 기록을 남김
    // (전송 생략 시 대시보드가 매번 pending에 재추가하는 무한 루프 발생)
    const url = `${dashboardUrl}/api/dentweb/sync-revenue`;
    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clinic_id: clinicId,
        api_key: apiKey,
        year: revenue.year,
        month: revenue.month,
        insurance_revenue: revenue.insurance_revenue,
        non_insurance_revenue: revenue.non_insurance_revenue,
        other_revenue: revenue.other_revenue,
      }),
    });

    const result = await response.json();
    if (result.success) {
      log('info', `[DentWeb] ${year}-${String(month).padStart(2, '0')} 수입 동기화 완료: 보험=${revenue.insurance_revenue}, 비보험=${revenue.non_insurance_revenue}, 기타=${revenue.other_revenue}`);
      return true;
    } else {
      log('warn', `[DentWeb] ${year}-${String(month).padStart(2, '0')} 수입 동기화 실패: ${result.error}`);
      return false;
    }
  } catch (err) {
    log('warn', `[DentWeb] ${year}-${String(month).padStart(2, '0')} 수입 동기화 오류: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/**
 * pending_revenue_months에서 요청된 월 동기화 + 처리 완료된 항목 제거
 * 서버 API를 통해 pending 조회/정리 (RLS 우회)
 */
async function processPendingRevenueMonths(dbPool: sql.ConnectionPool): Promise<void> {
  const cfg = getDentwebConfig();
  const { dashboardUrl } = getConfig();
  if (!cfg.clinicId || !cfg.apiKey) return;

  try {
    // 서버 API로 pending 목록 조회 (RLS 우회)
    const pendingUrl = `${dashboardUrl}/api/dentweb/pending-revenue?clinic_id=${cfg.clinicId}&api_key=${cfg.apiKey}`;
    const pendingRes = await fetchWithRetry(pendingUrl, undefined, 1);
    const pendingData = await pendingRes.json();

    if (!pendingData.success) {
      log('warn', `[DentWeb] pending 조회 실패: ${pendingData.error}`);
      return;
    }

    const pending = (pendingData.data?.pending_months || []) as Array<{ year: number; month: number }>;
    if (pending.length === 0) return;

    log('info', `[DentWeb] on-demand 수입 동기화 요청 ${pending.length}건 처리 시작`);

    const completed: Array<{ year: number; month: number }> = [];

    for (const { year, month } of pending) {
      const success = await syncSingleMonthRevenue(dbPool, year, month, cfg.clinicId, cfg.apiKey, dashboardUrl);
      if (success) {
        completed.push({ year, month });
      }
    }

    // 완료된 항목을 서버 API로 제거 (RLS 우회)
    if (completed.length > 0) {
      const removeUrl = `${dashboardUrl}/api/dentweb/pending-revenue`;
      const removeRes = await fetchWithRetry(removeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: cfg.clinicId,
          api_key: cfg.apiKey,
          completed_months: completed,
        }),
      }, 1);
      const removeData = await removeRes.json();

      if (removeData.success) {
        log('info', `[DentWeb] on-demand 수입 동기화 완료: ${completed.length}건 처리, ${removeData.data?.remaining_count || 0}건 잔여`);
      } else {
        log('warn', `[DentWeb] pending 제거 실패: ${removeData.error}`);
      }
    }
  } catch (err) {
    log('warn', `[DentWeb] on-demand 수입 동기화 오류: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 수입 데이터를 서버에 전송.
 * - 당월 + 전월 기본 동기화
 * - pending_revenue_months에 요청된 월이 있으면 on-demand 동기화
 */
async function syncRevenueToServer(dbPool: sql.ConnectionPool): Promise<void> {
  const cfg = getDentwebConfig();
  const { dashboardUrl } = getConfig();

  if (!cfg.clinicId || !cfg.apiKey) return;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 기본: 당월 + 전월 동기화
  const months: Array<{ year: number; month: number }> = [
    { year: currentYear, month: currentMonth },
  ];
  if (currentMonth === 1) {
    months.push({ year: currentYear - 1, month: 12 });
  } else {
    months.push({ year: currentYear, month: currentMonth - 1 });
  }

  for (const { year, month } of months) {
    await syncSingleMonthRevenue(dbPool, year, month, cfg.clinicId, cfg.apiKey, dashboardUrl);
  }

  // on-demand: pending_revenue_months 처리
  await processPendingRevenueMonths(dbPool);
}

/* ------------------------------------------------------------------ */
/*  Schema discovery                                                   */
/* ------------------------------------------------------------------ */

/** DentWeb DB 전체 스키마를 INFORMATION_SCHEMA에서 탐색 */
async function discoverDentwebSchema(dbPool: sql.ConnectionPool): Promise<{
  tables: Array<{ name: string; columns: Array<{ name: string; type: string; max_length: number | null; is_nullable: string }> }>;
  writableTables: string[];
}> {
  log('info', '[DentWeb] Discovering database schema...');

  const tablesResult = await dbPool.request().query(`
    SELECT TABLE_NAME
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_TYPE = 'BASE TABLE'
    ORDER BY TABLE_NAME
  `);

  const columnsResult = await dbPool.request().query(`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE,
           CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
    FROM INFORMATION_SCHEMA.COLUMNS
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);

  const columnsByTable = new Map<string, Array<{ name: string; type: string; max_length: number | null; is_nullable: string }>>();
  for (const col of columnsResult.recordset) {
    const tableName = col.TABLE_NAME;
    if (!columnsByTable.has(tableName)) {
      columnsByTable.set(tableName, []);
    }
    columnsByTable.get(tableName)!.push({
      name: col.COLUMN_NAME,
      type: col.DATA_TYPE,
      max_length: col.CHARACTER_MAXIMUM_LENGTH,
      is_nullable: col.IS_NULLABLE,
    });
  }

  const tables = tablesResult.recordset.map((t: { TABLE_NAME: string }) => ({
    name: t.TABLE_NAME,
    columns: columnsByTable.get(t.TABLE_NAME) || [],
  }));

  // 포스트잇/메모 관련 테이블 자동 식별 (쓰기 허용 대상)
  const writablePatterns = ['포스트', 'postit', 'post_it', '메모', 'memo', '쪽지', 'note', '노트'];
  const writableTables = tables
    .filter((t: { name: string }) => writablePatterns.some(p => t.name.toLowerCase().includes(p.toLowerCase()) || t.name.includes(p)))
    .map((t: { name: string }) => t.name);

  log('info', `[DentWeb] Schema discovered: ${tables.length} tables, ${writableTables.length} writable tables: ${writableTables.join(', ') || '(none)'}`);

  return { tables, writableTables };
}

/* ------------------------------------------------------------------ */
/*  Query proxy (Realtime + polling fallback)                          */
/* ------------------------------------------------------------------ */

let realtimeChannel: RealtimeChannel | null = null;
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let queryApiClient: DentwebApiClient | null = null;
let cachedWritableTables: string[] = [];
// 첫 연결 실패 후 재감지로 DB가 붙었을 때 proxy 재시도 여부 판별
let queryProxyStarted = false;

/** 읽기 쿼리 안전 검증 */
function validateReadQuery(queryText: string): void {
  const normalized = queryText.trim().toUpperCase();

  if (!normalized.startsWith('SELECT')) {
    throw new Error('읽기 모드에서는 SELECT 쿼리만 실행할 수 있습니다.');
  }

  // 최상위 레벨에서 위험 명령 차단
  const dangerousTopLevel = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE'];
  for (const cmd of dangerousTopLevel) {
    if (normalized.startsWith(cmd)) {
      throw new Error(`읽기 모드에서는 ${cmd} 명령을 실행할 수 없습니다.`);
    }
  }

  // xp_ / sp_ 위험 프로시저 차단
  if (/\b(XP_|SP_)\w+/i.test(queryText)) {
    throw new Error('시스템 프로시저 호출은 차단되어 있습니다.');
  }
}

/** 쓰기 쿼리 안전 검증 (포스트잇 테이블만 허용) */
function validateWriteQuery(queryText: string, writableTables: string[]): void {
  const normalized = queryText.trim().toUpperCase();

  if (!normalized.startsWith('INSERT') && !normalized.startsWith('UPDATE')) {
    throw new Error('쓰기 모드에서는 INSERT 또는 UPDATE만 실행할 수 있습니다.');
  }

  // 위험 명령 차단
  const blocked = ['DROP', 'TRUNCATE', 'ALTER', 'CREATE', 'EXEC', 'EXECUTE', 'XP_', 'DELETE'];
  for (const cmd of blocked) {
    const regex = new RegExp(`\\b${cmd}\\b`, 'i');
    if (regex.test(queryText)) {
      throw new Error(`차단된 SQL 명령입니다: ${cmd}`);
    }
  }

  // 대상 테이블 추출
  let targetTable = '';
  if (normalized.startsWith('INSERT')) {
    const match = queryText.match(/INSERT\s+INTO\s+\[?(\w+)\]?/i);
    targetTable = match?.[1] || '';
  } else if (normalized.startsWith('UPDATE')) {
    const match = queryText.match(/UPDATE\s+\[?(\w+)\]?/i);
    targetTable = match?.[1] || '';
  }

  if (!targetTable) {
    throw new Error('대상 테이블을 식별할 수 없습니다.');
  }

  const isAllowed = writableTables.some(
    t => t.toUpperCase() === targetTable.toUpperCase()
  );

  if (!isAllowed) {
    throw new Error(
      `쓰기가 허용되지 않은 테이블입니다: ${targetTable}. 허용된 테이블: ${writableTables.join(', ') || '(없음)'}`
    );
  }
}

/** 쿼리 요청 처리 (읽기/쓰기 공통) */
async function handleQueryRequest(
  dbPool: sql.ConnectionPool,
  request: { id: string; query_type: string; query_text: string },
  apiClient: DentwebApiClient,
  clinicId: string,
  apiKey: string,
  writableTables: string[]
): Promise<void> {
  const startTime = Date.now();

  try {
    if (request.query_type === 'write') {
      validateWriteQuery(request.query_text, writableTables);
    } else {
      validateReadQuery(request.query_text);
    }

    // SQL 실행 (30초 타임아웃)
    const sqlRequest = dbPool.request();
    (sqlRequest as unknown as { timeout: number }).timeout = 30000;
    const result = await sqlRequest.query(request.query_text);

    const executionTime = Date.now() - startTime;
    const data = result.recordset || [];
    const rowCount = data.length || result.rowsAffected?.[0] || 0;

    // 최대 1000행 제한
    const limitedData = data.slice(0, 1000);

    log('info', `[DentWeb] Query executed: ${request.id} (${rowCount} rows, ${executionTime}ms)`);

    await apiClient.submitQueryResult(clinicId, apiKey, {
      request_id: request.id,
      data: limitedData,
      row_count: rowCount,
      execution_time_ms: executionTime,
    });
  } catch (error) {
    const executionTime = Date.now() - startTime;
    log('error', `[DentWeb] Query error: ${request.id} - ${String(error)}`);

    await apiClient.submitQueryResult(clinicId, apiKey, {
      request_id: request.id,
      error_message: String(error),
      execution_time_ms: executionTime,
    });
  }
}

/** Supabase Realtime 구독 시작 - 쿼리 요청 수신 */
async function startQueryProxy(
  dbPool: sql.ConnectionPool,
  clinicId: string,
  apiKey: string,
  apiClient: DentwebApiClient,
  writableTables: string[]
): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://beahjntkmkfhpcbhfnrr.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseAnonKey) {
    log('warn', '[DentWeb] Supabase anon key not available for Realtime. Falling back to polling.');
    startQueryPolling(dbPool, clinicId, apiKey, apiClient, writableTables);
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    realtimeChannel = supabase.channel(`dentweb-queries-${clinicId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'dentweb_query_requests',
        filter: `clinic_id=eq.${clinicId}`,
      }, async (payload) => {
        const request = payload.new as {
          id: string;
          query_type: string;
          query_text: string;
          status: string;
        };

        if (request.status !== 'pending') return;

        log('info', `[DentWeb] Query request received via Realtime: ${request.id} (${request.query_type})`);
        await handleQueryRequest(dbPool, request, apiClient, clinicId, apiKey, writableTables);
      })
      .subscribe((status) => {
        log('info', `[DentWeb] Realtime subscription status: ${status}`);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          log('warn', '[DentWeb] Realtime subscription failed, falling back to polling.');
          realtimeChannel?.unsubscribe();
          realtimeChannel = null;
          startQueryPolling(dbPool, clinicId, apiKey, apiClient, writableTables);
        }
      });
  } catch (err) {
    log('warn', `[DentWeb] Realtime setup failed: ${err instanceof Error ? err.message : String(err)}. Falling back to polling.`);
    startQueryPolling(dbPool, clinicId, apiKey, apiClient, writableTables);
  }
}

/** 폴링 방식 폴백 (Realtime을 사용할 수 없을 때) */
async function startQueryPolling(
  dbPool: sql.ConnectionPool,
  clinicId: string,
  apiKey: string,
  apiClient: DentwebApiClient,
  writableTables: string[]
): Promise<void> {
  if (pollingInterval) return; // 이미 폴링 중

  log('info', '[DentWeb] Starting query polling (5s interval)...');

  pollingInterval = setInterval(async () => {
    try {
      const requests = await apiClient.pollPendingQueries(clinicId, apiKey);
      if (!requests || requests.length === 0) return;

      for (const request of requests) {
        await handleQueryRequest(dbPool, request, apiClient, clinicId, apiKey, writableTables);
      }
    } catch {
      // 폴링 실패 시 무시 (다음 주기에 재시도)
    }
  }, 5000);
}

/** 쿼리 프록시 정지 */
function stopQueryProxy(): void {
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    realtimeChannel = null;
  }
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  queryApiClient = null;
  queryProxyStarted = false;
  log('info', '[DentWeb] Query proxy stopped');
}

/**
 * Schema 제출 + 쿼리 프록시를 보장한다.
 * 첫 연결 실패 후 재감지로 DB가 붙으면 이 함수가 주기 콜백에서 재시도한다.
 */
async function ensureQueryProxy(
  dbPool: sql.ConnectionPool,
  cfg: ReturnType<typeof getDentwebConfig>
): Promise<void> {
  if (queryProxyStarted) return;
  if (!dbPool.connected || !cfg.clinicId || !cfg.apiKey) return;

  try {
    queryApiClient = new DentwebApiClient();
    const { tables, writableTables } = await discoverDentwebSchema(dbPool);
    cachedWritableTables = writableTables;

    await queryApiClient.submitSchema(
      cfg.clinicId,
      cfg.apiKey,
      { tables },
      writableTables
    );
    log('info', '[DentWeb] Schema submitted to server');

    await startQueryProxy(dbPool, cfg.clinicId, cfg.apiKey, queryApiClient, writableTables);
    queryProxyStarted = true;
  } catch (err) {
    // 실패 시 플래그를 유지하지 않아 다음 주기에 재시도 가능
    queryProxyStarted = false;
    throw err;
  }
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

      // 환자가 0명이어도 월별 수입 데이터는 동기화
      try {
        await syncRevenueToServer(pool!);
      } catch (revErr) {
        log('warn', `[DentWeb] 수입 동기화 오류: ${revErr instanceof Error ? revErr.message : String(revErr)}`);
      }

      setStatus('polling');
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

      // 환자 동기화 성공 후 월별 수입 데이터도 동기화
      try {
        await syncRevenueToServer(pool!);
      } catch (revErr) {
        log('warn', `[DentWeb] 수입 동기화 오류 (환자 동기화는 성공): ${revErr instanceof Error ? revErr.message : String(revErr)}`);
      }

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

  // Auto-detect SQL Server if not configured, still at defaults, or last sync failed
  const needsDetection =
    (cfg.dbServer === 'localhost' && cfg.dbAuthType === 'windows') ||  // 기본값 그대로
    cfg.lastSyncStatus === 'error' ||                                  // 이전 동기화 실패
    !cfg.lastSyncDate;                                                 // 성공한 적 없음
  if (needsDetection) {
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

  // Schema discovery + query proxy (DB 연결 성공 시에만; 실패해도 기존 동기화는 계속 진행)
  if (pool && pool.connected && cfg.clinicId && cfg.apiKey) {
    try {
      await ensureQueryProxy(pool, cfg);
    } catch (err) {
      log('warn', `[DentWeb] Schema discovery / query proxy 시작 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Start interval
  const interval = (getDentwebConfig().syncInterval || 300) * 1000;
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    runSync()
      .then(() => {
        // 첫 시작 때 DB 연결 실패로 proxy skip 된 경우 주기마다 재시도
        const latestCfg = getDentwebConfig();
        if (pool && pool.connected && latestCfg.clinicId && latestCfg.apiKey) {
          ensureQueryProxy(pool, latestCfg).catch(err => {
            log('warn', `[DentWeb] Query proxy 재시도 실패: ${err instanceof Error ? err.message : String(err)}`);
          });
        }
      })
      .catch(err => {
        log('error', `[DentWeb] 스케줄 동기화 오류: ${err instanceof Error ? err.message : String(err)}`);
      });
  }, interval);
}

export async function stopDentwebSync(): Promise<void> {
  // 쿼리 프록시 정지 (Realtime 채널 해제 + 폴링 중지)
  stopQueryProxy();

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
