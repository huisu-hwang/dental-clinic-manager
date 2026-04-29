/**
 * Telegram 알림 서비스
 *
 * 읽기 전용 알림 채널 (주문 실행 기능 없음)
 *
 * Level 1: 신호 감지 알림 (종목, 조건, 방향)
 * Level 2: 체결 결과 보고 (종목, 수량, 체결가, 손익)
 * 긴급: 서버 장애, 계좌 오류, 리스크 한도 도달
 *
 * 보안: 알림에 계좌번호/API 키 미포함 (공개 정보만)
 */

import { logger } from './logger'
import { getSupabase } from './supabaseClient'

const TELEGRAM_API = 'https://api.telegram.org/bot'

interface SignalAlertData {
  type: 'buy_signal' | 'sell_signal' | 'stop_loss' | 'take_profit'
  strategyName: string
  ticker: string
  market: string
  pnlPercent?: string
  currentPrice?: number
}

interface OrderResultData {
  ticker: string
  market: string
  orderType: 'buy' | 'sell'
  quantity: number
  executedPrice: number
  pnl?: number
}

/**
 * 신호 알림 발송 (Level 1)
 */
export async function sendSignalAlert(userId: string, data: SignalAlertData) {
  const chatId = await getUserTelegramChatId(userId)
  if (!chatId) {
    logger.warn({ userId }, 'Telegram chatId 없음 - 알림 건너뜀')
    return
  }

  const typeLabels: Record<string, string> = {
    buy_signal: '매수 신호',
    sell_signal: '매도 신호',
    stop_loss: '손절 신호',
    take_profit: '익절 신호',
  }

  const emoji: Record<string, string> = {
    buy_signal: '📈',
    sell_signal: '📉',
    stop_loss: '🔴',
    take_profit: '🟢',
  }

  const marketLabel = data.market === 'KR' ? '국내' : '미국'

  let message = `${emoji[data.type] || '📊'} ${typeLabels[data.type] || data.type}\n\n`
  message += `전략: ${data.strategyName}\n`
  message += `종목: ${data.ticker} (${marketLabel})\n`

  if (data.currentPrice) {
    message += `현재가: ${data.currentPrice.toLocaleString()}\n`
  }
  if (data.pnlPercent) {
    message += `손익: ${data.pnlPercent}%\n`
  }

  message += `\n시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`

  await sendTelegramMessage(chatId, message)
}

/**
 * 체결 결과 보고 (Level 2)
 */
export async function sendOrderResult(userId: string, data: OrderResultData) {
  const chatId = await getUserTelegramChatId(userId)
  if (!chatId) return

  const emoji = data.orderType === 'buy' ? '🔵' : '🔴'
  const typeLabel = data.orderType === 'buy' ? '매수' : '매도'
  const marketLabel = data.market === 'KR' ? '국내' : '미국'

  let message = `${emoji} ${typeLabel} 체결\n\n`
  message += `종목: ${data.ticker} (${marketLabel})\n`
  message += `수량: ${data.quantity}주\n`
  message += `체결가: ${data.executedPrice.toLocaleString()}\n`

  if (data.pnl !== undefined) {
    const pnlEmoji = data.pnl >= 0 ? '📈' : '📉'
    message += `손익: ${pnlEmoji} ${data.pnl >= 0 ? '+' : ''}${data.pnl.toLocaleString()}원\n`
  }

  message += `\n시간: ${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`

  await sendTelegramMessage(chatId, message)
}

/**
 * 사용자별 시스템 공지 (간단한 free-text).
 * RL 신호처럼 구조화된 알림이 아닌 경우에 사용.
 */
export async function sendSystemNotice(userId: string, text: string): Promise<void> {
  const chatId = await getUserTelegramChatId(userId)
  if (!chatId) {
    logger.warn({ userId }, 'Telegram chatId 없음 - 시스템 공지 건너뜀')
    return
  }
  await sendTelegramMessage(chatId, text)
}

/**
 * 시스템 경보 (긴급)
 */
export async function sendSystemAlert(message: string) {
  // 모든 활성 사용자에게 보내거나, 관리자 chatId로 전송
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID
  if (adminChatId) {
    await sendTelegramMessage(adminChatId, `⚠️ 시스템 경보\n\n${message}`)
  }
  logger.warn({ message }, '시스템 경보 발송')
}

// ============================================
// 내부 함수
// ============================================

async function getUserTelegramChatId(userId: string): Promise<string | null> {
  const supabase = getSupabase()

  // users 테이블에 telegram_chat_id 필드가 있다고 가정
  // 없으면 null 반환 (알림 건너뜀)
  const { data } = await supabase
    .from('users')
    .select('telegram_chat_id')
    .eq('id', userId)
    .single()

  return (data as Record<string, unknown>)?.telegram_chat_id as string | null
}

async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN 미설정')
    return
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      logger.error({ chatId, error }, 'Telegram 메시지 전송 실패')
    }
  } catch (err) {
    logger.error({ err, chatId }, 'Telegram API 호출 실패')
  }
}
