/**
 * GET /api/telegram/groups/detected
 * 웹훅으로 자동 생성된 pending 그룹 조회 (딥 링크 플로우용)
 * - token 파라미터: link_token으로 특정 그룹 매칭
 * - token 없음: 최근 10분 내 생성된 pending 그룹 전체 조회
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ data: null, error: 'Database connection failed' }, { status: 500 })
    }

    const userId = request.headers.get('x-user-id') || new URL(request.url).searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ data: null, error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const token = new URL(request.url).searchParams.get('token')

    if (token) {
      // link_token으로 특정 그룹 매칭
      const { data, error } = await supabase
        .from('telegram_groups')
        .select('id, telegram_chat_id, chat_title, chat_type, created_at')
        .eq('link_token', token)
        .like('board_slug', 'pending_%')
        .order('created_at', { ascending: false })
        .limit(1)

      if (error) {
        console.error('[GET /api/telegram/groups/detected] DB error:', error)
        return NextResponse.json({ data: null, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [], error: null })
    } else {
      // 최근 10분 내 생성된 pending 그룹
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()

      const { data, error } = await supabase
        .from('telegram_groups')
        .select('id, telegram_chat_id, chat_title, chat_type, created_at')
        .like('board_slug', 'pending_%')
        .gte('created_at', tenMinutesAgo)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[GET /api/telegram/groups/detected] DB error:', error)
        return NextResponse.json({ data: null, error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [], error: null })
    }
  } catch (error) {
    console.error('[GET /api/telegram/groups/detected] Error:', error)
    return NextResponse.json(
      { data: null, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
