/**
 * 구조화된 로깅 (pino)
 *
 * 민감 정보 자동 마스킹:
 * - appKey, appSecret, accessToken, accountNumber 등
 */

import pino from 'pino'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  redact: {
    paths: [
      'appKey',
      'appSecret',
      'app_key',
      'app_secret',
      'accessToken',
      'access_token',
      'accountNumber',
      'account_number',
      'password',
      'secret',
      'token',
      '*.appKey',
      '*.appSecret',
      '*.accessToken',
      '*.accountNumber',
    ],
    censor: '[REDACTED]',
  },
})
