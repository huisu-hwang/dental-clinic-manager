// 개인 구독 시스템 타입
// 기존 src/types/subscription.ts(clinic 단위)와 분리하여 user 단위 타입 정의

export type UserSubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'cancelled'
  | 'suspended'
  | 'expired'

export type UserSubscriptionPaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'refunded'

export interface UserSubscriptionPlan {
  id: string
  feature_id: string
  display_name: string
  monthly_base_price: number
  revenue_share_pct: number
  description: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface UserSubscription {
  id: string
  user_id: string
  plan_id: string
  status: UserSubscriptionStatus
  billing_key: string | null
  card_name: string | null
  card_number_last4: string | null
  current_period_start: string | null
  current_period_end: string | null
  next_billing_date: string | null
  cancel_at_period_end: boolean
  cancelled_at: string | null
  retry_count: number
  next_retry_at: string | null
  migrated_from_clinic_id: string | null
  migrated_at: string | null
  created_at: string
  updated_at: string
  plan?: UserSubscriptionPlan | null
}

export interface UserSubscriptionPayment {
  id: string
  user_id: string
  subscription_id: string | null
  portone_payment_id: string
  portone_tx_id: string | null
  amount: number
  base_amount: number
  revenue_share_amount: number
  realized_profit_basis: number
  status: UserSubscriptionPaymentStatus
  paid_at: string | null
  failed_at: string | null
  fail_reason: string | null
  billing_period_start: string | null
  billing_period_end: string | null
  order_name: string | null
  created_at: string
}

// API 응답
export interface UserSubscriptionStatusResponse {
  subscription: UserSubscription | null
  plan: UserSubscriptionPlan | null
  payments: UserSubscriptionPayment[]
  daysUntilExpiry: number | null
  nextChargeEstimate: {
    base: number
    revenueShareEstimate: number
    total: number
    realizedProfitMonthToDate: number
  } | null
}
