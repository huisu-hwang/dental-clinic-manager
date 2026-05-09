import { supabase } from '../lib/supabase.js'
import { log } from '../lib/logger.js'

export async function runDdayAlerts() {
  const today = new Date()
  const target = new Date(today); target.setDate(today.getDate() + 3)
  const todayStr = today.toISOString().slice(0, 10)
  const targetStr = target.toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from('auction_user_favorites')
    .select('user_id, item_id, item:auction_items(case_number, sido, sigungu, eupmyeondong, next_auction_date)')
    .eq('alert_enabled', true)
    .gte('item.next_auction_date', todayStr)
    .lte('item.next_auction_date', targetStr)
  if (error) { log.error('dday_alert_query_failed', { error: error.message }); return }

  let count = 0
  for (const r of data ?? []) {
    const item = Array.isArray(r.item) ? r.item[0] : r.item
    if (!item) continue
    await supabase.from('notifications').insert({
      user_id: r.user_id,
      type: 'auction_dday_3',
      title: `매각기일 임박: ${item.case_number}`,
      body: `${item.sido} ${item.sigungu} ${item.eupmyeondong} — ${item.next_auction_date} 매각기일`,
      url: `/investment/auction/${r.item_id}`,
    })
    count++
  }
  log.info('dday_alerts_sent', { count })
}
