/**
 * Telegram Trigger Summary API
 * POST /api/telegram/groups/[id]/trigger-summary - 일일 요약 수동 생성 (master_admin 전용)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { generateDailySummary } from '@/lib/telegramSummaryService'

async function checkMasterAdmin(userId: string | null): Promise<boolean> {
  if (!userId) return false
  const supabase = getSupabaseAdmin()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return false
  return data.role === 'master_admin'
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: groupId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId, summaryDate } = body

    const isAdmin = await checkMasterAdmin(userId)
    if (!isAdmin) {
      return NextResponse.json({ data: null, error: '권한이 없습니다.' }, { status: 403 })
    }

    // 그룹 정보 조회
    const { data: group, error: groupError } = await supabase
      .from('telegram_groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()

    if (groupError || !group) {
      return NextResponse.json({ data: null, error: '그룹을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 요약 대상 날짜 결정 (기본: 오늘)
    const targetDate = summaryDate || new Date().toISOString().split('T')[0]
    const startOfDay = `${targetDate}T00:00:00.000Z`
    const endOfDay = `${targetDate}T23:59:59.999Z`

    // 해당 날짜 메시지 조회
    const { data: messages, error: msgError } = await supabase
      .from('telegram_messages')
      .select('sender_name, message_text, message_type, telegram_date')
      .eq('telegram_group_id', groupId)
      .gte('telegram_date', startOfDay)
      .lte('telegram_date', endOfDay)
      .not('message_text', 'is', null)
      .order('telegram_date', { ascending: true })

    if (msgError) {
      console.error('[POST /api/telegram/groups/[id]/trigger-summary] Messages error:', msgError)
      return NextResponse.json({ data: null, error: msgError.message }, { status: 500 })
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { data: null, error: `${targetDate}에 요약할 메시지가 없습니다.` },
        { status: 400 }
      )
    }

    // AI 요약 생성
    const summary = await generateDailySummary(messages, group.chat_title, targetDate)

    // 게시글로 저장
    const { data: post, error: postError } = await supabase
      .from('telegram_board_posts')
      .insert({
        telegram_group_id: groupId,
        post_type: 'summary',
        title: summary.title,
        content: summary.content,
        summary_date: targetDate,
        source_message_ids: [],
        file_urls: [],
        link_urls: [],
        ai_model: 'gemini-2.0-flash',
      })
      .select()
      .single()

    if (postError) {
      console.error('[POST /api/telegram/groups/[id]/trigger-summary] Post insert error:', postError)
      return NextResponse.json({ data: null, error: postError.message }, { status: 500 })
    }

    // 메시지 is_summarized 업데이트
    await supabase
      .from('telegram_messages')
      .update({ is_summarized: true })
      .eq('telegram_group_id', groupId)
      .gte('telegram_date', startOfDay)
      .lte('telegram_date', endOfDay)

    return NextResponse.json({
      data: {
        post,
        messageCount: summary.messageCount,
        topicCount: summary.topicCount,
      },
      error: null,
    })
  } catch (error) {
    console.error('[POST /api/telegram/groups/[id]/trigger-summary] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
