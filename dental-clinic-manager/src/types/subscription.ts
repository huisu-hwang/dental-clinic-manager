// ============================================
// 구독 결제 시스템 타입 정의 (토스페이먼츠 직결)
// ============================================

export type SubscriptionStatus =
  | 'pending'      // 빌링키 발급 직후, 첫 결제 전
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended'
  | 'expired'

export type PlanType = 'headcount' | 'feature'

export type SubscriptionPaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export interface SubscriptionPlan {
  id: string
  name: string
  display_name: string
  type: PlanType
  feature_id?: string | null
  min_users: number
  max_users: number
  price: number
  annual_price?: number | null
  description?: string | null
  features: string[]
  is_active: boolean
  sort_order: number
  created_at: string
}

export interface Subscription {
  id: string
  clinic_id: string
  plan_id?: string | null
  status: SubscriptionStatus
  billing_key?: string | null
  customer_key: string
  card_company?: string | null
  billing_method: string
  current_period_start?: string | null
  current_period_end?: string | null
  next_billing_date?: string | null
  cancel_at_period_end: boolean
  cancelled_at?: string | null
  retry_count: number
  next_retry_at?: string | null
  created_at: string
  updated_at: string
  plan?: SubscriptionPlan | null
}

export interface SubscriptionPayment {
  id: string
  clinic_id: string
  subscription_id?: string | null
  toss_payment_key?: string | null
  toss_order_id: string
  toss_secret?: string | null
  idempotency_key?: string | null
  amount: number
  status: SubscriptionPaymentStatus
  order_name?: string | null
  method?: string | null
  receipt_url?: string | null
  raw_response?: unknown
  paid_at?: string | null
  failed_at?: string | null
  fail_reason?: string | null
  tax_invoice_num?: string | null
  created_at: string
}

export interface SubscriptionStatusResponse {
  subscription: Subscription | null
  plan: SubscriptionPlan | null
  payments: SubscriptionPayment[]
  isFreePlan: boolean
  canUpgrade: boolean
  daysUntilExpiry: number | null
}
