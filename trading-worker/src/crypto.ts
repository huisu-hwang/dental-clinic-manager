/**
 * 투자 자격증명 복호화 (워커 전용)
 *
 * Next.js 앱의 investmentCrypto.ts와 동일한 로직.
 * HKDF로 마스터키에서 투자 전용 파생키 생성.
 */

import * as crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const HEX_32_REGEX = /^[0-9a-f]{32}$/
const HEX_REGEX = /^[0-9a-f]+$/

let cachedKey: Buffer | null = null

function getInvestmentKey(): Buffer {
  if (cachedKey) return cachedKey

  const keyHex = process.env.ENCRYPTION_KEY
  if (!keyHex) throw new Error('ENCRYPTION_KEY 환경변수 미설정')

  const masterKey = Buffer.from(keyHex, 'hex')
  if (masterKey.length !== 32) throw new Error('ENCRYPTION_KEY는 32바이트여야 합니다')

  cachedKey = crypto
    .createHmac('sha256', masterKey)
    .update('investment-credentials')
    .digest()

  return cachedKey
}

function validateEncryptedField(data: unknown): { iv: string; encrypted: string; tag: string } | null {
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  if (typeof obj.iv !== 'string' || !HEX_32_REGEX.test(obj.iv)) return null
  if (typeof obj.encrypted !== 'string' || !HEX_REGEX.test(obj.encrypted) || obj.encrypted.length > 4096) return null
  if (typeof obj.tag !== 'string' || !HEX_32_REGEX.test(obj.tag)) return null
  return { iv: obj.iv, encrypted: obj.encrypted, tag: obj.tag }
}

export function decryptField(jsonStr: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(jsonStr) } catch { throw new Error('Operation failed') }

  const validated = validateEncryptedField(parsed)
  if (!validated) throw new Error('Operation failed')

  const { iv, encrypted, tag } = validated
  const key = getInvestmentKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))

  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    throw new Error('Operation failed')
  }
}
