/**
 * Telegram Board Post Comments API
 * GET  /api/telegram/board-posts/[postId]/comments - 댓글 목록
 * POST /api/telegram/board-posts/[postId]/comments - 댓글 작성
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'
import { getAuthenticatedUser } from '@/lib/apiAuth'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('telegram_board_comments')
      .select('*, user:users(name)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data, error: null })
  } catch (error) {
    console.error('[GET /api/telegram/board-posts/[postId]/comments] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ postId: string }> }
) {
  try {
    const { postId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const authUser = await getAuthenticatedUser()
    if (!authUser) {
      return NextResponse.json({ data: null, error: '인증이 필요합니다.' }, { status: 401 })
    }
    const userId = authUser.id

    const body = await request.json()
    const { content } = body

    if (!content) {
      return NextResponse.json({ data: null, error: '필수 항목이 누락되었습니다.' }, { status: 400 })
    }

    if (content.length > 5000) {
      return NextResponse.json({ data: null, error: '댓글은 5000자를 초과할 수 없습니다.' }, { status: 400 })
    }

    // 게시글 존재 확인
    const { data: post, error: postError } = await supabase
      .from('telegram_board_posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle()

    if (postError || !post) {
      return NextResponse.json({ data: null, error: '게시글을 찾을 수 없습니다.' }, { status: 404 })
    }

    // 댓글 저장
    const { data: comment, error: commentError } = await supabase
      .from('telegram_board_comments')
      .insert({
        post_id: postId,
        user_id: userId,
        content,
      })
      .select('*, user:users(name)')
      .single()

    if (commentError) {
      console.error('[POST /api/telegram/board-posts/[postId]/comments] Insert error:', commentError)
      return NextResponse.json({ data: null, error: commentError.message }, { status: 500 })
    }

    return NextResponse.json({ data: comment, error: null })
  } catch (error) {
    console.error('[POST /api/telegram/board-posts/[postId]/comments] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
