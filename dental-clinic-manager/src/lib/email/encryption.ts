/**
 * AES-256-GCM 암복호화 헬퍼
 * scraping-worker/src/crypto/encryption.ts와 동일한 로직
 * ENCRYPTION_KEY 환경변수: 32바이트(64 hex 문자)
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

interface EncryptedData {
  iv: string;
  encrypted: string;
  tag: string;
}

function getKey(): Buffer {
  const keyHex = process.env.ENCRYPTION_KEY;
  if (!keyHex) {
    throw new Error('ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  }
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY는 32바이트(64 hex 문자)여야 합니다.');
  }
  return key;
}

/** AES-256-GCM 암호화 후 JSON 문자열 반환 (DB 저장용) */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  const data: EncryptedData = {
    iv: iv.toString('hex'),
    encrypted,
    tag,
  };
  return JSON.stringify(data);
}

/** JSON 문자열에서 AES-256-GCM 복호화 */
export function decrypt(encryptedJson: string): string {
  const key = getKey();
  const data: EncryptedData = JSON.parse(encryptedJson);

  const iv = Buffer.from(data.iv, 'hex');
  const tag = Buffer.from(data.tag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
