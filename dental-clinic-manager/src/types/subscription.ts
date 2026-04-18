// ============================================
// 구독 결제 시스템 타입 정의
// ============================================

export type SubscriptionStatus =
  | 'trialing'   // 체험 기간
  | 'active'     // 정상 구독 중
  | 'past_due'   // 결제 연체 (재시도 중)
  | 'cancelled'  // 취소됨
  | 'suspended'  // 일시 정지 (결제 실패 최종)
  | 'expired'    // 만료됨

export type PlanType = 'headcount' | 'feature'

export type SubscriptionPaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'

// 구독 플랜 정의
export interface SubscriptionPlan {
  id: string
  name: string
  display_name: string
  type: PlanType
  feature_id?: string | null    // feature 타입일 경우: 'ai-analysis' | 'financial' | 'marketing'
  min_users: number             // 인원 하한 (headcount 타입)
  max_users: number             // 인원 상한 (headcount 타입)
  price: number                 // 월 요금 (원)
  annual_price?: number | null  // 연간 요금
  description?: string | null
  features: string[]            // 포함된 기능 목록
  is_active: boolean
  sort_order: number
  created_at: string
}

// 구독 상태
export interface Subscription {
  id: string
  clinic_id: string
  plan_id?: string | null
  status: SubscriptionStatus
  billing_key?: string | null
  card_name?: string | null
  card_number_last4?: string | null
  current_period_start?: string | null
  current_period_end?: string | null
  next_billing_date?: string | null
  cancel_at_period_end: boolean
  cancelled_at?: string | null
  retry_count: number
  next_retry_at?: string | null
  created_at: string
  updated_at: string
  // join
  plan?: SubscriptionPlan | null
}

// 구독 결제 내역
export interface SubscriptionPayment {
  id: string
  clinic_id: string
  subscription_id?: string | null
  portone_payment_id: string
  portone_tx_id?: string | null
  amount: number
  status: SubscriptionPaymentStatus
  order_name?: string | null
  paid_at?: string | null
  failed_at?: string | null
  fail_reason?: string | null
  tax_invoice_num?: string | null
  created_at: string
}

// 결제 요청 파라미터
export interface ChargeParams {
  clinicId: string
  billingKey: string
  amount: number
  orderName: string
  customerName: string
  customerEmail: string
  noticeUrl: string
}

// 결제 예약 파라미터
export interface ScheduleParams {
  clinicId: string
  billingKey: string
  planPrice: number
  planName: string
  customerEmail: string
  scheduledAt: Date
  noticeUrl: string
}

// 포트원 결제 결과
export interface PortOnePaymentResult {
  paymentId: string
  txId?: string
  status: string
  amount: number
  paidAt?: string
  failReason?: string
}

// 구독 등록 요청
export interface RegisterSubscriptionRequest {
  billingKey: string
  planId: string
  cardName: string
  cardNumberLast4: string
  clinicId: string
}

// 플랜 변경 요청
export interface UpgradeSubscriptionRequest {
  newPlanId: string
  clinicId: string
}

// 구독 취소 요청
export interface CancelSubscriptionRequest {
  clinicId: string
  immediate?: boolean  // true: 즉시 취소, false: 기간 만료 후 취소 (기본값)
}

// 구독 상태 응답 (API 응답용)
export interface SubscriptionStatusResponse {
  subscription: Subscription | null
  plan: SubscriptionPlan | null
  payments: SubscriptionPayment[]
  isFreePlan: boolean
  canUpgrade: boolean
  daysUntilExpiry: number | null
}
