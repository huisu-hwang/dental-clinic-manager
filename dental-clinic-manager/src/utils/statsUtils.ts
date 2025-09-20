import type { DailyReport, GiftLog, Stats } from '@/types'

export const getStatsForDateRange = (
  dailyReports: DailyReport[],
  giftLogs: GiftLog[],
  startDate: Date,
  endDate: Date
): Stats => {
  console.log('통계 계산:', { startDate, endDate, dailyReports: dailyReports.length, giftLogs: giftLogs.length })

  const filteredReports = dailyReports.filter(r => {
    const reportDate = new Date(r.date + 'T00:00:00') // 타임존 문제 방지
    const isInRange = reportDate >= startDate && reportDate <= endDate
    if (isInRange) {
      console.log('포함된 보고서:', r.date)
    }
    return isInRange
  })

  const filteredGifts = giftLogs.filter(g => {
    const giftDate = new Date(g.date + 'T00:00:00') // 타임존 문제 방지
    return giftDate >= startDate && giftDate <= endDate
  })

  console.log('필터링된 데이터:', { reports: filteredReports.length, gifts: filteredGifts.length })

  const stats = {
    naver_review_count: 0,
    consult_proceed: 0,
    consult_hold: 0,
    recall_count: 0,
    recall_booking_count: 0,
    totalConsults: 0,
    totalGifts: 0,
    totalRevenue: 0,
    consultsByManager: {} as Record<string, number>,
    giftsByManager: {} as Record<string, number>,
    revenueByManager: {} as Record<string, number>,
    consultProceedRate: 0,
    recallSuccessRate: 0,
    giftCounts: {} as Record<string, number>
  }

  // 일일 보고서 통계 합산
  filteredReports.forEach(r => {
    stats.naver_review_count += r.naver_review_count || 0
    stats.consult_proceed += r.consult_proceed || 0
    stats.consult_hold += r.consult_hold || 0
    stats.recall_count += r.recall_count || 0
    stats.recall_booking_count += r.recall_booking_count || 0
  })

  // 선물 통계 계산
  filteredGifts.forEach(g => {
    if (g.gift_type && g.gift_type !== '없음') {
      stats.giftCounts[g.gift_type] = (stats.giftCounts[g.gift_type] || 0) + 1
    }
  })

  // 비율 계산
  stats.totalConsults = stats.consult_proceed + stats.consult_hold
  stats.consultProceedRate = stats.totalConsults > 0 
    ? parseFloat(((stats.consult_proceed / stats.totalConsults) * 100).toFixed(1))
    : 0
  stats.recallSuccessRate = stats.recall_count > 0 
    ? parseFloat(((stats.recall_booking_count / stats.recall_count) * 100).toFixed(1))
    : 0

  return stats
}