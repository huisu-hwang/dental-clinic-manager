import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'

/**
 * 클리닉의 토스 customerKey를 발급/조회.
 * - 기존 row(임의 status)의 customer_key 존재 → 그 값 반환
 * - 없으면 새 UUID 발급 + status='pending' 빈 subscription row 생성
 *
 * 멱등하게 동작 (여러 번 호출해도 동일 customer_key 반환).
 */
export async function getOrCreateCustomerKey(clinicId: string): Promise<string> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id, customer_key')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.customer_key) {
    return existing.customer_key as string
  }

  const customerKey = randomUUID()
  const { error } = await supabase.from('subscriptions').insert({
    clinic_id: clinicId,
    customer_key: customerKey,
    status: 'pending',
    cancel_at_period_end: false,
    retry_count: 0,
  })
  if (error) throw new Error(`customer_key 생성 실패: ${error.message}`)

  return customerKey
}
