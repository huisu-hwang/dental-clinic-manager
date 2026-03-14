/**
 * 홈택스 자격증명 암호화/복호화 (서버 사이드 전용)
 * AES-256-GCM - scraping-worker와 동일한 포맷
 *
 * 용도: hometax_credentials 테이블의 encrypted_login_id, encrypted_login_pw 필드
 * 키: ENCRYPTION_KEY 환경변수 (32바이트 = 64 hex 문자)
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

export interface EncryptedData {
  iv: string;
  encrypted: string;
  tag: string;
}

function getEncryptionKey(): Buffer {
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

/** AES-256-GCM 암호화 */
export function hometaxEncrypt(plainText: string): EncryptedData {
  const key = getEncryptionKey();
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
export function hometaxDecrypt(data: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(data.iv, 'hex');
  const tag = Buffer.from(data.tag, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/** 암호화 후 JSON 문자열로 변환 (DB 저장용) */
export function hometaxEncryptToJson(plainText: string): string {
  return JSON.stringify(hometaxEncrypt(plainText));
}

/** DB에 저장된 JSON 문자열에서 복호화 */
export function hometaxDecryptFromJson(jsonStr: string): string {
  const data: EncryptedData = JSON.parse(jsonStr);
  return hometaxDecrypt(data);
}
