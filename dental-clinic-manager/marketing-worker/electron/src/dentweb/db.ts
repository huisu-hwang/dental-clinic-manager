import sql from 'mssql';
import { getDentwebConfig } from '../config-store';
import { log } from '../logger';

// ============================================
// 덴트웹 MS SQL Server 연결 및 쿼리
// dentweb-bridge-agent/src/dentweb-db.ts 에서 이식
// ============================================

export interface DentwebPatientRow {
  dentweb_patient_id: string;
  chart_number: string | null;
  patient_name: string;
  phone_number: string | null;
  birth_date: Date | null;
  gender: string | null;
  last_visit_date: Date | null;
  last_treatment_type: string | null;
  next_appointment_date: Date | null;
  registration_date: Date | null;
}

// MS SQL Server 연결 설정 — 호출 시점의 최신 config 반영
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
      trustedConnection: cfg.dbUseWindowsAuth,
    },
    pool: {
      min: 0,
      max: 5,
      idleTimeoutMillis: 30000,
    },
  };

  if (cfg.dbUseWindowsAuth) {
    log('info', '[Dentweb/DB] Windows 인증 모드로 연결합니다');
    // Windows 인증: NTLM 사용 (현재 Windows 로그인 계정)
    baseConfig.authentication = {
      type: 'ntlm',
      options: {
        domain: '',
        userName: '',
        password: '',
      },
    };
  } else {
    log('info', `[Dentweb/DB] SQL Server 인증 모드로 연결합니다 (계정: ${cfg.dbUser})`);
    baseConfig.user = cfg.dbUser;
    baseConfig.password = cfg.dbPassword;
  }

  return baseConfig;
}

let pool: sql.ConnectionPool | null = null;

// DB 연결
export async function connectDB(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  try {
    log('info', '[Dentweb/DB] Connecting to DentWeb SQL Server...');
    pool = await new sql.ConnectionPool(buildSqlConfig()).connect();
    log('info', '[Dentweb/DB] Connected to DentWeb SQL Server successfully');
    return pool;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `[Dentweb/DB] Failed to connect to DentWeb SQL Server: ${msg}`);
    throw error;
  }
}

// DB 연결 종료
export async function disconnectDB(): Promise<void> {
  if (pool) {
    try {
      await pool.close();
    } catch {
      // ignore close errors
    }
    pool = null;
    log('info', '[Dentweb/DB] Disconnected from DentWeb SQL Server');
  }
}

// 연결 테스트
export async function testConnection(): Promise<boolean> {
  try {
    const conn = await connectDB();
    await conn.request().query('SELECT 1 AS test');
    log('info', '[Dentweb/DB] Connection test successful');
    return true;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `[Dentweb/DB] Connection test failed: ${msg}`);
    return false;
  }
}

// ========================================
// 실제 DB 쿼리
// NOTE: 덴트웹 DB 테이블/컬럼명은 설치 환경에 따라 다를 수 있음.
// 아래는 일반적인 덴트웹 스키마(PATIENT, RECEIPT, TREAT_DETAIL)를 기반으로 한 쿼리.
// ========================================

// 전체 환자 목록 조회 (전체 동기화)
export async function getAllPatients(): Promise<DentwebPatientRow[]> {
  const conn = await connectDB();

  try {
    const result = await conn.request().query(`
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `[Dentweb/DB] Failed to query all patients: ${msg}`);
    throw error;
  }
}

// 변경된 환자만 조회 (증분 동기화)
export async function getUpdatedPatients(since: Date): Promise<DentwebPatientRow[]> {
  const conn = await connectDB();

  try {
    const result = await conn.request()
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
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log('error', `[Dentweb/DB] Failed to query updated patients: ${msg}`);
    throw error;
  }
}

// 날짜 포맷팅 헬퍼
function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return date.toISOString().split('T')[0];
}

// 환자 row 포맷팅
function formatPatientRow(row: Record<string, unknown>): DentwebPatientRow {
  return {
    dentweb_patient_id: String(row.dentweb_patient_id),
    chart_number: row.chart_number as string | null,
    patient_name: String(row.patient_name || ''),
    phone_number: row.phone_number as string | null,
    birth_date: row.birth_date as Date | null,
    gender: row.gender as string | null,
    last_visit_date: row.last_visit_date as Date | null,
    last_treatment_type: row.last_treatment_type as string | null,
    next_appointment_date: row.next_appointment_date as Date | null,
    registration_date: row.registration_date as Date | null,
  };
}

// 환자 데이터를 동기화용 JSON으로 변환
export function patientToSyncData(patient: DentwebPatientRow): Record<string, unknown> {
  return {
    dentweb_patient_id: patient.dentweb_patient_id,
    chart_number: patient.chart_number,
    patient_name: patient.patient_name,
    phone_number: patient.phone_number,
    birth_date: formatDate(patient.birth_date),
    gender: patient.gender,
    last_visit_date: formatDate(patient.last_visit_date),
    last_treatment_type: patient.last_treatment_type,
    next_appointment_date: formatDate(patient.next_appointment_date),
    registration_date: formatDate(patient.registration_date),
    is_active: true,
  };
}
