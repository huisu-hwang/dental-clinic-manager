/**
 * 세션 기반 분석 엔진 — Power of Three (AMD) / Judas Swing
 *
 * - 세션 분류 (KR)  : pre-market / open-30m / midday / close-30m
 * - 세션 분류 (US)  : asia / london / london-ny-overlap / ny / after-hours
 * - Judas Swing    : 미국장 NY 오픈 30분 동안 직전 아시아 레인지의
 *                    고점/저점을 스윕한 뒤 50% 이상 되돌리면 Judas Swing.
 *                    한국장은 시작 30분 동안 PDH/PDL 스윕 후 되돌림.
 * - PO3 (AMD)      : 직전 거래일 봉을 시간순 3구간(early/mid/late)으로 분리.
 *                    early=accumulation 좁은 박스 (range < 1%)
 *                    mid=manipulation 스윕
 *                    late=distribution 반대 방향 추세
 *                    → late 추세 방향에 따라 po3-accumulation / po3-distribution
 * - 입력 datetime  : ISO("2026-04-29T13:30:00+09:00") 또는 KIS("202604291330").
 *                    Date 파싱 실패 시 수동 파싱으로 폴백.
 */

import type { MarketSession, SessionResult } from '@/types/smartMoney'

export interface SessionBar {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ============================================
// datetime 파싱 — ISO 우선, KIS("YYYYMMDDHHMM") 폴백
// ============================================
interface ParsedDateTime {
  /** UTC epoch ms (정렬/비교용) */
  epochMs: number
  /** 시장 로컬타임 시 (KR=KST, US=ET) — KR/US 분기에서 직접 추출 */
  localHour: number
  localMinute: number
  /** 시장 로컬 날짜 키 ("YYYY-MM-DD") — 같은 거래일 묶기용 */
  localDateKey: string
}

function parseDateTime(raw: string, market: 'KR' | 'US'): ParsedDateTime | null {
  if (!raw || typeof raw !== 'string') return null

  // 1) Date 파싱 시도
  const tryDate = new Date(raw)
  if (!isNaN(tryDate.getTime())) {
    return toParsedFromDate(tryDate, market)
  }

  // 2) KIS 포맷 "YYYYMMDDHHMM" 또는 "YYYYMMDDHHMMSS"
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 12) {
    const year = parseInt(digits.slice(0, 4), 10)
    const mon = parseInt(digits.slice(4, 6), 10)
    const day = parseInt(digits.slice(6, 8), 10)
    const hour = parseInt(digits.slice(8, 10), 10)
    const min = parseInt(digits.slice(10, 12), 10)
    if (
      Number.isFinite(year) && Number.isFinite(mon) && Number.isFinite(day) &&
      Number.isFinite(hour) && Number.isFinite(min)
    ) {
      // 시장 로컬타임으로 가정. UTC epoch는 시장 오프셋 보정.
      // KR=+9, US ET=-4 (DST 단순화: 4월~10월 EDT, 그 외 EST -5).
      const offsetHr = market === 'KR' ? 9 : (mon >= 3 && mon <= 11 ? -4 : -5)
      const utcMs = Date.UTC(year, mon - 1, day, hour - offsetHr, min)
      return {
        epochMs: utcMs,
        localHour: hour,
        localMinute: min,
        localDateKey: `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`,
      }
    }
  }
  return null
}

function toParsedFromDate(d: Date, market: 'KR' | 'US'): ParsedDateTime {
  // 시장 로컬타임 환산: UTC 기준에서 시장 오프셋만큼 더해 로컬시계 추정
  const offsetMin = market === 'KR'
    ? 9 * 60
    : isUsDst(d) ? -4 * 60 : -5 * 60
  const localMs = d.getTime() + offsetMin * 60 * 1000
  const local = new Date(localMs)
  // local은 UTC 메서드로 읽어야 시장 로컬값이 됨
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth() + 1
  const dy = local.getUTCDate()
  return {
    epochMs: d.getTime(),
    localHour: local.getUTCHours(),
    localMinute: local.getUTCMinutes(),
    localDateKey: `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${dy.toString().padStart(2, '0')}`,
  }
}

/** 단순 미국 DST 추정: 3월~10월 EDT, 11월~2월 EST */
function isUsDst(d: Date): boolean {
  const m = d.getUTCMonth() + 1
  return m >= 3 && m <= 10
}

// ============================================
// 세션 분류
// ============================================
function classifySession(parsed: ParsedDateTime, market: 'KR' | 'US'): MarketSession | null {
  const minutes = parsed.localHour * 60 + parsed.localMinute

  if (market === 'KR') {
    // KR: 09:00 ~ 15:30
    if (minutes < 9 * 60) return 'pre-market'
    if (minutes < 9 * 60 + 30) return 'open-30m'
    if (minutes < 14 * 60 + 30) return 'midday'
    if (minutes <= 15 * 60 + 30) return 'close-30m'
    return 'pre-market'
  }

  // US (ET 기준)
  // asia: 18:00 prev day ~ 02:00
  if (minutes >= 18 * 60 || minutes < 2 * 60) return 'asia'
  if (minutes < 7 * 60) return 'london'
  if (minutes < 11 * 60) return 'london-ny-overlap'
  if (minutes < 16 * 60) return 'ny'
  return 'after-hours'
}

// ============================================
// 거래일 그룹핑 (마지막/직전 거래일 봉 추출)
// ============================================
interface TradingDay {
  dateKey: string
  bars: { bar: SessionBar; parsed: ParsedDateTime }[]
}

function groupByTradingDay(
  bars: SessionBar[],
  market: 'KR' | 'US'
): TradingDay[] {
  const map = new Map<string, { bar: SessionBar; parsed: ParsedDateTime }[]>()
  for (const bar of bars) {
    const parsed = parseDateTime(bar.datetime, market)
    if (!parsed) continue
    const arr = map.get(parsed.localDateKey) ?? []
    arr.push({ bar, parsed })
    map.set(parsed.localDateKey, arr)
  }
  const days: TradingDay[] = []
  for (const [dateKey, items] of map.entries()) {
    items.sort((a, b) => a.parsed.epochMs - b.parsed.epochMs)
    days.push({ dateKey, bars: items })
  }
  days.sort((a, b) => a.dateKey.localeCompare(b.dateKey))
  return days
}

// ============================================
// Judas Swing 감지
// ============================================
interface JudasResult {
  detected: boolean
  direction: 'bullish-fake' | 'bearish-fake' | null
}

function detectJudasSwing(
  todayBars: { bar: SessionBar; parsed: ParsedDateTime }[],
  prevRangeHigh: number,
  prevRangeLow: number,
  market: 'KR' | 'US'
): JudasResult {
  if (todayBars.length === 0 || !Number.isFinite(prevRangeHigh) || !Number.isFinite(prevRangeLow)) {
    return { detected: false, direction: null }
  }

  // 첫 30분 윈도우 추출
  const windowBars = todayBars.filter(item => {
    const m = item.parsed.localHour * 60 + item.parsed.localMinute
    if (market === 'KR') {
      return m >= 9 * 60 && m < 9 * 60 + 30
    }
    // US NY 오픈 30분 = 09:30~10:00 ET (사용자 명세는 ny 세션 open-30m)
    return m >= 9 * 60 + 30 && m < 10 * 60
  })

  if (windowBars.length === 0) return { detected: false, direction: null }

  const winHigh = Math.max(...windowBars.map(w => w.bar.high))
  const winLow = Math.min(...windowBars.map(w => w.bar.low))
  const winClose = windowBars[windowBars.length - 1].bar.close

  // 상방 스윕 후 되돌림 → bearish-fake (가짜 상승)
  if (winHigh > prevRangeHigh) {
    const sweep = winHigh - prevRangeHigh
    const reversal = winHigh - winClose
    if (sweep > 0 && reversal / sweep >= 0.5) {
      return { detected: true, direction: 'bearish-fake' }
    }
  }
  // 하방 스윕 후 되돌림 → bullish-fake (가짜 하락)
  if (winLow < prevRangeLow) {
    const sweep = prevRangeLow - winLow
    const reversal = winClose - winLow
    if (sweep > 0 && reversal / sweep >= 0.5) {
      return { detected: true, direction: 'bullish-fake' }
    }
  }
  return { detected: false, direction: null }
}

// ============================================
// PO3 (AMD) 패턴 감지
// ============================================
type Po3Pattern = 'po3-accumulation' | 'po3-distribution' | null

function detectPo3(dayBars: { bar: SessionBar }[]): Po3Pattern {
  if (dayBars.length < 9) return null
  const n = dayBars.length
  const third = Math.floor(n / 3)
  if (third < 2) return null

  const earlyBars = dayBars.slice(0, third).map(d => d.bar)
  const midBars = dayBars.slice(third, third * 2).map(d => d.bar)
  const lateBars = dayBars.slice(third * 2).map(d => d.bar)

  // 1) early accumulation: 좁은 박스 (range < 1%)
  const earlyHigh = Math.max(...earlyBars.map(b => b.high))
  const earlyLow = Math.min(...earlyBars.map(b => b.low))
  if (earlyLow <= 0) return null
  const earlyWidth = (earlyHigh - earlyLow) / earlyLow
  if (earlyWidth >= 0.01) return null

  // 2) mid manipulation: early 박스 밖으로 스윕
  const midHigh = Math.max(...midBars.map(b => b.high))
  const midLow = Math.min(...midBars.map(b => b.low))
  let midSweepDir: 'up' | 'down' | null = null
  if (midHigh > earlyHigh && (midHigh - earlyHigh) / earlyHigh >= 0.002) midSweepDir = 'up'
  if (midLow < earlyLow && (earlyLow - midLow) / earlyLow >= 0.002) {
    // 양방향 모두 깨졌다면 더 큰 쪽 채택
    const upMag = midHigh > earlyHigh ? (midHigh - earlyHigh) / earlyHigh : 0
    const dnMag = (earlyLow - midLow) / earlyLow
    midSweepDir = dnMag >= upMag ? 'down' : midSweepDir
  }
  if (midSweepDir === null) return null

  // 3) late distribution: mid 스윕과 반대 방향 추세
  const lateOpen = lateBars[0].open
  const lateClose = lateBars[lateBars.length - 1].close
  if (lateOpen <= 0) return null
  const lateChange = (lateClose - lateOpen) / lateOpen

  if (midSweepDir === 'down' && lateChange >= 0.005) {
    // 하방 스윕 후 상승 추세 → 매집형
    return 'po3-accumulation'
  }
  if (midSweepDir === 'up' && lateChange <= -0.005) {
    // 상방 스윕 후 하락 추세 → 분배형
    return 'po3-distribution'
  }
  return null
}

// ============================================
// 메인 엔트리
// ============================================
export function analyzeSession(bars: SessionBar[], market: 'KR' | 'US'): SessionResult {
  const empty: SessionResult = {
    currentSession: null,
    judasSwingDetected: false,
    judasSwingDirection: null,
    po3Pattern: null,
    description: '데이터 부족',
  }
  if (!bars || bars.length === 0) return empty

  const days = groupByTradingDay(bars, market)
  if (days.length === 0) return empty

  // 현재 세션: 마지막 봉 기준
  const lastDay = days[days.length - 1]
  const lastEntry = lastDay.bars[lastDay.bars.length - 1]
  const currentSession = lastEntry ? classifySession(lastEntry.parsed, market) : null

  // Judas Swing: 직전일 레인지(전체 일중 고저) 기준 당일 첫 30분 스윕
  let judasSwing: JudasResult = { detected: false, direction: null }
  if (days.length >= 2) {
    const prevDay = days[days.length - 2]
    const prevHigh = Math.max(...prevDay.bars.map(d => d.bar.high))
    const prevLow = Math.min(...prevDay.bars.map(d => d.bar.low))
    judasSwing = detectJudasSwing(lastDay.bars, prevHigh, prevLow, market)
  }

  // PO3: "마지막 풀 트레이딩 데이" — 마지막 날이 종료된 것으로 가정하기 어려우므로
  // 충분히 길면 마지막 날, 아니면 직전 날 사용.
  let po3Pattern: Po3Pattern = null
  const minBarsForPo3 = 9
  const lastDayBarCount = lastDay.bars.length
  if (lastDayBarCount >= minBarsForPo3 * 2) {
    po3Pattern = detectPo3(lastDay.bars)
  } else if (days.length >= 2) {
    const prevDay = days[days.length - 2]
    if (prevDay.bars.length >= minBarsForPo3) {
      po3Pattern = detectPo3(prevDay.bars)
    }
  }

  // 설명 생성 (한국어)
  const parts: string[] = []
  if (currentSession) parts.push(`세션: ${currentSession}`)
  if (judasSwing.detected) {
    parts.push(judasSwing.direction === 'bullish-fake'
      ? 'Judas Swing 감지(가짜 하락 후 반등)'
      : 'Judas Swing 감지(가짜 상승 후 반락)')
  }
  if (po3Pattern === 'po3-accumulation') parts.push('PO3 매집 패턴')
  else if (po3Pattern === 'po3-distribution') parts.push('PO3 분배 패턴')
  if (parts.length === 0) parts.push('세션 시그널 없음')

  return {
    currentSession,
    judasSwingDetected: judasSwing.detected,
    judasSwingDirection: judasSwing.direction,
    po3Pattern,
    description: parts.join(' · '),
  }
}
