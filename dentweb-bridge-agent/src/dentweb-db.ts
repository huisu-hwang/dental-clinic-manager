import sql from 'mssql'
import { config } from './config'
import { logger } from './logger'

interface DentwebPatientRow {
  dentweb_patient_id: string
  chart_number: string | null
  patient_name: string
  phone_number: string | null
  birth_date: Date | null
  gender: string | null
  last_visit_date: Date | null
  last_treatment_type: string | null
  next_appointment_date: Date | null
  registration_date: Date | null
}

// MS SQL Server 연결 설정
function buildSqlConfig(): sql.config {
  // Named instance 분리: 'localhost\DENTWEB' → server='localhost', instanceName='DENTWEB'
  let serverHost = config.dentweb.server
  let instanceName: string | undefined
  const backslashIdx = config.dentweb.server.indexOf('\\')
  if (backslashIdx > 0) {
    serverHost = config.dentweb.server.substring(0, backslashIdx)
    instanceName = config.dentweb.server.substring(backslashIdx + 1)
  }

  const baseConfig: sql.config = {
    server: serverHost,
    database: config.dentweb.database,
    options: {
      encrypt: false,
      trustServerCertificate: true,
      enableArithAbort: true,
      connectTimeout: 10000,
      requestTimeout: 30000,
      trustedConnection: config.dentweb.useWindowsAuth,
      instanceName,
    },
    pool: {
      min: 0,
      max: 5,
      idleTimeoutMillis: 30000,
    },
  }

  // Named instance인 경우 SQL Browser가 포트를 해결하므로 port를 지정하지 않음
  if (!instanceName) {
    baseConfig.port = config.dentweb.port
  }

  if (config.dentweb.useWindowsAuth) {
    logger.info(`Windows 인증 모드로 연결합니다 (server=${serverHost}, instance=${instanceName || 'default'})`)
    // Windows 인증: NTLM 사용 (현재 Windows 로그인 계정)
    baseConfig.authentication = {
      type: 'ntlm',
      options: {
        domain: '',
        userName: '',
        password: '',
      },
    }
  } else {
    logger.info(`SQL Server 인증 모드로 연결합니다 (계정: ${config.dentweb.user}, server=${serverHost}, instance=${instanceName || 'default'})`)
    baseConfig.user = config.dentweb.user
    baseConfig.password = config.dentweb.password
  }

  return baseConfig
}

const sqlConfig = buildSqlConfig()

let pool: sql.ConnectionPool | null = null

// DB 연결
export async function connectDB(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool
  }

  try {
    logger.info('Connecting to DentWeb SQL Server...')
    pool = await new sql.ConnectionPool(sqlConfig).connect()
    logger.info('Connected to DentWeb SQL Server successfully')
    return pool
  } catch (error) {
    logger.error('Failed to connect to DentWeb SQL Server', error)
    throw error
  }
}

// DB 연결 종료
export async function disconnectDB(): Promise<void> {
  if (pool) {
    await pool.close()
    pool = null
    logger.info('Disconnected from DentWeb SQL Server')
  }
}

// 연결 테스트
export async function testConnection(): Promise<boolean> {
  try {
    const conn = await connectDB()
    const result = await conn.request().query('SELECT 1 AS test')
    logger.info('Connection test successful', result.recordset)
    return true
  } catch (error) {
    logger.error('Connection test failed', error)
    return false
  }
}

// ========================================
// 데모 모드: 모의 환자 데이터 생성
// ========================================

const DEMO_LAST_NAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임']
const DEMO_FIRST_NAMES = ['민수', '서연', '지훈', '수빈', '현우', '하은', '준호', '다은', '성민', '예진', '동현', '소영', '태희', '유나', '재혁']
const DEMO_TREATMENTS = ['스케일링', '레진충전', '크라운', '신경치료', '임플란트', '교정', '발치', '미백', '잇몸치료', '보철']

function generateDemoPhone(): string {
  const mid = String(Math.floor(1000 + Math.random() * 9000))
  const last = String(Math.floor(1000 + Math.random() * 9000))
  return `010-${mid}-${last}`
}

function generateDemoDate(yearsBack: number): Date {
  const now = new Date()
  const past = new Date(now.getTime() - Math.random() * yearsBack * 365 * 24 * 60 * 60 * 1000)
  return past
}

function generateDemoBirthDate(): Date {
  const year = 1950 + Math.floor(Math.random() * 60)
  const month = Math.floor(Math.random() * 12)
  const day = 1 + Math.floor(Math.random() * 28)
  return new Date(year, month, day)
}

export function generateDemoPatients(count: number): DentwebPatientRow[] {
  const patients: DentwebPatientRow[] = []

  for (let i = 1; i <= count; i++) {
    const lastName = DEMO_LAST_NAMES[Math.floor(Math.random() * DEMO_LAST_NAMES.length)]
    const firstName = DEMO_FIRST_NAMES[Math.floor(Math.random() * DEMO_FIRST_NAMES.length)]
    const treatment = DEMO_TREATMENTS[Math.floor(Math.random() * DEMO_TREATMENTS.length)]

    patients.push({
      dentweb_patient_id: String(10000 + i),
      chart_number: `C${String(i).padStart(5, '0')}`,
      patient_name: `${lastName}${firstName}`,
      phone_number: generateDemoPhone(),
      birth_date: generateDemoBirthDate(),
      gender: Math.random() > 0.5 ? 'M' : 'F',
      last_visit_date: generateDemoDate(1),
      last_treatment_type: treatment,
      next_appointment_date: Math.random() > 0.3 ? new Date(Date.now() + Math.random() * 30 * 24 * 60 * 60 * 1000) : null,
      registration_date: generateDemoDate(5),
    })
  }

  logger.info(`[데모] ${count}명의 모의 환자 데이터 생성 완료`)
  return patients
}

// ========================================
// 실제 DB 쿼리 (DentWeb 실제 스키마)
// ========================================

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
    (SELECT TOP 1 t.sz수가코드
     FROM TB_세부처치내역 t
     WHERE t.n환자ID = p.n환자ID AND t.b취소 = 0
     ORDER BY t.sz진료일 DESC, t.nID DESC) AS last_treatment_type,
    (SELECT TOP 1 LEFT(a.sz예약시각, 8)
     FROM TB_예약목록 a
     WHERE a.n환자ID = p.n환자ID AND a.sz예약시각 >= CONVERT(VARCHAR(8), GETDATE(), 112)
     ORDER BY a.sz예약시각 ASC) AS next_appointment_date
  FROM TB_환자정보 p
  WHERE p.sz이름 IS NOT NULL AND p.sz이름 != ''
`

export async function getAllPatients(): Promise<DentwebPatientRow[]> {
  const conn = await connectDB()

  try {
    const result = await conn.request().query(`${PATIENT_QUERY_BASE} ORDER BY p.n환자ID`)
    return result.recordset.map(formatDentwebRow)
  } catch (error) {
    logger.error('Failed to query all patients', error)
    throw error
  }
}

export async function getUpdatedPatients(since: Date): Promise<DentwebPatientRow[]> {
  const conn = await connectDB()
  const sinceStr = since.toISOString().slice(0, 10).replace(/-/g, '')

  try {
    const result = await conn.request()
      .input('sinceDate', sql.DateTime, since)
      .input('sinceDateStr', sql.VarChar, sinceStr)
      .query(`
        ${PATIENT_QUERY_BASE}
          AND (p.t수정시각 >= @sinceDate
               OR p.n환자ID IN (SELECT n환자ID FROM TB_접수목록 WHERE LEFT(sz접수시각, 8) >= @sinceDateStr))
        ORDER BY p.n환자ID
      `)
    return result.recordset.map(formatDentwebRow)
  } catch (error) {
    logger.error('Failed to query updated patients', error)
    throw error
  }
}

// DB 스키마 확인 (테이블 목록)
export async function listTables(): Promise<string[]> {
  const conn = await connectDB()

  try {
    const result = await conn.request().query(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `)
    return result.recordset.map(r => r.TABLE_NAME)
  } catch (error) {
    logger.error('Failed to list tables', error)
    throw error
  }
}

// 특정 테이블 컬럼 확인
export async function listColumns(tableName: string): Promise<Array<{ name: string; type: string }>> {
  const conn = await connectDB()

  try {
    const result = await conn.request()
      .input('tableName', sql.VarChar, tableName)
      .query(`
        SELECT COLUMN_NAME AS name, DATA_TYPE AS type
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      `)
    return result.recordset
  } catch (error) {
    logger.error(`Failed to list columns for ${tableName}`, error)
    throw error
  }
}

// DentWeb varchar(8) 날짜 '20260416' → Date 객체
function parseDentwebDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr || dateStr.length < 8) return null
  const d = dateStr.replace(/\s/g, '')
  if (d.length < 8 || !/^\d{8}/.test(d)) return null
  const year = parseInt(d.slice(0, 4), 10)
  const month = parseInt(d.slice(4, 6), 10)
  const day = parseInt(d.slice(6, 8), 10)
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const parsed = new Date(year, month - 1, day)
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null
  return parsed
}

// 날짜 포맷팅 헬퍼
function formatDate(date: Date | null): string | null {
  if (!date) return null
  return date.toISOString().split('T')[0]
}

// DentWeb 실제 스키마 → DentwebPatientRow 변환
function formatDentwebRow(row: Record<string, unknown>): DentwebPatientRow {
  const genderBit = row['b성별']
  const gender = genderBit === true || genderBit === 1 ? 'F' : genderBit === false || genderBit === 0 ? 'M' : null

  return {
    dentweb_patient_id: String(row['n환자ID']),
    chart_number: (row['sz차트번호'] as string) || null,
    patient_name: String(row['sz이름'] || ''),
    phone_number: (row['sz휴대폰번호'] as string) || null,
    birth_date: parseDentwebDate(row['sz생년월일'] as string),
    gender,
    last_visit_date: parseDentwebDate(row['sz최종내원일'] as string),
    last_treatment_type: (row['last_treatment_type'] as string) || null,
    next_appointment_date: parseDentwebDate(row['next_appointment_date'] as string),
    registration_date: parseDentwebDate((row['sz등록시각'] as string)?.slice(0, 8)),
  }
}

// 기존 포맷팅 (하위 호환)
function formatPatientRow(row: Record<string, unknown>): DentwebPatientRow {
  return formatDentwebRow(row)
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
  }
}
