/**
 * User Search API
 * GET /api/users/search?q=검색어&groupId=그룹ID
 * - name 또는 email로 ILIKE 검색
 * - groupId 전달 시 해당 그룹 멤버는 결과에서 제외
 * - 최대 10명, 최소 2글자 이상
 * - 인증 필수 (x-user-id 헤더)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      return NextResponse.json({ error: 'Database connection failed' }, { status: 500 })
    }

    const userId = request.headers.get('x-user-id') || new URL(request.url).searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')?.trim() ?? ''
    const groupId = searchParams.get('groupId')

    // 최소 2글자
    if (query.length < 2) {
      return NextResponse.json({ data: [] })
    }

    const searchPattern = `%${query}%`

    if (groupId) {
      // 그룹 멤버 제외하여 검색
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
        .not('id', 'in',
          supabase
            .from('telegram_group_members')
            .select('user_id')
            .eq('telegram_group_id', groupId)
        )
        .limit(10)

      if (error) {
        // Supabase .not + subquery가 지원 안 될 수 있으므로 수동 필터 fallback
        console.warn('[GET /api/users/search] Subquery filter failed, using manual filter:', error.message)

        // 멤버 목록 조회
        const { data: members } = await supabase
          .from('telegram_group_members')
          .select('user_id')
          .eq('telegram_group_id', groupId)

        const memberIds = new Set((members || []).map((m: { user_id: string }) => m.user_id))

        // 사용자 검색
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, name, email')
          .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
          .limit(20)

        if (usersError) {
          return NextResponse.json({ error: usersError.message }, { status: 500 })
        }

        const filtered = (users || [])
          .filter((u: { id: string }) => !memberIds.has(u.id))
          .slice(0, 10)

        return NextResponse.json({ data: filtered })
      }

      return NextResponse.json({ data: data || [] })
    } else {
      // groupId 없으면 단순 검색
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email')
        .or(`name.ilike.${searchPattern},email.ilike.${searchPattern}`)
        .limit(10)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ data: data || [] })
    }
  } catch (error) {
    console.error('[GET /api/users/search] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
