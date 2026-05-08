import { TossPaymentsError } from './client'

export type ErrorClass = 'permanent' | 'transient'

const PERMANENT_CODES = new Set([
  'INVALID_CARD',
  'EXPIRED_CARD',
  'STOLEN_CARD',
  'EXCEED_MAX_AMOUNT',
  'EXCEED_MAX_DAILY_AMOUNT',
  'CARD_LIMIT_EXCEEDED',
  'NOT_REGISTERED_CARD',
  'INVALID_CARD_NUMBER',
])

export function classifyTossError(err: TossPaymentsError): ErrorClass {
  if (PERMANENT_CODES.has(err.code)) return 'permanent'
  if (err.httpStatus >= 500) return 'transient'
  if (err.httpStatus === 0) return 'transient' // network error
  if (err.code === 'NETWORK_ERROR') return 'transient'
  if (err.code === 'EXCEED_MAX_PAYMENT_AMOUNT') return 'transient' // 잔고부족
  if (err.code === 'PAY_PROCESS_CANCELED') return 'transient'
  return 'permanent'
}

export function userMessageForCode(code: string): string {
  const map: Record<string, string> = {
    INVALID_CARD: '카드 정보가 올바르지 않습니다. 다른 카드로 다시 시도해 주세요.',
    EXPIRED_CARD: '카드 유효기간이 만료되었습니다. 새 카드를 등록해 주세요.',
    STOLEN_CARD: '분실/도난 카드입니다. 카드사에 문의해 주세요.',
    EXCEED_MAX_AMOUNT: '결제 한도를 초과했습니다.',
    EXCEED_MAX_DAILY_AMOUNT: '일일 결제 한도를 초과했습니다.',
    EXCEED_MAX_PAYMENT_AMOUNT: '카드 잔고가 부족합니다.',
    PAY_PROCESS_CANCELED: '결제가 취소되었습니다.',
  }
  return map[code] ?? '결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
}
