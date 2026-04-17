/**
 * KIS WebSocket 서비스
 *
 * 실시간 체결가 구독 (H0STCNT0)
 * - 국내 주식: ws://ops.koreainvestment.com:21000
 * - 미국 주식: ws://ops.koreainvestment.com:31000 (별도 연결)
 *
 * 보안 주의: KIS WebSocket은 ws:// (비암호화) 프로토콜.
 * 시세 데이터는 공개 정보이므로 기밀성 문제는 낮으나 MITM 위험 존재.
 */

import WebSocket from 'ws'
import { logger } from './logger'
import { getSupabase } from './supabaseClient'

// ============================================
// 상수
// ============================================

const KIS_WS_URLS = {
  KR: 'ws://ops.koreainvestment.com:21000',
  US: 'ws://ops.koreainvestment.com:31000',
}

const KIS_REST_URLS = {
  paper: 'https://openapivts.koreainvestment.com:29443',
  live: 'https://openapi.koreainvestment.com:9443',
}

// ============================================
// 타입
// ============================================

interface KISTickData {
  ticker: string
  market: 'KR' | 'US'
  price: number
  volume: number
  timestamp: string
}

type TickHandler = (data: KISTickData) => void

// ============================================
// WebSocket 관리자
// ============================================

class KISWebSocketManager {
  private wsKR: WebSocket | null = null
  private wsUS: WebSocket | null = null
  private approvalKeyKR: string | null = null
  private approvalKeyUS: string | null = null
  private subscribedTickersKR = new Set<string>()
  private subscribedTickersUS = new Set<string>()
  private tickHandlers: TickHandler[] = []
  private reconnectTimers = new Map<string, NodeJS.Timeout>()
  private isRunning = false

  /**
   * 틱 데이터 수신 핸들러 등록
   */
  onTick(handler: TickHandler) {
    this.tickHandlers.push(handler)
  }

  /**
   * 승인키 발급 (WebSocket 세션 생성용)
   */
  async getApprovalKey(appKey: string, appSecret: string, isPaper: boolean): Promise<string> {
    const baseUrl = isPaper ? KIS_REST_URLS.paper : KIS_REST_URLS.live

    const response = await fetch(`${baseUrl}/oauth2/Approval`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: appKey,
        secretkey: appSecret,
      }),
    })

    if (!response.ok) {
      throw new Error(`승인키 발급 실패: ${response.status}`)
    }

    const data = await response.json() as { approval_key: string }
    return data.approval_key
  }

  /**
   * 국내 주식 WebSocket 연결
   */
  async connectKR(approvalKey: string) {
    if (this.wsKR?.readyState === WebSocket.OPEN) {
      logger.debug('국내 WebSocket 이미 연결됨')
      return
    }

    this.approvalKeyKR = approvalKey
    this.isRunning = true

    return new Promise<void>((resolve, reject) => {
      this.wsKR = new WebSocket(KIS_WS_URLS.KR)

      this.wsKR.on('open', () => {
        logger.info('국내 WebSocket 연결 성공')
        // 기존 구독 종목 재구독
        for (const ticker of this.subscribedTickersKR) {
          this.sendSubscribe(this.wsKR!, ticker, 'KR')
        }
        resolve()
      })

      this.wsKR.on('message', (data: Buffer) => {
        this.handleMessage(data.toString(), 'KR')
      })

      this.wsKR.on('close', (code: number) => {
        logger.warn({ code }, '국내 WebSocket 연결 해제')
        if (this.isRunning) {
          this.scheduleReconnect('KR')
        }
      })

      this.wsKR.on('error', (err: Error) => {
        logger.error({ err }, '국내 WebSocket 오류')
        reject(err)
      })
    })
  }

  /**
   * 미국 주식 WebSocket 연결
   */
  async connectUS(approvalKey: string) {
    if (this.wsUS?.readyState === WebSocket.OPEN) {
      logger.debug('미국 WebSocket 이미 연결됨')
      return
    }

    this.approvalKeyUS = approvalKey
    this.isRunning = true

    return new Promise<void>((resolve, reject) => {
      this.wsUS = new WebSocket(KIS_WS_URLS.US)

      this.wsUS.on('open', () => {
        logger.info('미국 WebSocket 연결 성공')
        for (const ticker of this.subscribedTickersUS) {
          this.sendSubscribe(this.wsUS!, ticker, 'US')
        }
        resolve()
      })

      this.wsUS.on('message', (data: Buffer) => {
        this.handleMessage(data.toString(), 'US')
      })

      this.wsUS.on('close', (code: number) => {
        logger.warn({ code }, '미국 WebSocket 연결 해제')
        if (this.isRunning) {
          this.scheduleReconnect('US')
        }
      })

      this.wsUS.on('error', (err: Error) => {
        logger.error({ err }, '미국 WebSocket 오류')
        reject(err)
      })
    })
  }

  /**
   * 종목 구독 추가
   */
  subscribe(ticker: string, market: 'KR' | 'US') {
    if (market === 'KR') {
      this.subscribedTickersKR.add(ticker)
      if (this.wsKR?.readyState === WebSocket.OPEN) {
        this.sendSubscribe(this.wsKR, ticker, 'KR')
      }
    } else {
      this.subscribedTickersUS.add(ticker)
      if (this.wsUS?.readyState === WebSocket.OPEN) {
        this.sendSubscribe(this.wsUS, ticker, 'US')
      }
    }
    logger.info({ ticker, market }, '종목 구독 추가')
  }

  /**
   * 종목 구독 해제
   */
  unsubscribe(ticker: string, market: 'KR' | 'US') {
    if (market === 'KR') {
      this.subscribedTickersKR.delete(ticker)
      if (this.wsKR?.readyState === WebSocket.OPEN) {
        this.sendUnsubscribe(this.wsKR, ticker, 'KR')
      }
    } else {
      this.subscribedTickersUS.delete(ticker)
      if (this.wsUS?.readyState === WebSocket.OPEN) {
        this.sendUnsubscribe(this.wsUS, ticker, 'US')
      }
    }
    logger.info({ ticker, market }, '종목 구독 해제')
  }

  /**
   * 활성 전략의 감시 종목 합집합 로드 → 구독
   */
  async loadAndSubscribeWatchlist() {
    const supabase = getSupabase()

    const { data: watchItems } = await supabase
      .from('strategy_watchlist')
      .select('ticker, market, strategy_id')
      .eq('is_active', true)

    if (!watchItems || watchItems.length === 0) {
      logger.info('감시 종목 없음')
      return
    }

    // 활성 전략 ID 확인
    const { data: activeStrategies } = await supabase
      .from('investment_strategies')
      .select('id')
      .eq('is_active', true)

    const activeIds = new Set((activeStrategies || []).map(s => s.id))

    // 활성 전략의 감시 종목만 구독
    const krTickers = new Set<string>()
    const usTickers = new Set<string>()

    for (const item of watchItems) {
      if (!activeIds.has(item.strategy_id)) continue
      if (item.market === 'KR') krTickers.add(item.ticker)
      else if (item.market === 'US') usTickers.add(item.ticker)
    }

    for (const ticker of krTickers) this.subscribe(ticker, 'KR')
    for (const ticker of usTickers) this.subscribe(ticker, 'US')

    logger.info({ kr: krTickers.size, us: usTickers.size }, '감시 종목 구독 완료')
  }

  /**
   * 모든 연결 종료
   */
  async disconnect() {
    this.isRunning = false

    // 재연결 타이머 정리
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer)
    }
    this.reconnectTimers.clear()

    if (this.wsKR) {
      this.wsKR.close()
      this.wsKR = null
      logger.info('국내 WebSocket 해제')
    }
    if (this.wsUS) {
      this.wsUS.close()
      this.wsUS = null
      logger.info('미국 WebSocket 해제')
    }
  }

  // ============================================
  // 내부 메서드
  // ============================================

  private sendSubscribe(ws: WebSocket, ticker: string, market: 'KR' | 'US') {
    const approvalKey = market === 'KR' ? this.approvalKeyKR : this.approvalKeyUS
    if (!approvalKey) return

    // 국내: H0STCNT0 (실시간 체결가)
    const trId = market === 'KR' ? 'H0STCNT0' : 'HDFSCNT0'

    const msg = JSON.stringify({
      header: {
        approval_key: approvalKey,
        custtype: 'P',
        tr_type: '1', // 1=등록
        'content-type': 'utf-8',
      },
      body: {
        input: {
          tr_id: trId,
          tr_key: ticker,
        },
      },
    })

    ws.send(msg)
    logger.debug({ ticker, market, trId }, 'WebSocket 구독 전송')
  }

  private sendUnsubscribe(ws: WebSocket, ticker: string, market: 'KR' | 'US') {
    const approvalKey = market === 'KR' ? this.approvalKeyKR : this.approvalKeyUS
    if (!approvalKey) return

    const trId = market === 'KR' ? 'H0STCNT0' : 'HDFSCNT0'

    const msg = JSON.stringify({
      header: {
        approval_key: approvalKey,
        custtype: 'P',
        tr_type: '2', // 2=해제
        'content-type': 'utf-8',
      },
      body: {
        input: {
          tr_id: trId,
          tr_key: ticker,
        },
      },
    })

    ws.send(msg)
  }

  private handleMessage(raw: string, market: 'KR' | 'US') {
    try {
      // KIS는 JSON 또는 파이프(|) 구분 데이터를 보냄
      if (raw.startsWith('{')) {
        // JSON 응답 (PINGPONG, 구독 확인 등)
        const json = JSON.parse(raw)

        // PINGPONG 응답
        if (json.header?.tr_id === 'PINGPONG') {
          const ws = market === 'KR' ? this.wsKR : this.wsUS
          ws?.send(raw) // 그대로 회신
          return
        }

        logger.debug({ market, trId: json.header?.tr_id }, 'WebSocket JSON 수신')
        return
      }

      // 파이프(|) 구분 데이터 (실시간 체결가)
      const parts = raw.split('|')
      if (parts.length < 4) return

      const dataStr = parts[3]
      const fields = dataStr.split('^')

      // 국내: H0STCNT0 데이터 형식
      // fields[0] = 종목코드, fields[2] = 체결가, fields[12] = 체결량
      if (market === 'KR' && fields.length > 12) {
        const tickData: KISTickData = {
          ticker: fields[0],
          market: 'KR',
          price: parseFloat(fields[2]) || 0,
          volume: parseInt(fields[12]) || 0,
          timestamp: new Date().toISOString(),
        }

        if (tickData.price > 0) {
          for (const handler of this.tickHandlers) {
            try { handler(tickData) } catch (e) {
              logger.error({ err: e, ticker: tickData.ticker }, '틱 핸들러 오류')
            }
          }
        }
      }

      // 미국: HDFSCNT0 데이터 형식
      if (market === 'US' && fields.length > 5) {
        const tickData: KISTickData = {
          ticker: fields[0],
          market: 'US',
          price: parseFloat(fields[2]) || 0,
          volume: parseInt(fields[5]) || 0,
          timestamp: new Date().toISOString(),
        }

        if (tickData.price > 0) {
          for (const handler of this.tickHandlers) {
            try { handler(tickData) } catch (e) {
              logger.error({ err: e, ticker: tickData.ticker }, '틱 핸들러 오류')
            }
          }
        }
      }
    } catch (err) {
      logger.error({ err, market }, 'WebSocket 메시지 파싱 오류')
    }
  }

  private scheduleReconnect(market: 'KR' | 'US') {
    if (!this.isRunning) return

    // 기존 타이머 취소
    const existing = this.reconnectTimers.get(market)
    if (existing) clearTimeout(existing)

    // 5초 후 재연결
    const timer = setTimeout(async () => {
      logger.info({ market }, 'WebSocket 재연결 시도...')
      try {
        if (market === 'KR' && this.approvalKeyKR) {
          await this.connectKR(this.approvalKeyKR)
        } else if (market === 'US' && this.approvalKeyUS) {
          await this.connectUS(this.approvalKeyUS)
        }
      } catch (err) {
        logger.error({ err, market }, 'WebSocket 재연결 실패')
        // 다시 스케줄
        this.scheduleReconnect(market)
      }
    }, 5000)

    this.reconnectTimers.set(market, timer)
  }
}

// 싱글톤 인스턴스
export const kisWebSocket = new KISWebSocketManager()
