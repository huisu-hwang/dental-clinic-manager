/**
 * KIS (한국투자증권) Open API 서비스
 *
 * - 토큰 발급/갱신 (Race Condition 방지)
 * - 국내/미국 주식 주문
 * - 잔고 조회
 * - 일봉 데이터 조회 (백테스트용)
 *
 * 도메인:
 *   모의투자: https://openapivts.koreainvestment.com:29443
 *   실전투자: https://openapi.koreainvestment.com:9443
 */

import type { KISTokenResponse, KISOrderResponse, KISDailyPriceItem, Market, OHLCV } from '@/types/investment'

// ============================================
// 상수
// ============================================

const KIS_DOMAINS = {
  paper: 'https://openapivts.koreainvestment.com:29443',
  live: 'https://openapi.koreainvestment.com:9443',
} as const

/** 국내 주문 tr_id */
const KR_ORDER_TR_IDS = {
  paper: { buy: 'VTTC0802U', sell: 'VTTC0801U' },
  live: { buy: 'TTTC0802U', sell: 'TTTC0801U' },
} as const

/** 미국 주문 tr_id */
const US_ORDER_TR_IDS = {
  paper: { buy: 'VTTS0308U', sell: 'VTTS0307U' },
  live: { buy: 'TTTS0308U', sell: 'TTTS0307U' },
} as const

/** 미국 거래소 코드 */
const US_EXCHANGE_CODES: Record<string, string> = {
  NASD: 'NASD',
  NYSE: 'NYSE',
  AMEX: 'AMEX',
}

// ============================================
// 토큰 관리 (Race Condition 방지 + DB 캐시)
// ============================================

/** credential별 토큰 갱신 잠금 (동일 프로세스 내 중복 호출 방지) */
const tokenLocks = new Map<string, Promise<string>>()

/** 메모리 토큰 캐시 (동일 프로세스 내 빠른 조회) */
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

interface KISCredential {
  appKey: string
  appSecret: string
  isPaperTrading: boolean
}

function getBaseUrl(isPaperTrading: boolean): string {
  return isPaperTrading ? KIS_DOMAINS.paper : KIS_DOMAINS.live
}

/**
 * KIS Access Token 발급
 * 우선순위:
 *   1. 메모리 캐시 (동일 프로세스)
 *   2. DB 캐시 (서버리스 인스턴스 간 공유, PWA/웹/워커 공통)
 *   3. KIS API 호출 (최후 수단, 1분당 1회 제한 있음)
 */
export async function getAccessToken(
  credentialId: string,
  credential: KISCredential,
  forceRefresh = false
): Promise<string> {
  // 강제 갱신 시 캐시 무효화 후 KIS에서 새로 발급
  if (forceRefresh) {
    tokenCache.delete(credentialId)
  }

  // 1. 메모리 캐시 확인 (만료 1시간 전이면 유효)
  if (!forceRefresh) {
    const cached = tokenCache.get(credentialId)
    if (cached && cached.expiresAt > Date.now() + 3600_000) {
      return cached.token
    }
  }

  // 2. 이미 갱신 중이면 동일 Promise 재사용 (단, 강제 갱신은 별도 진행)
  if (!forceRefresh) {
    const existing = tokenLocks.get(credentialId)
    if (existing) return existing
  }

  // 3. 새로 발급 (DB 캐시 확인 → API 호출)
  const refreshPromise = refreshToken(credentialId, credential, forceRefresh)
  tokenLocks.set(credentialId, refreshPromise)

  try {
    return await refreshPromise
  } finally {
    tokenLocks.delete(credentialId)
  }
}

async function refreshToken(
  credentialId: string,
  credential: KISCredential,
  forceRefresh = false
): Promise<string> {
  // 2-1. DB 캐시 확인 (forceRefresh 시 건너뜀, 만료 1시간 전까지만 유효)
  const dbToken = forceRefresh ? null : await loadTokenFromDb(credentialId)
  if (dbToken && dbToken.expiresAt > Date.now() + 3600_000) {
    // 메모리 캐시에도 저장
    tokenCache.set(credentialId, dbToken)
    return dbToken.token
  }

  // 2-2. KIS API로 새 토큰 발급
  const baseUrl = getBaseUrl(credential.isPaperTrading)

  const response = await fetch(`${baseUrl}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: credential.appKey,
      appsecret: credential.appSecret,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    // 403 = 발급 제한(1분당 1회) - DB 캐시가 있으면 만료 시간 체크 느슨하게 fallback
    if (response.status === 403 && dbToken && dbToken.expiresAt > Date.now()) {
      console.warn('[KIS] 토큰 발급 제한 - DB 캐시 토큰 fallback 사용')
      tokenCache.set(credentialId, dbToken)
      return dbToken.token
    }
    throw new Error(`KIS 토큰 발급 실패 (${response.status}): ${text}`)
  }

  const data: KISTokenResponse = await response.json()
  const expiresAt = new Date(data.access_token_token_expired).getTime()

  // 메모리 캐시 + DB 캐시 저장
  tokenCache.set(credentialId, { token: data.access_token, expiresAt })
  await saveTokenToDb(credentialId, data.access_token, expiresAt)

  return data.access_token
}

/**
 * DB에서 캐시된 토큰 로드
 */
async function loadTokenFromDb(credentialId: string): Promise<{ token: string; expiresAt: number } | null> {
  try {
    // 동적 import로 서버 사이드에서만 로드
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const { investmentDecrypt } = await import('@/lib/investmentCrypto')
    const supabase = getSupabaseAdmin()
    if (!supabase) return null

    const { data } = await supabase
      .from('user_broker_credentials')
      .select('cached_access_token_encrypted, token_expires_at')
      .eq('id', credentialId)
      .maybeSingle()

    if (!data?.cached_access_token_encrypted || !data?.token_expires_at) return null

    const expiresAt = new Date(data.token_expires_at).getTime()
    if (Number.isNaN(expiresAt)) return null

    const token = investmentDecrypt(data.cached_access_token_encrypted)
    return { token, expiresAt }
  } catch (err) {
    console.warn('[KIS] DB 토큰 로드 실패:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * DB에 토큰 저장 (암호화)
 */
async function saveTokenToDb(credentialId: string, token: string, expiresAt: number): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import('@/lib/supabase/admin')
    const { investmentEncrypt } = await import('@/lib/investmentCrypto')
    const supabase = getSupabaseAdmin()
    if (!supabase) return

    const encrypted = investmentEncrypt(token)
    const expiresAtIso = new Date(expiresAt).toISOString()

    await supabase
      .from('user_broker_credentials')
      .update({
        cached_access_token_encrypted: encrypted,
        token_expires_at: expiresAtIso,
      })
      .eq('id', credentialId)
  } catch (err) {
    console.warn('[KIS] DB 토큰 저장 실패:', err instanceof Error ? err.message : err)
  }
}

/**
 * 토큰 캐시 무효화 (credential 비활성화 시)
 */
export function invalidateToken(credentialId: string): void {
  tokenCache.delete(credentialId)
  tokenLocks.delete(credentialId)
}

// ============================================
// 국내 주식 주문
// ============================================

interface KROrderParams {
  credentialId: string
  credential: KISCredential
  accountNumber: string
  ticker: string         // 6자리 종목코드 (예: "005930")
  orderType: 'buy' | 'sell'
  quantity: number
  price: number          // 0이면 시장가
}

export async function placeKROrder(params: KROrderParams): Promise<KISOrderResponse> {
  const { credentialId, credential, accountNumber, ticker, orderType, quantity, price } = params
  const token = await getAccessToken(credentialId, credential)
  const baseUrl = getBaseUrl(credential.isPaperTrading)
  const mode = credential.isPaperTrading ? 'paper' : 'live'
  const trId = KR_ORDER_TR_IDS[mode][orderType]

  // 주문 유형: 00=지정가, 01=시장가
  const orderDivision = price > 0 ? '00' : '01'

  const response = await fetch(`${baseUrl}/uapi/domestic-stock/v1/trading/order-cash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: credential.appKey,
      appsecret: credential.appSecret,
      tr_id: trId,
    },
    body: JSON.stringify({
      CANO: accountNumber.substring(0, 8),
      ACNT_PRDT_CD: accountNumber.substring(8, 10) || '01',
      PDNO: ticker,
      ORD_DVSN: orderDivision,
      ORD_QTY: String(quantity),
      ORD_UNPR: String(price > 0 ? price : 0),
    }),
  })

  const data: KISOrderResponse = await response.json()

  if (data.rt_cd !== '0') {
    throw new Error(`KIS 국내 주문 실패: [${data.msg_cd}] ${data.msg1}`)
  }

  return data
}

// ============================================
// 미국 주식 주문
// ============================================

interface USOrderParams {
  credentialId: string
  credential: KISCredential
  accountNumber: string
  ticker: string           // 미국 종목 심볼 (예: "AAPL")
  exchange: string         // "NASD" | "NYSE" | "AMEX"
  orderType: 'buy' | 'sell'
  quantity: number
  price: number            // 0이면 시장가
}

export async function placeUSOrder(params: USOrderParams): Promise<KISOrderResponse> {
  const { credentialId, credential, accountNumber, ticker, exchange, orderType, quantity, price } = params
  const token = await getAccessToken(credentialId, credential)
  const baseUrl = getBaseUrl(credential.isPaperTrading)
  const mode = credential.isPaperTrading ? 'paper' : 'live'
  const trId = US_ORDER_TR_IDS[mode][orderType]

  // 미국 주문 유형: 00=지정가, 32=시장가(LOO)
  const orderDivision = price > 0 ? '00' : '32'

  const response = await fetch(`${baseUrl}/uapi/overseas-stock/v1/trading/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: credential.appKey,
      appsecret: credential.appSecret,
      tr_id: trId,
    },
    body: JSON.stringify({
      CANO: accountNumber.substring(0, 8),
      ACNT_PRDT_CD: accountNumber.substring(8, 10) || '01',
      OVRS_EXCG_CD: US_EXCHANGE_CODES[exchange] || 'NASD',
      PDNO: ticker,
      ORD_DVSN: orderDivision,
      ORD_QTY: String(quantity),
      OVRS_ORD_UNPR: String(price > 0 ? price : 0),
    }),
  })

  const data: KISOrderResponse = await response.json()

  if (data.rt_cd !== '0') {
    throw new Error(`KIS 미국 주문 실패: [${data.msg_cd}] ${data.msg1}`)
  }

  return data
}

// ============================================
// 국내 일봉 데이터 조회 (백테스트용)
// ============================================

interface DailyPriceParams {
  credentialId: string
  credential: KISCredential
  ticker: string
  startDate: string  // YYYYMMDD
  endDate: string    // YYYYMMDD
}

export async function getKRDailyPrices(params: DailyPriceParams): Promise<OHLCV[]> {
  const { credentialId, credential, ticker, startDate, endDate } = params
  const token = await getAccessToken(credentialId, credential)
  const baseUrl = getBaseUrl(credential.isPaperTrading)

  const queryParams = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',  // 주식
    FID_INPUT_ISCD: ticker,
    FID_INPUT_DATE_1: startDate,
    FID_INPUT_DATE_2: endDate,
    FID_PERIOD_DIV_CODE: 'D',  // 일봉
    FID_ORG_ADJ_PRC: '0',     // 수정주가 미반영 (0=원주가, 1=수정주가)
  })

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${queryParams}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: credential.appKey,
        appsecret: credential.appSecret,
        tr_id: 'FHKST03010100',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`KIS 일봉 조회 실패 (${response.status})`)
  }

  const json = await response.json()

  if (json.rt_cd !== '0') {
    throw new Error(`KIS 일봉 조회 실패: [${json.msg_cd}] ${json.msg1}`)
  }

  const items: KISDailyPriceItem[] = json.output2 || []

  return items
    .filter(item => item.stck_bsop_date && item.stck_clpr !== '0')
    .map(item => ({
      date: `${item.stck_bsop_date.slice(0, 4)}-${item.stck_bsop_date.slice(4, 6)}-${item.stck_bsop_date.slice(6, 8)}`,
      open: parseFloat(item.stck_oprc),
      high: parseFloat(item.stck_hgpr),
      low: parseFloat(item.stck_lwpr),
      close: parseFloat(item.stck_clpr),
      volume: parseInt(item.acml_vol, 10),
    }))
    .reverse()  // KIS는 최신일 먼저 → 오래된 순으로 정렬
}

// ============================================
// 잔고 조회
// ============================================

export interface KRBalanceItem {
  ticker: string
  tickerName: string
  quantity: number
  avgPrice: number
  currentPrice: number
  pnl: number
  pnlRate: number
}

/** KIS 토큰 만료 메시지 코드 (재시도 트리거) */
const TOKEN_EXPIRED_MSG_CD = 'EGW00123'

function isTokenExpiredResponse(text: string, json?: { msg_cd?: string }): boolean {
  if (json?.msg_cd === TOKEN_EXPIRED_MSG_CD) return true
  return text.includes(TOKEN_EXPIRED_MSG_CD) || text.includes('기간이 만료된 token')
}

async function fetchKRBalance(token: string, credential: KISCredential, accountNumber: string) {
  const baseUrl = getBaseUrl(credential.isPaperTrading)
  const queryParams = new URLSearchParams({
    CANO: accountNumber.substring(0, 8),
    ACNT_PRDT_CD: accountNumber.substring(8, 10) || '01',
    AFHR_FLPR_YN: 'N',
    OFL_YN: '',
    INQR_DVSN: '02',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '00',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  })

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/trading/inquire-balance?${queryParams}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: credential.appKey,
        appsecret: credential.appSecret,
        tr_id: credential.isPaperTrading ? 'VTTC8434R' : 'TTTC8434R',
      },
    }
  )

  const bodyText = await response.text()
  let json: KRBalanceJson | null = null
  try {
    json = bodyText ? (JSON.parse(bodyText) as KRBalanceJson) : null
  } catch {
    json = null
  }
  return { response, bodyText, json }
}

interface KRBalanceJson {
  rt_cd?: string
  msg_cd?: string
  msg1?: string
  output1?: Record<string, string>[]
  output2?: Record<string, string>[]
}

export async function getKRBalance(
  credentialId: string,
  credential: KISCredential,
  accountNumber: string
): Promise<{ items: KRBalanceItem[]; totalEvaluation: number; totalPnl: number }> {
  let token = await getAccessToken(credentialId, credential)
  let { response, bodyText, json } = await fetchKRBalance(token, credential, accountNumber)

  // 토큰 만료 감지 시 1회 강제 갱신 후 재시도
  // (DB 캐시는 만료 전이라 유효해 보이지만, KIS 서버 측에서 무효화된 경우 발생)
  const tokenExpired =
    (!response.ok || (json && json.rt_cd !== '0')) && isTokenExpiredResponse(bodyText, json ?? undefined)
  if (tokenExpired) {
    console.warn('[KIS getKRBalance] token expired, force-refreshing and retrying once')
    invalidateToken(credentialId)
    token = await getAccessToken(credentialId, credential, true)
    ;({ response, bodyText, json } = await fetchKRBalance(token, credential, accountNumber))
  }

  if (!response.ok) {
    console.error('[KIS getKRBalance] HTTP error', {
      status: response.status,
      isPaperTrading: credential.isPaperTrading,
      cano: accountNumber.substring(0, 8),
      acntPrdtCd: accountNumber.substring(8, 10) || '01',
      bodyPreview: bodyText.slice(0, 500),
    })
    throw new Error(`KIS 잔고 조회 실패 (HTTP ${response.status}): ${bodyText.slice(0, 200) || '응답 본문 없음'}`)
  }

  if (!json || json.rt_cd !== '0') {
    console.error('[KIS getKRBalance] business error', {
      rt_cd: json?.rt_cd,
      msg_cd: json?.msg_cd,
      msg1: json?.msg1,
      isPaperTrading: credential.isPaperTrading,
    })
    throw new Error(`KIS 잔고 조회 실패: [${json?.msg_cd ?? 'UNKNOWN'}] ${json?.msg1 ?? '응답 파싱 실패'}`)
  }

  const output1 = json.output1 || []
  const output2 = json.output2?.[0] || {}

  const items: KRBalanceItem[] = output1
    .filter((item: Record<string, string>) => parseInt(item.hldg_qty, 10) > 0)
    .map((item: Record<string, string>) => ({
      ticker: item.pdno,
      tickerName: item.prdt_name,
      quantity: parseInt(item.hldg_qty, 10),
      avgPrice: parseFloat(item.pchs_avg_pric),
      currentPrice: parseFloat(item.prpr),
      pnl: parseFloat(item.evlu_pfls_amt),
      pnlRate: parseFloat(item.evlu_pfls_rt),
    }))

  return {
    items,
    totalEvaluation: parseFloat(output2.tot_evlu_amt || '0'),
    totalPnl: parseFloat(output2.evlu_pfls_smtl_amt || '0'),
  }
}

// ============================================
// 국내 분봉 데이터 조회 (스마트머니 분석용)
// ============================================

export interface KRMinuteBar {
  /** ISO timestamp (한국 시간 기준 YYYY-MM-DDTHH:mm:00+09:00) */
  datetime: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  /** 거래대금 (원). 없으면 close × volume 추정값 */
  value: number
}

interface MinutePriceParams {
  credentialId: string
  credential: KISCredential
  ticker: string
  /** 1, 5, 10, 30분봉 (KIS 기본 구현은 1분 단위 — 5/10/30은 클라이언트 집계) */
  intervalMinutes?: 1 | 5 | 10 | 30
  /** 반환할 봉 개수 (기본 30) — KIS 한 번 호출 당 최대 30개 */
  count?: number
}

/**
 * 국내 분봉 (다일) 조회 — 페이지네이션 자동 처리
 *
 * 실전계좌(`isPaperTrading=false`):
 *   `inquire-time-dailychartprice` (TR_ID: FHKST03010230) — 회당 120봉, 1년치 보관
 *   FID_INPUT_DATE_1/HOUR_1 cursor로 과거 거래일까지 거슬러 페이징
 *
 * 모의계좌(`isPaperTrading=true`):
 *   `inquire-time-itemchartprice` (TR_ID: FHKST03010200) — 당일 분봉만, 회당 30봉
 *   (FHKST03010230은 모의 미지원)
 *
 * 5/10/30분봉이 요청되면 1분봉을 N개 단위로 집계하여 반환.
 */
export async function getKRMinutePrices(params: MinutePriceParams): Promise<KRMinuteBar[]> {
  const { credentialId, credential, ticker, intervalMinutes = 1, count = 30 } = params

  const accumulated = new Map<string, KRMinuteBar>()
  const REQUEST_DELAY_MS = 60 // KIS rate limit 회피 (20 req/sec)

  if (!credential.isPaperTrading) {
    // ===== 실전계좌: FHKST03010230 (date+hour cursor, 120봉/req) =====
    // 1200봉(≈3거래일) ≤ 11회 호출 + 안전 마진 = 16회
    const MAX_REQUESTS = 16
    let cursorDate = kstYyyymmdd(new Date())
    let cursorHour = kstHhmmss(new Date())

    for (let i = 0; i < MAX_REQUESTS; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
      const chunk = await fetchKRMinutesPastDay(credentialId, credential, ticker, cursorDate, cursorHour)

      if (chunk.length === 0) {
        // 빈 응답 → 휴장/공휴일 → 직전 영업일 15:30:00로 점프
        const prev = previousBusinessDay(cursorDate)
        cursorDate = prev
        cursorHour = '153000'
        continue
      }

      let added = 0
      for (const bar of chunk) {
        if (!accumulated.has(bar.datetime)) {
          accumulated.set(bar.datetime, bar)
          added += 1
        }
      }

      if (accumulated.size >= count) break

      // 다음 cursor: 이번 chunk에서 가장 오래된 봉의 시각 - 1분
      const oldest = chunk[0]
      const m = oldest.datetime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
      if (!m) break
      const [, y, mo, d, hh, mm] = m
      const oldestDateStr = `${y}${mo}${d}`
      const oldestMinutes = parseInt(hh, 10) * 60 + parseInt(mm, 10)
      const KR_OPEN_MIN = 9 * 60 // 09:00

      if (added === 0 || oldestMinutes <= KR_OPEN_MIN) {
        // 더 받을 게 없거나 장 시작 도달 → 직전 영업일로 점프
        cursorDate = previousBusinessDay(oldestDateStr)
        cursorHour = '153000'
      } else {
        const prevMin = oldestMinutes - 1
        const phh = String(Math.floor(prevMin / 60)).padStart(2, '0')
        const pmm = String(prevMin % 60).padStart(2, '0')
        cursorDate = oldestDateStr
        cursorHour = `${phh}${pmm}00`
      }
    }
  } else {
    // ===== 모의계좌: FHKST03010200 (당일만, 30봉/req) =====
    let cursor: string | undefined = undefined
    const MAX_REQUESTS = 40

    for (let i = 0; i < MAX_REQUESTS; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
      const chunk = await fetchKRMinutesAtCursor(credentialId, credential, ticker, cursor, 1, 30)
      if (chunk.length === 0) break

      let added = 0
      for (const bar of chunk) {
        if (!accumulated.has(bar.datetime)) {
          accumulated.set(bar.datetime, bar)
          added += 1
        }
      }
      if (added === 0) break

      if (accumulated.size >= count) break

      const oldest = chunk[0]
      const oldestDate = new Date(oldest.datetime)
      oldestDate.setMinutes(oldestDate.getMinutes() - 1)
      const kstDate = new Date(oldestDate.getTime() + 9 * 3600_000)
      const hh2 = String(kstDate.getUTCHours()).padStart(2, '0')
      const mm2 = String(kstDate.getUTCMinutes()).padStart(2, '0')
      cursor = `${hh2}${mm2}00`
    }
  }

  // 시간 순(과거→최신) 정렬 후 마지막 count
  const sorted = Array.from(accumulated.values()).sort((a, b) => a.datetime.localeCompare(b.datetime))
  const sliced = sorted.slice(-count)

  if (intervalMinutes === 1) return sliced

  // N분봉 집계
  const aggregated: KRMinuteBar[] = []
  for (let i = 0; i < sliced.length; i += intervalMinutes) {
    const chunk = sliced.slice(i, i + intervalMinutes)
    if (chunk.length === 0) continue
    const open = chunk[0].open
    const close = chunk[chunk.length - 1].close
    let high = -Infinity
    let low = Infinity
    let volume = 0
    let value = 0
    for (const b of chunk) {
      if (b.high > high) high = b.high
      if (b.low < low) low = b.low
      volume += b.volume
      value += b.value
    }
    aggregated.push({
      datetime: chunk[0].datetime,
      open,
      high,
      low,
      close,
      volume,
      value,
    })
  }
  return aggregated
}

/** 단일 KIS 분봉 호출 (30봉 max) — cursor=HHmmss 시점 이전 30봉 반환 */
async function fetchKRMinutesAtCursor(
  credentialId: string,
  credential: { appKey: string; appSecret: string; isPaperTrading: boolean },
  ticker: string,
  cursorHHmmss: string | undefined,
  intervalMinutes: 1 | 5 | 10 | 30,
  count: number,
): Promise<KRMinuteBar[]> {
  const token = await getAccessToken(credentialId, credential)
  const baseUrl = getBaseUrl(credential.isPaperTrading)

  const inputHour = cursorHHmmss ?? (() => {
    const nowKst = new Date(Date.now() + 9 * 3600_000)
    const hh = String(nowKst.getUTCHours()).padStart(2, '0')
    const mm = String(nowKst.getUTCMinutes()).padStart(2, '0')
    const ss = String(nowKst.getUTCSeconds()).padStart(2, '0')
    return `${hh}${mm}${ss}`
  })()

  const queryParams = new URLSearchParams({
    FID_ETC_CLS_CODE: '',
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: ticker,
    FID_INPUT_HOUR_1: inputHour,
    FID_PW_DATA_INCU_YN: 'N',
  })

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice?${queryParams}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: credential.appKey,
        appsecret: credential.appSecret,
        tr_id: 'FHKST03010200',
        custtype: 'P',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`KIS 분봉 조회 실패 (${response.status})`)
  }

  const json = await response.json()
  if (json.rt_cd !== '0') {
    throw new Error(`KIS 분봉 조회 실패: [${json.msg_cd}] ${json.msg1}`)
  }

  interface KISMinuteItem {
    stck_bsop_date?: string  // YYYYMMDD
    stck_cntg_hour?: string  // HHmmss
    stck_prpr?: string       // 현재가(종가)
    stck_oprc?: string       // 시가
    stck_hgpr?: string       // 고가
    stck_lwpr?: string       // 저가
    cntg_vol?: string        // 체결거래량
    acml_tr_pbmn?: string    // 누적거래대금 (없으면 close*vol 추정)
  }

  const items: KISMinuteItem[] = json.output2 || []

  // 최신 → 과거를 과거 → 최신 순으로 뒤집고 매핑
  const bars1m: KRMinuteBar[] = items
    .filter(it => it.stck_cntg_hour && it.stck_prpr && it.stck_prpr !== '0')
    .map(it => {
      const date = it.stck_bsop_date ?? ''
      const time = it.stck_cntg_hour ?? '000000'
      const isoDate = date.length === 8
        ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
        : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
      const isoTime = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6) || '00'}`
      const close = parseFloat(it.stck_prpr ?? '0')
      const volume = parseInt(it.cntg_vol ?? '0', 10)
      const value = it.acml_tr_pbmn ? parseFloat(it.acml_tr_pbmn) : close * volume
      return {
        datetime: `${isoDate}T${isoTime}+09:00`,
        open: parseFloat(it.stck_oprc ?? it.stck_prpr ?? '0'),
        high: parseFloat(it.stck_hgpr ?? it.stck_prpr ?? '0'),
        low: parseFloat(it.stck_lwpr ?? it.stck_prpr ?? '0'),
        close,
        volume,
        value,
      }
    })
    .reverse()

  // intervalMinutes는 헬퍼에서 사용하지 않음 (1분봉 raw만 반환).
  // N분봉 집계는 호출 측(getKRMinutePrices)에서 처리.
  void intervalMinutes
  return bars1m.slice(-count)
}

/**
 * 일별 분봉 조회 (실전계좌 전용) — TR_ID FHKST03010230, 회당 120봉
 *
 * `FID_INPUT_DATE_1` 일자의 `FID_INPUT_HOUR_1` 시점 이전 분봉 최대 120개 반환.
 * 모의투자 미지원.
 */
async function fetchKRMinutesPastDay(
  credentialId: string,
  credential: { appKey: string; appSecret: string; isPaperTrading: boolean },
  ticker: string,
  date: string,  // YYYYMMDD
  hour: string,  // HHMMSS
  attempt = 0,
): Promise<KRMinuteBar[]> {
  const token = await getAccessToken(credentialId, credential)
  const baseUrl = getBaseUrl(credential.isPaperTrading)

  const queryParams = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: ticker,
    FID_INPUT_HOUR_1: hour,
    FID_INPUT_DATE_1: date,
    FID_PW_DATA_INCU_YN: 'N',
    FID_FAKE_TICK_INCU_YN: 'N',
  })

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-time-dailychartprice?${queryParams}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: credential.appKey,
        appsecret: credential.appSecret,
        tr_id: 'FHKST03010230',
        custtype: 'P',
      },
    }
  )

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    // 토큰 만료 → invalidate + 1회 재시도
    if (attempt === 0 && (response.status === 401 || isTokenExpiredResponse(text))) {
      invalidateToken(credentialId)
      return fetchKRMinutesPastDay(credentialId, credential, ticker, date, hour, attempt + 1)
    }
    console.warn('[KIS FHKST03010230] HTTP error', { status: response.status, date, hour, body: text.slice(0, 300) })
    throw new Error(`KIS 일별 분봉 조회 실패 (${response.status})`)
  }

  const json = await response.json()
  if (json.rt_cd !== '0') {
    // 토큰 만료 → invalidate + 1회 재시도
    if (attempt === 0 && json.msg_cd === TOKEN_EXPIRED_MSG_CD) {
      invalidateToken(credentialId)
      return fetchKRMinutesPastDay(credentialId, credential, ticker, date, hour, attempt + 1)
    }
    // rt_cd != '0'은 모두 "데이터 없음"으로 간주하고 호출 측이 cursor 점프하도록
    // (휴장일/공휴일/장 시작 전 미래 시각 등 다양한 코드 — KIS msg_cd가 표준화되어 있지 않음)
    console.warn('[KIS FHKST03010230] empty response', { msg_cd: json.msg_cd, msg1: json.msg1, date, hour })
    return []
  }

  interface KISMinuteItem {
    stck_bsop_date?: string
    stck_cntg_hour?: string
    stck_prpr?: string
    stck_oprc?: string
    stck_hgpr?: string
    stck_lwpr?: string
    cntg_vol?: string
    acml_tr_pbmn?: string
  }

  const items: KISMinuteItem[] = json.output2 || []

  // 최신 → 과거를 과거 → 최신 순으로 뒤집고 매핑
  const bars1m: KRMinuteBar[] = items
    .filter((it) => it.stck_cntg_hour && it.stck_prpr && it.stck_prpr !== '0')
    .map((it) => {
      const d = it.stck_bsop_date ?? date
      const t = it.stck_cntg_hour ?? '000000'
      const isoDate = d.length === 8
        ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`
        : new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
      const isoTime = `${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4, 6) || '00'}`
      const close = parseFloat(it.stck_prpr ?? '0')
      const volume = parseInt(it.cntg_vol ?? '0', 10)
      const value = it.acml_tr_pbmn ? parseFloat(it.acml_tr_pbmn) : close * volume
      return {
        datetime: `${isoDate}T${isoTime}+09:00`,
        open: parseFloat(it.stck_oprc ?? it.stck_prpr ?? '0'),
        high: parseFloat(it.stck_hgpr ?? it.stck_prpr ?? '0'),
        low: parseFloat(it.stck_lwpr ?? it.stck_prpr ?? '0'),
        close,
        volume,
        value,
      }
    })
    .reverse()

  return bars1m
}

/** YYYYMMDD KST 오늘 */
function kstYyyymmdd(now: Date): string {
  const k = new Date(now.getTime() + 9 * 3600_000)
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, '0')}${String(k.getUTCDate()).padStart(2, '0')}`
}

/** HHMMSS KST 현재 시각 (장 마감 후/주말이면 15:30:00) */
function kstHhmmss(now: Date): string {
  const k = new Date(now.getTime() + 9 * 3600_000)
  const dow = k.getUTCDay() // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return '153000'
  const hh = k.getUTCHours()
  const mm = k.getUTCMinutes()
  if (hh < 9) return '153000' // 장 시작 전 → 전 영업일 mark (호출 측에서 점프)
  if (hh > 15 || (hh === 15 && mm > 30)) return '153000'
  return `${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`
}

/** YYYYMMDD → 직전 영업일 YYYYMMDD (주말 건너뛰기, 공휴일은 빈 응답으로 자동 추가 점프) */
function previousBusinessDay(yyyymmdd: string): string {
  const y = parseInt(yyyymmdd.slice(0, 4), 10)
  const m = parseInt(yyyymmdd.slice(4, 6), 10)
  const d = parseInt(yyyymmdd.slice(6, 8), 10)
  const date = new Date(Date.UTC(y, m - 1, d))
  do {
    date.setUTCDate(date.getUTCDate() - 1)
  } while (date.getUTCDay() === 0 || date.getUTCDay() === 6)
  return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
}

// ============================================
// 외국인/기관 매매 동향 조회
// ============================================

export interface KRInvestorDay {
  /** YYYY-MM-DD */
  date: string
  /** 외국인 순매수 (양수=순매수, 음수=순매도) */
  foreigner_net: number
  /** 기관 순매수 */
  institution_net: number
  /** 개인 순매수 */
  retail_net: number
  /** 거래대금 합계 */
  total_value: number
}

interface InvestorTrendParams {
  credentialId: string
  credential: KISCredential
  ticker: string
  /** 최근 N영업일 (기본 20) */
  days?: number
}

/**
 * 외국인/기관 매매 동향 (시간대별 또는 일자별)
 *
 * KIS endpoint: /uapi/domestic-stock/v1/quotations/inquire-investor (TR_ID: FHKST01010900)
 *   응답이 시간대별이라면 일자별로 집계.
 *
 * 일자별 더 정확한 엔드포인트가 있으나 본 함수는 단일 종목 최근 N일 데이터
 * 정도만 반환하면 충분하므로 inquire-investor 응답을 일자 키로 reduce 한다.
 */
export async function getKRInvestorTrend(params: InvestorTrendParams): Promise<KRInvestorDay[]> {
  const { credentialId, credential, ticker, days = 20 } = params
  const token = await getAccessToken(credentialId, credential)
  const baseUrl = getBaseUrl(credential.isPaperTrading)

  const queryParams = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: ticker,
  })

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-investor?${queryParams}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: credential.appKey,
        appsecret: credential.appSecret,
        tr_id: 'FHKST01010900',
        custtype: 'P',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`KIS 투자자 동향 조회 실패 (${response.status})`)
  }

  const json = await response.json()
  if (json.rt_cd !== '0') {
    throw new Error(`KIS 투자자 동향 조회 실패: [${json.msg_cd}] ${json.msg1}`)
  }

  interface KISInvestorItem {
    stck_bsop_date?: string  // YYYYMMDD
    frgn_ntby_qty?: string   // 외국인 순매수 수량
    frgn_ntby_tr_pbmn?: string  // 외국인 순매수 거래대금
    orgn_ntby_qty?: string   // 기관 순매수 수량
    orgn_ntby_tr_pbmn?: string  // 기관 순매수 거래대금
    prsn_ntby_qty?: string   // 개인 순매수 수량
    prsn_ntby_tr_pbmn?: string  // 개인 순매수 거래대금
    acml_tr_pbmn?: string    // 누적 거래대금
  }

  const items: KISInvestorItem[] = json.output || []

  // 일자별 집계 (응답이 일자별로 분리되어 있으면 그대로, 시간대별이면 합산)
  const byDate = new Map<string, KRInvestorDay>()
  for (const it of items) {
    const date = it.stck_bsop_date ?? ''
    if (date.length !== 8) continue
    const isoDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    const fnet = parseFloat(it.frgn_ntby_tr_pbmn ?? it.frgn_ntby_qty ?? '0') || 0
    const inet = parseFloat(it.orgn_ntby_tr_pbmn ?? it.orgn_ntby_qty ?? '0') || 0
    const rnet = parseFloat(it.prsn_ntby_tr_pbmn ?? it.prsn_ntby_qty ?? '0') || 0
    const total = parseFloat(it.acml_tr_pbmn ?? '0') || 0

    const existing = byDate.get(isoDate)
    if (existing) {
      existing.foreigner_net += fnet
      existing.institution_net += inet
      existing.retail_net += rnet
      existing.total_value = Math.max(existing.total_value, total)
    } else {
      byDate.set(isoDate, {
        date: isoDate,
        foreigner_net: fnet,
        institution_net: inet,
        retail_net: rnet,
        total_value: total,
      })
    }
  }

  return Array.from(byDate.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days)
}

// ============================================
// 실시간 현재가 (Level 1 호가)
// ============================================

export interface KRRealtimeQuote {
  ticker: string
  price: number
  bid: number
  ask: number
  bidVolume: number
  askVolume: number
  volume: number
  /** ISO timestamp */
  timestamp: string
}

interface RealtimeQuoteParams {
  credentialId: string
  credential: KISCredential
  ticker: string
}

/**
 * 실시간 현재가 + Level 1 호가
 *
 * KIS endpoint: /uapi/domestic-stock/v1/quotations/inquire-price (TR_ID: FHKST01010100)
 *   호가는 inquire-asking-price-exp-ccn 등이 더 자세하지만,
 *   inquire-price 응답에 stck_prpr / stck_sdpr / wghn_avrg_stck_prc 등 기본 정보가 포함됨.
 *   호가 1단계는 별도 호출이 필요하므로 본 함수는 단순화하여
 *   가장 최근 거래가 / 누적거래량 / bid/ask = price 근사로 채우고,
 *   호가 정보가 별도 응답에 있는 경우만 보강.
 */
export async function getKRRealtimeQuote(params: RealtimeQuoteParams): Promise<KRRealtimeQuote> {
  const { credentialId, credential, ticker } = params
  const token = await getAccessToken(credentialId, credential)
  const baseUrl = getBaseUrl(credential.isPaperTrading)

  const queryParams = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: ticker,
  })

  const response = await fetch(
    `${baseUrl}/uapi/domestic-stock/v1/quotations/inquire-price?${queryParams}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: credential.appKey,
        appsecret: credential.appSecret,
        tr_id: 'FHKST01010100',
        custtype: 'P',
      },
    }
  )

  if (!response.ok) {
    throw new Error(`KIS 현재가 조회 실패 (${response.status})`)
  }

  const json = await response.json()
  if (json.rt_cd !== '0') {
    throw new Error(`KIS 현재가 조회 실패: [${json.msg_cd}] ${json.msg1}`)
  }

  const out = (json.output ?? {}) as Record<string, string>
  const price = parseFloat(out.stck_prpr ?? '0')
  // inquire-price 응답에 직접 호가는 없으므로 price 근사값
  const bid = parseFloat(out.stck_sdpr ?? out.stck_prpr ?? '0') || price
  const ask = parseFloat(out.stck_prpr ?? '0') || price
  const volume = parseInt(out.acml_vol ?? '0', 10)

  return {
    ticker,
    price,
    bid,
    ask,
    bidVolume: 0,
    askVolume: 0,
    volume,
    timestamp: new Date().toISOString(),
  }
}
