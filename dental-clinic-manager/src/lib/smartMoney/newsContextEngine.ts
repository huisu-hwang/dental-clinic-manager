/**
 * 뉴스 이벤트 컨텍스트 엔진 — 뉴스 ±10분 윈도우 시그널 보정
 *
 * - affectedSignalIndices : signalDetails 중 high/medium 임팩트 뉴스
 *                           ±10분 윈도우 내에 트리거된 시그널 인덱스
 * - News Fade            : 뉴스 ±5분 윈도우에서 한 방향 스윕 후 50%↑ 되돌림
 *                          → 해당 시그널은 신뢰도 낮음
 * - Sell-the-News        : positive 뉴스 후 3봉 내 -0.5%↓ 거래량 증가
 * - Bad-news Accumulation: negative 뉴스 후 -0.5%↓ 였다가 5봉 내 회복 + 고거래량
 * - newsEvents 미제공/빈 배열 → 안전 기본값 반환 (throw 금지)
 */

import type {
  NewsContextResult,
  NewsEventInput,
  SignalDetail,
} from '@/types/smartMoney'

export interface NewsBar {
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface NewsAnalyzerInput {
  bars: NewsBar[]
  signalDetails: SignalDetail[]
  newsEvents?: NewsEventInput[]
}

// ============================================
// datetime → epoch ms (ISO 우선, 실패 시 null)
// ============================================
function toEpoch(raw: string | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null
  const d = new Date(raw)
  if (!isNaN(d.getTime())) return d.getTime()
  // KIS "YYYYMMDDHHMM" 폴백 — UTC로 가정 (정확한 절대시각이 아니어도 윈도우 비교에는 무방)
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 12) {
    const y = parseInt(digits.slice(0, 4), 10)
    const m = parseInt(digits.slice(4, 6), 10)
    const dy = parseInt(digits.slice(6, 8), 10)
    const h = parseInt(digits.slice(8, 10), 10)
    const mi = parseInt(digits.slice(10, 12), 10)
    if ([y, m, dy, h, mi].every(Number.isFinite)) {
      return Date.UTC(y, m - 1, dy, h, mi)
    }
  }
  return null
}

const MIN_MS = 60 * 1000

// ============================================
// 시그널 인덱스 마킹 (±10분)
// ============================================
function findAffectedSignals(
  signalDetails: SignalDetail[],
  events: { ts: number; impact: NewsEventInput['impact'] }[]
): number[] {
  const window = 10 * MIN_MS
  const affected: number[] = []
  for (let i = 0; i < signalDetails.length; i++) {
    const sigTs = toEpoch(signalDetails[i].triggeredAt)
    if (sigTs === null) continue
    for (const ev of events) {
      if (ev.impact === 'low') continue
      if (Math.abs(sigTs - ev.ts) <= window) {
        affected.push(i)
        break
      }
    }
  }
  return affected
}

// ============================================
// 패턴 감지
// ============================================
type NewsPattern = 'news-fade' | 'sell-the-news' | 'bad-news-accumulation' | null

interface ParsedBar {
  bar: NewsBar
  ts: number
}

function parseBars(bars: NewsBar[]): ParsedBar[] {
  const out: ParsedBar[] = []
  for (const b of bars) {
    const ts = toEpoch(b.datetime)
    if (ts === null) continue
    out.push({ bar: b, ts })
  }
  out.sort((a, b) => a.ts - b.ts)
  return out
}

/**
 * News Fade: 뉴스 ±5분 윈도우에서 첫 봉의 종가 기준 한쪽으로 스윕한 뒤
 * 50% 이상 되돌림.
 */
function detectNewsFade(
  parsedBars: ParsedBar[],
  eventTs: number
): boolean {
  const window = 5 * MIN_MS
  const inWin = parsedBars.filter(p => Math.abs(p.ts - eventTs) <= window)
  if (inWin.length < 2) return false

  const first = inWin[0].bar
  const winHigh = Math.max(...inWin.map(p => p.bar.high))
  const winLow = Math.min(...inWin.map(p => p.bar.low))
  const lastClose = inWin[inWin.length - 1].bar.close
  const baseline = first.open > 0 ? first.open : first.close
  if (baseline <= 0) return false

  // 상방 스윕 후 되돌림
  const upSweep = winHigh - baseline
  if (upSweep > 0) {
    const reversal = winHigh - lastClose
    if (reversal / upSweep >= 0.5 && upSweep / baseline >= 0.003) return true
  }
  // 하방 스윕 후 되돌림
  const dnSweep = baseline - winLow
  if (dnSweep > 0) {
    const reversal = lastClose - winLow
    if (reversal / dnSweep >= 0.5 && dnSweep / baseline >= 0.003) return true
  }
  return false
}

/**
 * Sell-the-News: positive 뉴스 후 3봉 내 -0.5%↓ + 거래량 상승.
 */
function detectSellTheNews(
  parsedBars: ParsedBar[],
  eventTs: number
): boolean {
  // 뉴스 시각 직후 첫 봉 인덱스
  const startIdx = parsedBars.findIndex(p => p.ts >= eventTs)
  if (startIdx < 0 || startIdx + 3 > parsedBars.length) return false
  const window = parsedBars.slice(startIdx, startIdx + 3)
  if (window.length < 2) return false

  const startPrice = window[0].bar.open > 0 ? window[0].bar.open : window[0].bar.close
  const endPrice = window[window.length - 1].bar.close
  if (startPrice <= 0) return false
  const change = (endPrice - startPrice) / startPrice
  if (change > -0.005) return false

  // 거래량 상승 추세 확인 (마지막 봉 거래량 > 첫 봉 거래량)
  const firstVol = window[0].bar.volume
  const lastVol = window[window.length - 1].bar.volume
  return lastVol > firstVol
}

/**
 * Bad-news Accumulation: negative 뉴스 후 -0.5%↓ 였다가
 * 5봉 내 시작가 이상으로 회복 + 회복 봉의 고거래량.
 */
function detectBadNewsAccumulation(
  parsedBars: ParsedBar[],
  eventTs: number
): boolean {
  const startIdx = parsedBars.findIndex(p => p.ts >= eventTs)
  if (startIdx < 0 || startIdx + 5 > parsedBars.length) return false
  const window = parsedBars.slice(startIdx, startIdx + 5)
  if (window.length < 3) return false

  const startPrice = window[0].bar.open > 0 ? window[0].bar.open : window[0].bar.close
  if (startPrice <= 0) return false

  // 윈도우 내 최저점이 -0.5% 이하로 하락했는지
  const minLow = Math.min(...window.map(w => w.bar.low))
  const dropped = (minLow - startPrice) / startPrice <= -0.005
  if (!dropped) return false

  // 마지막 봉 종가가 시작가 이상 회복
  const recovered = window[window.length - 1].bar.close >= startPrice
  if (!recovered) return false

  // 평균 거래량 대비 윈도우 내 최고 거래량 1.5배 이상
  const avgVol = window.reduce((s, w) => s + w.bar.volume, 0) / window.length
  const maxVol = Math.max(...window.map(w => w.bar.volume))
  return avgVol > 0 && maxVol >= avgVol * 1.5
}

// ============================================
// 메인 엔트리
// ============================================
export function analyzeNewsContext(input: NewsAnalyzerInput): NewsContextResult {
  const { bars, signalDetails, newsEvents } = input

  // 안전 기본값
  if (!newsEvents || newsEvents.length === 0) {
    return {
      recentEvents: [],
      affectedSignalIndices: [],
      pattern: null,
      description: '뉴스 데이터 없음',
    }
  }

  // 유효 이벤트만 필터링 + epoch 변환
  type EvWithTs = { ev: NewsEventInput; ts: number }
  const evWithTs: EvWithTs[] = []
  for (const ev of newsEvents) {
    const ts = toEpoch(ev.timestamp)
    if (ts === null) continue
    evWithTs.push({ ev, ts })
  }

  if (evWithTs.length === 0) {
    return {
      recentEvents: [],
      affectedSignalIndices: [],
      pattern: null,
      description: '뉴스 데이터 없음',
    }
  }

  // 시그널 인덱스 마킹
  const eventsForMark = evWithTs.map(e => ({ ts: e.ts, impact: e.ev.impact }))
  const affectedSignalIndices = findAffectedSignals(signalDetails, eventsForMark)

  // 봉 파싱
  const parsedBars = parseBars(bars ?? [])

  // 패턴 감지: 가장 최근 high/medium 임팩트 뉴스 기준 우선 평가
  let pattern: NewsPattern = null
  // 최신순 정렬
  const sortedEvents = [...evWithTs].sort((a, b) => b.ts - a.ts)
  const significantEvents = sortedEvents.filter(e => e.ev.impact !== 'low')

  for (const { ev, ts } of significantEvents) {
    // News Fade가 가장 강한 신호 (시그널 무력화) — 우선
    if (detectNewsFade(parsedBars, ts)) {
      pattern = 'news-fade'
      break
    }
    if (ev.sentiment === 'positive' && detectSellTheNews(parsedBars, ts)) {
      pattern = 'sell-the-news'
      break
    }
    if (ev.sentiment === 'negative' && detectBadNewsAccumulation(parsedBars, ts)) {
      pattern = 'bad-news-accumulation'
      break
    }
  }

  // recentEvents: 최신 5개 (newest first)
  const recentEvents = sortedEvents.slice(0, 5).map(e => e.ev)

  // 설명 (한국어)
  const parts: string[] = []
  parts.push(`최근 뉴스 ${recentEvents.length}건`)
  if (affectedSignalIndices.length > 0) {
    parts.push(`뉴스 윈도우 영향 시그널 ${affectedSignalIndices.length}개`)
  }
  if (pattern === 'news-fade') parts.push('News Fade 감지(시그널 신뢰도 낮음)')
  else if (pattern === 'sell-the-news') parts.push('Sell-the-News 감지(호재 후 매도)')
  else if (pattern === 'bad-news-accumulation') parts.push('악재 매집 감지(하락 후 회복)')

  return {
    recentEvents,
    affectedSignalIndices,
    pattern,
    description: parts.join(' · '),
  }
}
