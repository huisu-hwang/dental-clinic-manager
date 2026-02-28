// 텔레그램 메시지 일일 AI 요약 크론 잡
import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { generateDailySummary } from '@/lib/telegramSummaryService'

export const maxDuration = 60

function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

export async function GET(request: Request) {
  // Cron Secret 검증 (보안)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return NextResponse.json({
      success: false,
      error: 'Supabase configuration missing'
    }, { status: 500 })
  }

  try {
    // 요약 대상 그룹 조회 (활성 + 요약 활성화)
    const { data: groups, error: groupsError } = await supabase
      .from('telegram_groups')
      .select('id, title')
      .eq('is_active', true)
      .eq('summary_enabled', true)

    if (groupsError) {
      return NextResponse.json({
        success: false,
        error: groupsError.message
      }, { status: 500 })
    }

    if (!groups || groups.length === 0) {
      return NextResponse.json({
        success: true,
        message: '요약 대상 그룹 없음',
        results: []
      })
    }

    // KST 오늘 날짜 범위 계산 (UTC+9)
    const nowUtc = new Date()
    // KST 자정 = UTC 전날 15:00
    const kstOffsetMs = 9 * 60 * 60 * 1000
    const nowKst = new Date(nowUtc.getTime() + kstOffsetMs)
    const kstDateStr = nowKst.toISOString().slice(0, 10) // YYYY-MM-DD

    // KST 오늘 00:00:00 ~ 23:59:59 → UTC로 변환
    const kstStartUtc = new Date(`${kstDateStr}T00:00:00+09:00`)
    const kstEndUtc = new Date(`${kstDateStr}T23:59:59+09:00`)

    const results: {
      group_id: string
      group_title: string
      status: 'skipped' | 'success' | 'error'
      reason?: string
      messageCount?: number
      topicCount?: number
    }[] = []

    for (const group of groups) {
      try {
        // 미요약 메시지 조회 (오늘 KST 범위, 오름차순)
        const { data: messages, error: messagesError } = await supabase
          .from('telegram_messages')
          .select('id, sender_name, message_text, message_type, telegram_date')
          .eq('telegram_group_id', group.id)
          .eq('is_summarized', false)
          .gte('telegram_date', kstStartUtc.toISOString())
          .lte('telegram_date', kstEndUtc.toISOString())
          .order('telegram_date', { ascending: true })

        if (messagesError) {
          results.push({
            group_id: group.id,
            group_title: group.title,
            status: 'error',
            reason: messagesError.message
          })
          continue
        }

        if (!messages || messages.length < 3) {
          results.push({
            group_id: group.id,
            group_title: group.title,
            status: 'skipped',
            reason: `메시지 수 부족 (${messages?.length ?? 0}개)`
          })
          continue
        }

        // AI 요약 생성
        const summary = await generateDailySummary(messages, group.title, kstDateStr)

        // telegram_board_posts 에 삽입
        const sourceMessageIds = messages.map(m => m.id)
        const { error: insertError } = await supabase
          .from('telegram_board_posts')
          .insert({
            telegram_group_id: group.id,
            post_type: 'summary',
            title: summary.title,
            content: summary.content,
            summary_date: kstDateStr,
            source_message_ids: sourceMessageIds,
            ai_model: 'gemini-2.0-flash',
          })

        if (insertError) {
          results.push({
            group_id: group.id,
            group_title: group.title,
            status: 'error',
            reason: `포스트 저장 실패: ${insertError.message}`
          })
          continue
        }

        // 메시지 is_summarized = true 업데이트
        await supabase
          .from('telegram_messages')
          .update({ is_summarized: true })
          .in('id', sourceMessageIds)

        // 그룹 last_sync_at 업데이트
        await supabase
          .from('telegram_groups')
          .update({ last_sync_at: new Date().toISOString() })
          .eq('id', group.id)

        results.push({
          group_id: group.id,
          group_title: group.title,
          status: 'success',
          messageCount: summary.messageCount,
          topicCount: summary.topicCount
        })
      } catch (groupError) {
        results.push({
          group_id: group.id,
          group_title: group.title,
          status: 'error',
          reason: groupError instanceof Error ? groupError.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      summaryDate: kstDateStr,
      results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Cron Telegram Summary] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
