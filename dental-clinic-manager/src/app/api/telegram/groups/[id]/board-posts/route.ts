/**
 * Telegram Board Posts API (그룹 단위)
 * POST /api/telegram/groups/[id]/board-posts - 글 작성 + 텔레그램 알림
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { sendMessageToGroup } from '@/lib/telegramBotService'

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
    const { userId, title, content, notifyTelegram, fileUrls } = body

    if (!userId || !title || !content) {
      return NextResponse.json({ data: null, error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    // 사용자 확인
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('id', userId)
      .maybeSingle()

    if (userError || !user) {
      return NextResponse.json({ data: null, error: '사용자를 찾을 수 없습니다.' }, { status: 404 })
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

    // 게시글 저장
    const { data: post, error: postError } = await supabase
      .from('telegram_board_posts')
      .insert({
        telegram_group_id: groupId,
        post_type: 'general',
        title,
        content,
        created_by: userId,
        source_message_ids: [],
        file_urls: fileUrls || [],
        link_urls: [],
      })
      .select()
      .single()

    if (postError) {
      console.error('[POST /api/telegram/groups/[id]/board-posts] Insert error:', postError)
      return NextResponse.json({ data: null, error: postError.message }, { status: 500 })
    }

    // 텔레그램 알림 전송 (옵션)
    if (notifyTelegram && group.telegram_chat_id && group.board_slug) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
        const postUrl = `${appUrl}/community/telegram/${group.board_slug}?postId=${post.id}`

        const message = [
          `<b>[새 글] ${group.board_title}</b>`,
          '',
          `<b>${title}</b>`,
          `작성자: ${user.name || '익명'}`,
          '',
          `<a href="${postUrl}">글 바로가기</a>`,
        ].join('\n')

        await sendMessageToGroup(group.telegram_chat_id, message, 'HTML')
      } catch (notifyError) {
        console.error('[board-posts] Telegram notification failed:', notifyError)
      }
    }

    return NextResponse.json({ data: post, error: null })
  } catch (error) {
    console.error('[POST /api/telegram/groups/[id]/board-posts] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
