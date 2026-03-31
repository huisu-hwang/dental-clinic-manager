import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 특정 세션의 API 호출 상세
// GET /api/marketing/costs/sessions/:sessionId
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 403 });
    }

    if (userData.role !== 'master_admin') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    // 환율 조회
    const { data: exchangeRateRow } = await supabase
      .from('marketing_cost_settings')
      .select('usd_to_krw')
      .eq('clinic_id', userData.clinic_id)
      .eq('model', 'exchange_rate')
      .single();

    const exchangeRate = exchangeRateRow?.usd_to_krw ?? 1380;

    const { data: calls, error: queryError } = await supabase
      .from('marketing_api_usage')
      .select('*')
      .eq('generation_session_id', sessionId)
      .order('created_at', { ascending: true });

    if (queryError) throw queryError;

    const totalCostUsd = (calls ?? []).reduce((sum, c) => sum + (Number(c.cost_usd) || 0), 0);

    return NextResponse.json({
      calls: calls ?? [],
      totalCostUsd,
      totalCostKrw: totalCostUsd * exchangeRate,
      exchangeRate,
    });
  } catch (error) {
    console.error('[API] marketing/costs/sessions/[sessionId] GET:', error);
    return NextResponse.json({ error: '세션 상세 조회 실패' }, { status: 500 });
  }
}
