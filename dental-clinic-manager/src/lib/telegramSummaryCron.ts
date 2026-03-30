// 텔레그램 요약 크론 핵심 로직
import { SupabaseClient } from '@supabase/supabase-js'
import { generateDailySummary } from '@/lib/telegramSummaryService'
import { sendSummaryNotification } from '@/lib/telegramBotService'
import { classifyAndAssignCategory } from '@/lib/telegramCategoryService'

export type SummaryResult = {
  group_id: string
  group_title: string
  date: string
  status: 'skipped' | 'success' | 'error'
  reason?: string
  messageCount?: number
  topicCount?: number
}

function kstDateToUtcRange(kstDate: string): { start: string; end: string } {
  return {
    start: new Date(`${kstDate}T00:00:00+09:00`).toISOString(),
    end: new Date(`${kstDate}T23:59:59+09:00`).toISOString(),
  }
}

/** 텔레그램 요약 실행 — 미요약 메시지를 날짜별로 처리 (최대 7일) */
export async function runTelegramSummary(supabase: SupabaseClient): Promise<SummaryResult[]> {
  const results: SummaryResult[] = []
  const kstOffsetMs = 9 * 60 * 60 * 1000

  // 요약 대상 그룹 조회
  const { data: groups, error: groupsError } = await supabase
    .from('telegram_groups')
    .select('id, chat_title, telegram_chat_id, board_slug')
    .eq('is_active', true)
    .eq('summary_enabled', true)

  if (groupsError) throw new Error(groupsError.message)
  if (!groups || groups.length === 0) return results

  // KST 오늘 날짜
  const nowKst = new Date(Date.now() + kstOffsetMs)
  const todayKst = nowKst.toISOString().slice(0, 10)
  const todayRange = kstDateToUtcRange(todayKst)

  // 최대 7일 전까지 미요약 메시지 처리
  const sevenDaysAgo = new Date(Date.now() + kstOffsetMs - 7 * 24 * 60 * 60 * 1000)
  const minDate = sevenDaysAgo.toISOString().slice(0, 10)
  const minRange = kstDateToUtcRange(minDate)

  for (const group of groups) {
    try {
      const { data: allMessages, error: messagesError } = await supabase
        .from('telegram_messages')
        .select('id, sender_name, message_text, message_type, telegram_date')
        .eq('telegram_group_id', group.id)
        .eq('is_summarized', false)
        .gte('telegram_date', minRange.start)
        .lte('telegram_date', todayRange.end)
        .order('telegram_date', { ascending: true })

      if (messagesError) {
        results.push({ group_id: group.id, group_title: group.chat_title, date: todayKst, status: 'error', reason: messagesError.message })
        continue
      }

      if (!allMessages || allMessages.length === 0) {
        results.push({ group_id: group.id, group_title: group.chat_title, date: todayKst, status: 'skipped', reason: '미요약 메시지 없음' })
        continue
      }

      // KST 날짜별 그룹핑
      const byDate = new Map<string, typeof allMessages>()
      for (const msg of allMessages) {
        const msgKst = new Date(new Date(msg.telegram_date).getTime() + kstOffsetMs)
        const dateKey = msgKst.toISOString().slice(0, 10)
        if (!byDate.has(dateKey)) byDate.set(dateKey, [])
        byDate.get(dateKey)!.push(msg)
      }

      // 오래된 날짜부터 처리
      const sortedDates = [...byDate.keys()].sort()

      for (const dateKey of sortedDates) {
        const messages = byDate.get(dateKey)!

        if (messages.length < 3) {
          results.push({ group_id: group.id, group_title: group.chat_title, date: dateKey, status: 'skipped', reason: `메시지 수 부족 (${messages.length}개)` })
          // 3개 미만이어도 is_summarized 마킹 (재처리 방지)
          await supabase
            .from('telegram_messages')
            .update({ is_summarized: true })
            .in('id', messages.map(m => m.id))
          continue
        }

        // AI 요약 생성
        const summary = await generateDailySummary(messages, group.chat_title, dateKey)

        // 게시글 저장
        const sourceMessageIds = messages.map(m => m.id)
        const { data: insertedPost, error: insertError } = await supabase
          .from('telegram_board_posts')
          .insert({
            telegram_group_id: group.id,
            post_type: 'summary',
            title: summary.title,
            content: summary.content,
            summary_date: dateKey,
            source_message_ids: sourceMessageIds,
            ai_model: 'gemini-2.5-flash',
            telegram_sender_name: 'AI 요약',
          })
          .select('id')
          .single()

        if (insertError) {
          results.push({ group_id: group.id, group_title: group.chat_title, date: dateKey, status: 'error', reason: `포스트 저장 실패: ${insertError.message}` })
          continue
        }

        // AI 카테고리 자동 분류
        if (insertedPost?.id) {
          try {
            await classifyAndAssignCategory(supabase, insertedPost.id, summary.title, summary.content, group.id)
          } catch (classifyErr) {
            console.error(`[Telegram Summary] Classify failed for post ${insertedPost.id}:`, classifyErr)
          }
        }

        // 메시지 요약 완료 처리
        await supabase
          .from('telegram_messages')
          .update({ is_summarized: true })
          .in('id', sourceMessageIds)

        // 그룹 last_sync_at 업데이트
        await supabase
          .from('telegram_groups')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', group.id)

        // 텔레그램 알림 (오늘 요약만)
        if (dateKey === todayKst && group.telegram_chat_id && group.board_slug) {
          try {
            await sendSummaryNotification(group.telegram_chat_id, group.chat_title, dateKey, group.board_slug)
          } catch (notifyError) {
            console.error(`[Telegram Summary] Notification failed for group ${group.id}:`, notifyError)
          }
        }

        results.push({
          group_id: group.id,
          group_title: group.chat_title,
          date: dateKey,
          status: 'success',
          messageCount: summary.messageCount,
          topicCount: summary.topicCount,
        })
      }
    } catch (groupError) {
      results.push({
        group_id: group.id,
        group_title: group.chat_title,
        date: todayKst,
        status: 'error',
        reason: groupError instanceof Error ? groupError.message : 'Unknown error',
      })
    }
  }

  return results
}
