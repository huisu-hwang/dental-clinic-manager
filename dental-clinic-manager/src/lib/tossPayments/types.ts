// 토스페이먼츠 v2 응답 객체 타입

export interface TossCard {
  issuerCode: string         // 카드 발급사 두 자리 코드 (예: '41' = 현대카드)
  acquirerCode: string       // 카드 매입사 두 자리 코드
  number: string             // 마스킹된 카드번호
  cardType: '신용' | '체크' | '기프트'
  ownerType: '개인' | '법인'
}

export interface TossBilling {
  mId: string
  customerKey: string
  authenticatedAt: string
  method: string
  billingKey: string
  card: TossCard
  cardCompany?: string  // deprecated, issuerCode 사용 권장
  cardNumber?: string   // deprecated, card.number 사용 권장
}

export interface TossPaymentAmount {
  total: number
  taxFree?: number
  vat?: number
}

export interface TossPayment {
  paymentKey: string
  orderId: string
  orderName: string
  status:
    | 'READY' | 'IN_PROGRESS' | 'WAITING_FOR_DEPOSIT'
    | 'DONE' | 'CANCELED' | 'PARTIAL_CANCELED' | 'ABORTED' | 'EXPIRED'
  method: string
  totalAmount: number
  balanceAmount: number
  approvedAt?: string
  requestedAt: string
  secret?: string
  receipt?: { url: string }
  card?: TossCard
  failure?: { code: string; message: string }
}

export interface TossWebhookPayload {
  eventType: string                  // 'PAYMENT_STATUS_CHANGED' 등
  data: TossPayment
  createdAt: string
}
