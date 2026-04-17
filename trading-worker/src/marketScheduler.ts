/**
 * 시장 스케줄러
 *
 * 장 시간에 맞춰 WebSocket 연결/해제 관리
 *
 * 국내: 09:00~15:30 KST (08:50 연결, 15:35 해제)
 * 미국: 23:30~06:00 KST 동절기 / 22:30~05:00 서머타임
 *
 * 장 외 시간: 워커 대기 모드
 */

import cron from 'node-cron'
import { logger } from './logger'
import { kisWebSocket } from './kisWebSocket'
import { getSupabase } from './supabaseClient'
import { decryptField } from './crypto'

let krOpenJob: cron.ScheduledTask | null = null
let krCloseJob: cron.ScheduledTask | null = null
let usOpenJob: cron.ScheduledTask | null = null
let usCloseJob: cron.ScheduledTask | null = null

/**
 * 시장 스케줄러 시작
 */
export function startMarketScheduler() {
  // 국내 장: 08:50 연결 준비, 15:35 해제
  krOpenJob = cron.schedule('50 8 * * 1-5', async () => {
    logger.info('국내 장 연결 준비')
    await connectMarket('KR')
  }, { timezone: 'Asia/Seoul' })

  krCloseJob = cron.schedule('35 15 * * 1-5', () => {
    logger.info('국내 장 종료 - 구독 해제')
    // 국내 WebSocket은 유지하되 구독 해제
  }, { timezone: 'Asia/Seoul' })

  // 미국 장: 22:20 / 23:20 연결 준비 (서머타임에 따라)
  // 간단히 22:20에 시작 (서머타임 기간에도 충분한 여유)
  usOpenJob = cron.schedule('20 22 * * 1-5', async () => {
    logger.info('미국 장 연결 준비')
    await connectMarket('US')
  }, { timezone: 'Asia/Seoul' })

  usCloseJob = cron.schedule('10 6 * * 2-6', () => {
    logger.info('미국 장 종료')
  }, { timezone: 'Asia/Seoul' })

  logger.info('시장 스케줄러 시작 완료')

  // 현재 장 시간이면 즉시 연결
  checkAndConnectNow()
}

/**
 * 시장 스케줄러 중지
 */
export async function stopMarketScheduler() {
  krOpenJob?.stop()
  krCloseJob?.stop()
  usOpenJob?.stop()
  usCloseJob?.stop()

  await kisWebSocket.disconnect()
  logger.info('시장 스케줄러 중지')
}

/**
 * 현재 시간이 장 시간이면 즉시 연결
 */
async function checkAndConnectNow() {
  const now = new Date()
  const kstHour = getKSTHour(now)
  const kstDay = getKSTDay(now)

  // 주말 체크
  if (kstDay === 0 || kstDay === 6) {
    logger.info('주말 - 대기 모드')
    return
  }

  // 국내 장 시간 (08:50 ~ 15:35)
  const kstMinutes = kstHour * 60 + getKSTMinutes(now)
  if (kstMinutes >= 530 && kstMinutes <= 935) { // 8:50 ~ 15:35
    logger.info('현재 국내 장 시간 - 즉시 연결')
    await connectMarket('KR')
  }

  // 미국 장 시간 (22:20 ~ 06:10 다음날)
  if (kstMinutes >= 1340 || kstMinutes <= 370) { // 22:20 ~ 06:10
    logger.info('현재 미국 장 시간 - 즉시 연결')
    await connectMarket('US')
  }
}

/**
 * 특정 시장에 연결
 */
async function connectMarket(market: 'KR' | 'US') {
  try {
    // 활성 credential 하나를 가져와서 승인키 발급
    const credential = await getActiveCredential()
    if (!credential) {
      logger.warn('활성 credential 없음 - WebSocket 연결 건너뜀')
      return
    }

    const approvalKey = await kisWebSocket.getApprovalKey(
      credential.appKey,
      credential.appSecret,
      credential.isPaper,
    )

    if (market === 'KR') {
      await kisWebSocket.connectKR(approvalKey)
    } else {
      await kisWebSocket.connectUS(approvalKey)
    }

    // 감시 종목 구독
    await kisWebSocket.loadAndSubscribeWatchlist()
  } catch (err) {
    logger.error({ err, market }, '시장 연결 실패')
  }
}

async function getActiveCredential(): Promise<{ appKey: string; appSecret: string; isPaper: boolean } | null> {
  const supabase = getSupabase()
  const { data } = await supabase
    .from('user_broker_credentials')
    .select('app_key_encrypted, app_secret_encrypted, is_paper_trading')
    .eq('is_active', true)
    .limit(1)
    .single()

  if (!data) return null

  try {
    return {
      appKey: decryptField(data.app_key_encrypted),
      appSecret: decryptField(data.app_secret_encrypted),
      isPaper: data.is_paper_trading,
    }
  } catch (err) {
    logger.error({ err }, 'Credential 복호화 실패')
    return null
  }
}

// KST 유틸
function getKSTHour(date: Date): number {
  return parseInt(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }))
}
function getKSTMinutes(date: Date): number {
  return parseInt(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul', minute: 'numeric' }))
}
function getKSTDay(date: Date): number {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getDay()
}
