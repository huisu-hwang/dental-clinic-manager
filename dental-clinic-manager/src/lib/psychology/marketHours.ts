// src/lib/psychology/marketHours.ts
// 한국/미국 정규장 시간 체크 (Intl.DateTimeFormat으로 서머타임 처리)
import type { Market } from '@/types/investment'

function getZonedHourMinute(date: Date, timeZone: string): { h: number; m: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = fmt.formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    h: Number(get('hour')),
    m: Number(get('minute')),
    weekday: weekdayMap[get('weekday')] ?? 0,
  }
}

export function isMarketOpen(market: Market, now = new Date()): boolean {
  if (market === 'KR') {
    const z = getZonedHourMinute(now, 'Asia/Seoul')
    if (z.weekday === 0 || z.weekday === 6) return false
    const minutes = z.h * 60 + z.m
    return minutes >= 9 * 60 && minutes <= 15 * 60 + 30
  }
  // US
  const z = getZonedHourMinute(now, 'America/New_York')
  if (z.weekday === 0 || z.weekday === 6) return false
  const minutes = z.h * 60 + z.m
  return minutes >= 9 * 60 + 30 && minutes <= 16 * 60
}
