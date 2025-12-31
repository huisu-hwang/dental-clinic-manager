import type { DailyReport, GiftLog, GiftInventory, GiftCategory, Stats } from '@/types'

// 구환 선물 카테고리를 식별하기 위한 키워드
const RETURNING_PATIENT_CATEGORY_KEYWORDS = ['구환', '치료 완료', '기존환자']

export const getStatsForDateRange = (
  dailyReports: DailyReport[],
  giftLogs: GiftLog[],
  startDate: Date,
  endDate: Date,
  giftInventory: GiftInventory[] = [],
  giftCategories: GiftCategory[] = []
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

  // 선물 이름 -> 카테고리 ID 매핑 생성
  const giftToCategoryMap = new Map<string, number | null>()
  giftInventory.forEach(item => {
    giftToCategoryMap.set(item.name, item.category_id ?? null)
  })

  // 카테고리 ID -> 카테고리 정보 매핑
  const categoryMap = new Map<number, GiftCategory>()
  giftCategories.forEach(cat => {
    categoryMap.set(cat.id, cat)
  })

  // 구환 선물 카테고리 ID 찾기
  const returningPatientCategoryIds = new Set<number>()
  giftCategories.forEach(cat => {
    if (RETURNING_PATIENT_CATEGORY_KEYWORDS.some(keyword => cat.name.includes(keyword))) {
      returningPatientCategoryIds.add(cat.id)
    }
  })

  const stats: Stats = {
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
    giftCounts: {} as Record<string, number>,
    giftCountsByCategory: {} as Record<string, { gifts: Record<string, number>; total: number; color: string }>,
    returningPatientGiftCount: 0,
    reviewToReturningGiftRate: 0
  }

  // 일일 보고서 통계 합산
  filteredReports.forEach(r => {
    stats.naver_review_count += r.naver_review_count || 0
    stats.consult_proceed += r.consult_proceed || 0
    stats.consult_hold += r.consult_hold || 0
    stats.recall_count += r.recall_count || 0
    stats.recall_booking_count += r.recall_booking_count || 0
  })

  // 선물 통계 계산 (기존 + 카테고리별)
  filteredGifts.forEach(g => {
    if (g.gift_type && g.gift_type !== '없음') {
      const quantity = g.quantity || 1

      // 기존 선물별 통계
      stats.giftCounts[g.gift_type] = (stats.giftCounts[g.gift_type] || 0) + quantity

      // 카테고리별 통계
      const categoryId = giftToCategoryMap.get(g.gift_type)
      let categoryName = '미분류'
      let categoryColor = '#6b7280' // 기본 회색

      if (categoryId != null) {
        const category = categoryMap.get(categoryId)
        if (category) {
          categoryName = category.name
          categoryColor = category.color
        }

        // 구환 선물 카운트
        if (returningPatientCategoryIds.has(categoryId)) {
          stats.returningPatientGiftCount += quantity
        }
      }

      // 카테고리별 선물 통계 누적
      if (!stats.giftCountsByCategory[categoryName]) {
        stats.giftCountsByCategory[categoryName] = {
          gifts: {},
          total: 0,
          color: categoryColor
        }
      }
      stats.giftCountsByCategory[categoryName].gifts[g.gift_type] =
        (stats.giftCountsByCategory[categoryName].gifts[g.gift_type] || 0) + quantity
      stats.giftCountsByCategory[categoryName].total += quantity
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

  // 리뷰 대비 구환 선물 비율 계산
  stats.reviewToReturningGiftRate = stats.returningPatientGiftCount > 0
    ? parseFloat(((stats.naver_review_count / stats.returningPatientGiftCount) * 100).toFixed(1))
    : 0

  return stats
}