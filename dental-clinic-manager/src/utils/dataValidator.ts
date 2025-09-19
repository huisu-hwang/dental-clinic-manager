import { getSupabase } from '@/lib/supabase'

export const validateDataConnection = async () => {
  try {
    const supabase = getSupabase()
    if (!supabase) {
      return { success: false, error: 'Supabase 클라이언트를 초기화할 수 없습니다.' }
    }

    // 각 테이블의 데이터 개수 확인
    const results = await Promise.all([
      supabase.from('daily_reports').select('*', { count: 'exact', head: true }),
      supabase.from('consult_logs').select('*', { count: 'exact', head: true }),
      supabase.from('gift_logs').select('*', { count: 'exact', head: true }),
      supabase.from('gift_inventory').select('*', { count: 'exact', head: true }),
      supabase.from('inventory_logs').select('*', { count: 'exact', head: true })
    ])

    const counts = {
      daily_reports: results[0].count || 0,
      consult_logs: results[1].count || 0,
      gift_logs: results[2].count || 0,
      gift_inventory: results[3].count || 0,
      inventory_logs: results[4].count || 0
    }

    const total = Object.values(counts).reduce((sum, count) => sum + count, 0)

    // 최근 데이터 샘플 가져오기
    const [dailyReports, consultLogs, giftLogs] = await Promise.all([
      supabase.from('daily_reports').select('*').order('date', { ascending: false }).limit(5),
      supabase.from('consult_logs').select('*').order('date', { ascending: false }).limit(5),
      supabase.from('gift_logs').select('*').order('date', { ascending: false }).limit(5)
    ])

    return {
      success: true,
      counts,
      total,
      sampleData: {
        dailyReports: dailyReports.data || [],
        consultLogs: consultLogs.data || [],
        giftLogs: giftLogs.data || []
      }
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}