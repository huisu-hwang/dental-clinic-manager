import crypto from 'crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export interface EncryptedData {
  iv: string;
  encrypted: string;
  tag: string;
}

/** AES-256-GCM 암호화 */
export function encrypt(plainText: string): EncryptedData {
  const key = Buffer.from(config.encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY는 32바이트(64 hex 문자)여야 합니다.');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    encrypted,
    tag,
  };
}

/** AES-256-GCM 복호화 */
export function decrypt(data: EncryptedData): string {
  const key = Buffer.from(config.encryptionKey, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY는 32바이트(64 hex 문자)여야 합니다.');
  }

  const iv = Buffer.from(data.iv, 'hex');
  const tag = Buffer.from(data.tag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/** DB에 저장된 JSON 문자열에서 복호화 */
export function decryptFromJson(jsonStr: string): string {
  const data: EncryptedData = JSON.parse(jsonStr);
  return decrypt(data);
}

/** 암호화 후 JSON 문자열로 변환 (DB 저장용) */
export function encryptToJson(plainText: string): string {
  return JSON.stringify(encrypt(plainText));
}
