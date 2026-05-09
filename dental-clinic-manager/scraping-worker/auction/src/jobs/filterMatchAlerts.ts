import { supabase } from '../lib/supabase.js'
import { log } from '../lib/logger.js'

interface FilterRow {
  id: string
  user_id: string
  name: string
  filter_json: Record<string, any>
}

export async function runFilterMatchAlerts() {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const sinceStr = today.toISOString()

  const { data: filters } = await supabase
    .from('auction_user_filters')
    .select('id, user_id, name, filter_json')
    .eq('alert_enabled', true)
  if (!filters) return

  let totalCount = 0
  for (const f of filters as FilterRow[]) {
    let q = supabase.from('auction_items').select('id, case_number', { count: 'exact', head: false }).gte('first_seen_at', sinceStr)
    const j = f.filter_json
    if (j.sido)            q = q.eq('sido', j.sido)
    if (j.propertyType)    q = q.eq('property_type', j.propertyType)
    if (j.minDiscountPct)  q = q.gte('discount_rate', j.minDiscountPct)
    if (j.minFailureCount) q = q.gte('failure_count', j.minFailureCount)

    const { data, count } = await q.limit(20)
    if (!count || count === 0) continue

    await supabase.from('notifications').insert({
      user_id: f.user_id,
      type: 'auction_filter_match',
      title: `'${f.name}' 필터에 신규 ${count}건`,
      body: `${(data ?? []).map(d => d.case_number).slice(0, 3).join(', ')}${count > 3 ? ' 외' : ''}`,
      url: `/investment/auction`,
    })
    totalCount += count
  }
  log.info('filter_match_alerts_sent', { count: totalCount })
}
