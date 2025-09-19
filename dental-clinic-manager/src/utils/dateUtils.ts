export const getCurrentWeekString = (date: Date): string => {
  const year = date.getFullYear()
  const start = new Date(year, 0, 1)
  const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
  const weekNumber = Math.ceil((days + start.getDay() + 1) / 7)
  
  return `${year}-W${String(weekNumber).padStart(2, '0')}`
}

export const getTodayString = (): string => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const dd = String(today.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

export const getCurrentMonthString = (): string => {
  const today = new Date()
  const yyyy = today.getFullYear()
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

export const getDatesForPeriod = (periodType: 'weekly' | 'monthly' | 'annual', value: string) => {
  let startDate: Date, endDate: Date, title: string

  try {
    if (periodType === 'weekly' && value) {
      const [year, week] = value.split('-W')
      const yearNum = parseInt(year)
      const weekNum = parseInt(week)
      
      // 해당 년도 1월 1일
      const jan1 = new Date(yearNum, 0, 1)
      // 해당 주의 시작일 계산 (월요일 기준)
      const daysToAdd = (weekNum - 1) * 7 - jan1.getDay() + 1
      startDate = new Date(yearNum, 0, 1 + daysToAdd)
      endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000)
      title = `${year}년 ${week}주차`
    } else if (periodType === 'monthly' && value) {
      const [year, month] = value.split('-')
      const yearNum = parseInt(year)
      const monthNum = parseInt(month)
      startDate = new Date(yearNum, monthNum - 1, 1)
      endDate = new Date(yearNum, monthNum, 0)
      title = `${year}년 ${month}월`
    } else if (periodType === 'annual' && value) {
      const yearNum = parseInt(value)
      startDate = new Date(yearNum, 0, 1)
      endDate = new Date(yearNum, 11, 31)
      title = `${value}년`
    } else {
      // 기본값: 현재 월
      const now = new Date()
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      title = '현재 월'
    }
  } catch (error) {
    console.error('Date parsing error:', error)
    // 에러 시 현재 월로 폴백
    const now = new Date()
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    title = '현재 월'
  }

  return { startDate, endDate, title }
}