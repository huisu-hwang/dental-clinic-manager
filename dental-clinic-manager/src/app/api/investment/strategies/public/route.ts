/**
 * 공개 공유 전략 목록 (간단 메타)
 *
 * GET /api/investment/strategies/public
 *
 * 매트릭스 페이지의 전략 선택 칩 표시용. 인증 필요하지만 다른 사용자가 공유한 전략까지 노출.
 * 통계/랭킹은 `/api/investment/strategies/rankings` 사용.
 *
 * 응답: { data: Array<{ id, name, share_alias }> }
 */

import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { getSupabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  const supabase = getSupabaseAdmin()
  if (!supabase) {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('investment_strategies')
    .select('id, name, share_alias')
    .eq('is_shared', true)
    .order('shared_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data: data ?? [] })
}
