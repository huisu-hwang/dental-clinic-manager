/**
 * Telegram Bot API 서버 전용 유틸리티
 * AI 일일 요약 생성 후 텔레그램 그룹에 알림 전송
 */

const TELEGRAM_API_BASE = 'https://api.telegram.org'

interface SendMessageResult {
  success: boolean
  error?: string
}

/**
 * 텔레그램 그룹에 메시지 전송
 * @param chatId 텔레그램 채팅 ID (음수: 그룹)
 * @param text 전송할 메시지 텍스트
 * @param parseMode 파싱 모드 (기본: HTML)
 */
export async function sendMessageToGroup(
  chatId: number,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<SendMessageResult> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    console.warn('[telegramBotService] TELEGRAM_BOT_TOKEN not configured, skipping message send')
    return { success: false, error: 'TELEGRAM_BOT_TOKEN not configured' }
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    })

    const result = await response.json()

    if (!response.ok || !result.ok) {
      const errorMsg = result.description || `HTTP ${response.status}`
      console.error('[telegramBotService] sendMessage failed:', errorMsg)
      return { success: false, error: errorMsg }
    }

    return { success: true }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[telegramBotService] sendMessage error:', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/**
 * AI 일일 요약 알림 메시지를 텔레그램 그룹에 전송
 * @param chatId 텔레그램 채팅 ID
 * @param groupTitle 그룹 이름
 * @param summaryDate 요약 날짜 (YYYY-MM-DD)
 * @param boardSlug 게시판 슬러그
 */
/**
 * 텔레그램 봇의 username 조회 (봇 추가 링크 생성용)
 */
export async function getBotUsername(): Promise<{ username: string | null; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  if (!botToken) {
    return { username: null, error: 'TELEGRAM_BOT_TOKEN not configured' }
  }

  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken}/getMe`)
    const result = await response.json()

    if (!response.ok || !result.ok) {
      return { username: null, error: result.description || `HTTP ${response.status}` }
    }

    return { username: result.result.username }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error'
    return { username: null, error: errorMsg }
  }
}

export async function sendSummaryNotification(
  chatId: number,
  groupTitle: string,
  summaryDate: string,
  boardSlug: string
): Promise<SendMessageResult> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://hi-clinic.co.kr'
  const boardUrl = `${appUrl}/dashboard/community/telegram/${boardSlug}`

  const message = [
    `📋 <b>[일일 요약] ${groupTitle} - ${summaryDate}</b>`,
    '',
    '오늘의 대화가 정리되었습니다.',
    `👉 <a href="${boardUrl}">요약 보러가기</a>`,
  ].join('\n')

  return sendMessageToGroup(chatId, message, 'HTML')
}
