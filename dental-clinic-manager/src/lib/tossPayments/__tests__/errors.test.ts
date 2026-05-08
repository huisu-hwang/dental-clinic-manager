import { describe, it, expect } from 'vitest'
import { TossPaymentsError } from '../client'
import { classifyTossError, ErrorClass } from '../errors'

describe('classifyTossError', () => {
  const cases: Array<[string, number, ErrorClass]> = [
    ['INVALID_CARD', 400, 'permanent'],
    ['EXPIRED_CARD', 400, 'permanent'],
    ['STOLEN_CARD', 400, 'permanent'],
    ['EXCEED_MAX_AMOUNT', 400, 'permanent'],
    ['EXCEED_MAX_DAILY_AMOUNT', 400, 'permanent'],
    ['EXCEED_MAX_PAYMENT_AMOUNT', 400, 'transient'],
    ['PAY_PROCESS_CANCELED', 400, 'transient'],
    ['NETWORK_ERROR', 0, 'transient'],
    ['UNKNOWN', 500, 'transient'],
    ['UNKNOWN', 502, 'transient'],
    ['UNKNOWN', 400, 'permanent'],
  ]

  for (const [code, status, expected] of cases) {
    it(`${code} (HTTP ${status}) → ${expected}`, () => {
      const err = new TossPaymentsError(code, 'msg', status)
      expect(classifyTossError(err)).toBe(expected)
    })
  }
})
