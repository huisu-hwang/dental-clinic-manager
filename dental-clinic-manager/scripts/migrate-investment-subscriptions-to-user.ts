// scripts/migrate-investment-subscriptions-to-user.ts
//
// 1회성 마이그레이션: clinic 단위 자동매매 구독을 개인 단위로 이관.
//
// 사용법:
//   npx tsx scripts/migrate-investment-subscriptions-to-user.ts --dry-run
//   npx tsx scripts/migrate-investment-subscriptions-to-user.ts --apply
//
// 환경변수:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필수.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE 환경변수 누락'); process.exit(1)
}
const apply = process.argv.includes('--apply')

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  // 1. 자동매매 clinic 구독 조회
  const { data: clinicSubs } = await supabase
    .from('subscriptions')
    .select(`
      id, clinic_id, billing_key, card_name, card_number_last4,
      current_period_start, current_period_end, next_billing_date, retry_count,
      plan:subscription_plans!inner(id, feature_id, display_name)
    `)
    .in('status', ['active','past_due','trialing'])
    .eq('plan.feature_id', 'investment')

  console.log(`[migrate] 대상 clinic 구독: ${clinicSubs?.length ?? 0}건`)
  if (!clinicSubs?.length) return

  // 2. 신규 user_subscription_plans.investment id
  const { data: planRow } = await supabase
    .from('user_subscription_plans')
    .select('id')
    .eq('feature_id', 'investment')
    .single()
  const userPlanId = (planRow as { id: string } | null)?.id
  if (!userPlanId) { console.error('user_subscription_plans.investment 시드 누락'); process.exit(1) }

  let migrated = 0; let skipped = 0; let multiUserClinics = 0

  for (const cs of clinicSubs as Array<{
    id: string; clinic_id: string; billing_key: string | null;
    card_name: string | null; card_number_last4: string | null;
    current_period_start: string | null; current_period_end: string | null;
    next_billing_date: string | null; retry_count: number;
  }>) {
    // 3. 활동 사용자 후보 추출
    const { data: stratUsers } = await supabase
      .from('investment_strategies').select('user_id')
      .eq('clinic_id', cs.clinic_id)
    const stratIds = new Set((stratUsers ?? []).map(r => (r as { user_id: string }).user_id))

    const { data: clinicUsers } = await supabase
      .from('users')
      .select('id, role, created_at')
      .eq('clinic_id', cs.clinic_id)
    const allUsers = (clinicUsers ?? []) as Array<{ id: string; role: string; created_at: string }>

    const { data: credUsers } = await supabase
      .from('user_broker_credentials').select('user_id')
      .in('user_id', allUsers.map(u => u.id))
    const credIds = new Set((credUsers ?? []).map(r => (r as { user_id: string }).user_id))

    let candidates = allUsers.filter(u => stratIds.has(u.id) || credIds.has(u.id))
    if (candidates.length === 0) {
      const owner = allUsers.find(u => u.role === 'owner')
      if (owner) candidates = [owner]
    }
    if (candidates.length > 1) multiUserClinics++

    // 4. created_at 오래된 순 정렬
    candidates.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

    if (candidates.length === 0) {
      console.log(`[skip] clinic=${cs.clinic_id}: 후보 사용자 없음`)
      skipped++
      continue
    }

    for (let i = 0; i < candidates.length; i++) {
      const u = candidates[i]
      const isFirst = i === 0
      const billingKey = isFirst ? cs.billing_key : null

      console.log(`${apply ? '[apply]' : '[dry-run]'} migrate clinic=${cs.clinic_id} → user=${u.id} (first=${isFirst}, billingKey=${billingKey ? 'yes' : 'no'})`)

      if (!apply) continue

      const { error } = await supabase.from('user_subscriptions').insert({
        user_id: u.id,
        plan_id: userPlanId,
        status: 'active',
        billing_key: billingKey,
        card_name: isFirst ? cs.card_name : null,
        card_number_last4: isFirst ? cs.card_number_last4 : null,
        current_period_start: cs.current_period_start,
        current_period_end: cs.current_period_end,
        next_billing_date: cs.next_billing_date,
        retry_count: cs.retry_count ?? 0,
        migrated_from_clinic_id: cs.clinic_id,
        migrated_at: new Date().toISOString(),
      })
      if (error) {
        if (error.message.includes('duplicate key')) {
          console.log(`  → 이미 존재 (skip)`)
        } else {
          console.error(`  → 실패: ${error.message}`)
        }
      }
    }

    if (apply) {
      // 5. 기존 clinic 구독 cancel 처리
      await supabase.from('subscriptions')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', cs.id)
      migrated++
    }
  }

  console.log(`\n[summary] migrated=${migrated} skipped=${skipped} multi-user clinics=${multiUserClinics}`)
}

main().catch(e => { console.error(e); process.exit(1) })
