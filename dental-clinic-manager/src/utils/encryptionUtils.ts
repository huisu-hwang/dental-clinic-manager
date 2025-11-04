/**
 * Client-side encryption utilities for sensitive data
 * Uses Web Crypto API (AES-GCM) for secure encryption
 *
 * SECURITY NOTE:
 * - Encryption key should be stored securely (environment variable)
 * - Never expose the key in client-side code
 * - This is an additional layer on top of HTTPS/TLS
 */

// Encryption configuration
const ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12 // 96 bits for GCM

/**
 * Get encryption key from environment or generate one
 * WARNING: In production, this should come from a secure backend endpoint
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  // In production, fetch this from your backend securely
  // For now, we'll use a deterministic key derived from env variable
  const keyMaterial = process.env.NEXT_PUBLIC_ENCRYPTION_SALT || 'default-encryption-key-change-me'

  const encoder = new TextEncoder()
  const keyMaterialBytes = encoder.encode(keyMaterial)

  // Import key material
  const importedKey = await crypto.subtle.importKey(
    'raw',
    keyMaterialBytes,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )

  // Derive actual encryption key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('dental-clinic-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    importedKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )

  return key
}

/**
 * Encrypt sensitive data (like resident registration number)
 * @param plaintext - Data to encrypt
 * @returns Base64 encoded encrypted data with IV prepended
 * @example
 * const encrypted = await encryptData('123456-7890123')
 * // returns: 'IV_BASE64:ENCRYPTED_DATA_BASE64'
 */
export async function encryptData(plaintext: string): Promise<string> {
  if (!plaintext || plaintext.trim() === '') {
    throw new Error('Cannot encrypt empty data')
  }

  try {
    const key = await getEncryptionKey()
    const encoder = new TextEncoder()
    const data = encoder.encode(plaintext)

    // Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

    // Encrypt data
    const encryptedData = await crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv
      },
      key,
      data
    )

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encryptedData.byteLength)
    combined.set(iv)
    combined.set(new Uint8Array(encryptedData), iv.length)

    // Convert to base64
    return btoa(String.fromCharCode(...combined))
  } catch (error) {
    console.error('Encryption failed:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt encrypted data
 * @param encryptedData - Base64 encoded encrypted data with IV
 * @returns Decrypted plaintext
 * @example
 * const decrypted = await decryptData('IV_BASE64:ENCRYPTED_DATA_BASE64')
 * // returns: '123456-7890123'
 */
export async function decryptData(encryptedData: string): Promise<string> {
  if (!encryptedData || encryptedData.trim() === '') {
    throw new Error('Cannot decrypt empty data')
  }

  try {
    const key = await getEncryptionKey()

    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0))

    // Extract IV and encrypted data
    const iv = combined.slice(0, IV_LENGTH)
    const data = combined.slice(IV_LENGTH)

    // Decrypt data
    const decryptedData = await crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv
      },
      key,
      data
    )

    // Convert to string
    const decoder = new TextDecoder()
    return decoder.decode(decryptedData)
  } catch (error) {
    console.error('Decryption failed:', error)
    throw new Error('Failed to decrypt data')
  }
}

/**
 * Hash data (one-way encryption for comparison purposes)
 * Useful for checking if data matches without storing plaintext
 * @param data - Data to hash
 * @returns Hex encoded hash
 */
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBytes = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Check if data is encrypted (basic heuristic check)
 * @param data - Data to check
 * @returns true if data appears to be encrypted
 */
export function isEncrypted(data: string): boolean {
  if (!data || data.trim() === '') return false

  // Check if it looks like base64 encoded data
  const base64Regex = /^[A-Za-z0-9+/]+=*$/

  // Encrypted data should be longer than plaintext (due to IV and padding)
  return base64Regex.test(data) && data.length > 20
}

/**
 * Securely clear sensitive data from memory
 * @param data - String to clear
 */
export function secureErase(data: string): void {
  // In JavaScript, we can't truly erase memory, but we can try to overwrite
  // The garbage collector will eventually clean it up
  try {
    // Note: Overwriting string content may not work in all JS engines
    for (let i = 0; i < data.length; i++) {
      data = data.substring(0, i) + '\0' + data.substring(i + 1)
    }
  } catch (_e) {
    // Silent fail - best effort only
  }
}

/**
 * Encrypt resident registration number before saving
 * Wrapper function with validation
 * @param residentNumber - Resident registration number to encrypt
 * @returns Encrypted data or null if invalid
 */
export async function encryptResidentNumber(residentNumber: string): Promise<string | null> {
  if (!residentNumber) return null

  // Validate format before encrypting
  const cleaned = residentNumber.replace(/[^0-9]/g, '')
  if (cleaned.length !== 13) {
    throw new Error('Invalid resident registration number format')
  }

  try {
    return await encryptData(residentNumber)
  } catch (error) {
    console.error('Failed to encrypt resident number:', error)
    return null
  }
}

/**
 * Decrypt resident registration number after retrieval
 * Wrapper function with error handling
 * @param encryptedData - Encrypted resident registration number
 * @returns Decrypted resident number or null if failed
 */
export async function decryptResidentNumber(encryptedData: string): Promise<string | null> {
  if (!encryptedData) return null

  try {
    return await decryptData(encryptedData)
  } catch (error) {
    console.warn('Failed to decrypt resident number, assuming plaintext:', error)
    // 복호화 실패 시 평문으로 간주하고 원본 반환
    // 이렇게 하면 평문과 암호화된 값 모두 처리 가능
    return encryptedData
  }
}

// Export constants for testing purposes
export const ENCRYPTION_CONFIG = {
  algorithm: ALGORITHM,
  keyLength: KEY_LENGTH,
  ivLength: IV_LENGTH
} as const
