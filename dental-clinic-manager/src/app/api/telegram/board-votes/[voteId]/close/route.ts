/**
 * Telegram Board Vote Close API
 * POST /api/telegram/board-votes/[voteId]/close - 투표 종료
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ voteId: string }> }
) {
  try {
    const { voteId } = await context.params
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const body = await request.json()
    const { userId } = body

    if (!userId) {
      return NextResponse.json({ data: null, error: '사용자 ID가 필요합니다.' }, { status: 400 })
    }

    // RPC 호출로 투표 종료
    const { data, error } = await supabase
      .rpc('close_contribution_vote', {
        p_vote_id: voteId,
        p_user_id: userId,
      })

    if (error) {
      console.error('[POST /api/telegram/board-votes/[voteId]/close] RPC error:', error)
      return NextResponse.json({ data: null, error: error.message }, { status: 500 })
    }

    const result = data as any
    if (!result.success) {
      return NextResponse.json({ data: null, error: result.error }, { status: 400 })
    }

    return NextResponse.json({ data: null, error: null })
  } catch (error) {
    console.error('[POST /api/telegram/board-votes/[voteId]/close] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
