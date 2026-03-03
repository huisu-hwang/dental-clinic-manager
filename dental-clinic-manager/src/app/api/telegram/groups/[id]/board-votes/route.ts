/**
 * Telegram Board Votes API (그룹 단위)
 * POST /api/telegram/groups/[id]/board-votes - 기여도 투표 생성
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
    const {
      userId,
      title,
      content,
      max_votes_per_person = 3,
      is_anonymous = true,
      show_top_n = null,
      result_visibility = 'after_vote',
      allow_self_vote = false,
      ends_at = null,
      notify_telegram = false,
    } = body

    if (!userId || !title) {
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

    // 1. 게시글 생성 (post_type='vote')
    const { data: post, error: postError } = await supabase
      .from('telegram_board_posts')
      .insert({
        telegram_group_id: groupId,
        post_type: 'vote',
        title,
        content: content || '',
        created_by: userId,
        source_message_ids: [],
        file_urls: [],
        link_urls: [],
      })
      .select()
      .single()

    if (postError) {
      console.error('[POST /api/telegram/groups/[id]/board-votes] Post insert error:', postError)
      return NextResponse.json({ data: null, error: postError.message }, { status: 500 })
    }

    // 2. 투표 세션 생성
    const { error: voteError } = await supabase
      .from('telegram_board_votes')
      .insert({
        post_id: post.id,
        telegram_group_id: groupId,
        max_votes_per_person,
        is_anonymous,
        show_top_n: show_top_n || null,
        result_visibility,
        allow_self_vote,
        ends_at: ends_at || null,
        created_by: userId,
      })

    if (voteError) {
      console.error('[POST /api/telegram/groups/[id]/board-votes] Vote insert error:', voteError)
      // 게시글 롤백
      await supabase.from('telegram_board_posts').delete().eq('id', post.id)
      return NextResponse.json({ data: null, error: voteError.message }, { status: 500 })
    }

    // 3. 텔레그램 알림 전송 (옵션)
    if (notify_telegram && (group as any).telegram_chat_id && (group as any).board_slug) {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin
        const postUrl = `${appUrl}/community/telegram/${(group as any).board_slug}?postId=${post.id}`

        const message = [
          `<b>[기여도 투표] ${(group as any).board_title}</b>`,
          '',
          `<b>${title}</b>`,
          `작성자: ${(user as any).name || '익명'}`,
          `1인당 ${max_votes_per_person}명 선택 가능`,
          '',
          `<a href="${postUrl}">투표하러 가기</a>`,
        ].join('\n')

        await sendMessageToGroup((group as any).telegram_chat_id, message, 'HTML')
      } catch (notifyError) {
        console.error('[board-votes] Telegram notification failed:', notifyError)
      }
    }

    return NextResponse.json({ data: post, error: null })
  } catch (error) {
    console.error('[POST /api/telegram/groups/[id]/board-votes] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
