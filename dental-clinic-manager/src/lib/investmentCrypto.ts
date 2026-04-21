/**
 * 투자 자격증명 암호화/복호화 (서버 사이드 전용)
 * AES-256-GCM - hometaxCrypto.ts 패턴 기반, 보안 강화
 *
 * 보안 강화 사항:
 * 1. HKDF로 홈택스와 투자 암호화 키 분리 (한쪽 유출 시 다른 쪽 보호)
 * 2. Zod 스키마로 복호화 입력 검증 (JSON 파싱 공격 방지)
 * 3. 일반적 에러 메시지 (정보 노출 방지)
 *
 * 용도: user_broker_credentials 테이블의 암호화 필드
 * 키: ENCRYPTION_KEY 환경변수에서 HKDF 파생
 */

import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const HEX_32_REGEX = /^[0-9a-f]{32}$/
const HEX_REGEX = /^[0-9a-f]+$/

/** 암호화된 필드 JSON 구조 검증 */
function validateEncryptedField(data: unknown): { iv: string; encrypted: string; tag: string } | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  if (typeof obj.iv !== 'string' || !HEX_32_REGEX.test(obj.iv)) return null
  if (typeof obj.encrypted !== 'string' || !HEX_REGEX.test(obj.encrypted) || obj.encrypted.length > 4096) return null
  if (typeof obj.tag !== 'string' || !HEX_32_REGEX.test(obj.tag)) return null
  return { iv: obj.iv, encrypted: obj.encrypted, tag: obj.tag }
}

/** 캐시된 파생 키 (프로세스 수명 동안 유지) */
let cachedInvestmentKey: Buffer | null = null

/**
 * HKDF로 투자 전용 파생 키 생성
 * ENCRYPTION_KEY(홈택스) → HMAC-SHA256("investment-credentials") → 투자 전용 키
 */
function getInvestmentKey(): Buffer {
  if (cachedInvestmentKey) return cachedInvestmentKey

  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.')
  }
  const masterKey = Buffer.from(keyHex, 'hex')
  if (masterKey.length !== 32) {
    throw new Error('ENCRYPTION_KEY는 32바이트(64 hex 문자)여야 합니다.')
  }

  // HMAC-SHA256으로 도메인별 파생 키 생성
  cachedInvestmentKey = crypto
    .createHmac('sha256', masterKey)
    .update('investment-credentials')
    .digest()

  return cachedInvestmentKey
}

/**
 * AES-256-GCM 암호화 → JSON 문자열 반환 (DB TEXT 컬럼에 저장)
 * 각 호출마다 고유한 IV 생성
 */
export function investmentEncrypt(plainText: string): string {
  const key = getInvestmentKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plainText, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const tag = cipher.getAuthTag().toString('hex')

  return JSON.stringify({ iv: iv.toString('hex'), encrypted, tag })
}

/**
 * DB에 저장된 JSON 문자열에서 복호화
 * Zod 스키마로 입력 검증 후 복호화 수행
 *
 * @throws Error - 파싱/검증/복호화 실패 시 일반적 에러 메시지 (정보 노출 방지)
 */
export function investmentDecrypt(jsonStr: string): string {
  // 1. JSON 파싱
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Operation failed')
  }

  // 2. 구조 검증 (prototype pollution, 잘못된 형식 방어)
  const validated = validateEncryptedField(parsed)
  if (!validated) {
    throw new Error('Operation failed')
  }

  // 3. 복호��
  const { iv, encrypted, tag } = validated
  const key = getInvestmentKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))

  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    // GCM AuthTag 검증 실패 = 데이터 변조 의심
    // 변조/미발견/파싱실패 모두 동일 메시지 (timing attack 방지)
    throw new Error('Operation failed')
  }
}
