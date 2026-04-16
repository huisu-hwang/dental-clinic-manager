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
// 토큰 관리 (Race Condition 방지)
// ============================================

/** credential별 토큰 갱신 잠금 */
const tokenLocks = new Map<string, Promise<string>>()

/** 메모리 토큰 캐시 */
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
 * - 메모리 캐시 확인 → 없으면 API 호출
 * - Race Condition 방지: 동일 credential에 대한 중복 호출 차단
 */
export async function getAccessToken(
  credentialId: string,
  credential: KISCredential
): Promise<string> {
  // 1. 메모리 캐시 확인 (만료 1시간 전이면 유효)
  const cached = tokenCache.get(credentialId)
  if (cached && cached.expiresAt > Date.now() + 3600_000) {
    return cached.token
  }

  // 2. 이미 갱신 중이면 동일 Promise 재사용
  const existing = tokenLocks.get(credentialId)
  if (existing) return existing

  // 3. 새로 발급
  const refreshPromise = refreshToken(credentialId, credential)
  tokenLocks.set(credentialId, refreshPromise)

  try {
    return await refreshPromise
  } finally {
    tokenLocks.delete(credentialId)
  }
}

async function refreshToken(
  credentialId: string,
  credential: KISCredential
): Promise<string> {
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
    throw new Error(`KIS 토큰 발급 실패 (${response.status}): ${text}`)
  }

  const data: KISTokenResponse = await response.json()

  // 만료 시간 파싱 (KIS 형식: "YYYY-MM-DD HH:mm:ss")
  const expiresAt = new Date(data.access_token_token_expired).getTime()

  // 메모리 캐시 저장
  tokenCache.set(credentialId, {
    token: data.access_token,
    expiresAt,
  })

  return data.access_token
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

export async function getKRBalance(
  credentialId: string,
  credential: KISCredential,
  accountNumber: string
): Promise<{ items: KRBalanceItem[]; totalEvaluation: number; totalPnl: number }> {
  const token = await getAccessToken(credentialId, credential)
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

  if (!response.ok) {
    throw new Error(`KIS 잔고 조회 실패 (${response.status})`)
  }

  const json = await response.json()

  if (json.rt_cd !== '0') {
    throw new Error(`KIS 잔고 조회 실패: [${json.msg_cd}] ${json.msg1}`)
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
