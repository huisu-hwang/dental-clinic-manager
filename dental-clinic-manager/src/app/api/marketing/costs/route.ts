import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 기간별 비용 집계
// GET /api/marketing/costs?period=day|week|month&date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
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

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'day';
    const dateParam = searchParams.get('date') || new Date().toISOString().split('T')[0];

    // 환율 조회
    const { data: exchangeRateRow } = await supabase
      .from('marketing_cost_settings')
      .select('usd_to_krw')
      .eq('clinic_id', userData.clinic_id)
      .eq('model', 'exchange_rate')
      .single();

    const exchangeRate = exchangeRateRow?.usd_to_krw ?? 1380;

    // 기간 범위 계산
    const date = new Date(dateParam);
    let startDate: string;
    let endDate: string;

    if (period === 'day') {
      startDate = dateParam;
      endDate = dateParam;
    } else if (period === 'week') {
      // 해당 날짜가 속한 주의 월요일~일요일
      const day = date.getDay(); // 0=일, 1=월 ...
      const diffToMonday = day === 0 ? -6 : 1 - day;
      const monday = new Date(date);
      monday.setDate(date.getDate() + diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      startDate = monday.toISOString().split('T')[0];
      endDate = sunday.toISOString().split('T')[0];
    } else {
      // month
      const year = date.getFullYear();
      const month = date.getMonth();
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);
      startDate = firstDay.toISOString().split('T')[0];
      endDate = lastDay.toISOString().split('T')[0];
    }

    // master_admin은 모든 클리닉 데이터 조회
    let query = supabase
      .from('marketing_api_usage')
      .select('cost_usd, created_at')
      .gte('created_at', `${startDate}T00:00:00.000Z`)
      .lte('created_at', `${endDate}T23:59:59.999Z`)
      .order('created_at', { ascending: true });

    const { data: rows, error: queryError } = await query;
    if (queryError) throw queryError;

    // 집계: 날짜별 breakdown
    const breakdownMap: Record<string, { costUsd: number; callCount: number }> = {};

    for (const row of rows ?? []) {
      const rowDate = new Date(row.created_at).toISOString().split('T')[0];
      if (!breakdownMap[rowDate]) {
        breakdownMap[rowDate] = { costUsd: 0, callCount: 0 };
      }
      breakdownMap[rowDate].costUsd += Number(row.cost_usd) || 0;
      breakdownMap[rowDate].callCount += 1;
    }

    const breakdown = Object.entries(breakdownMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { costUsd, callCount }]) => ({
        date,
        costUsd,
        costKrw: costUsd * exchangeRate,
        callCount,
      }));

    const totalCostUsd = breakdown.reduce((sum, b) => sum + b.costUsd, 0);

    return NextResponse.json({
      totalCostUsd,
      totalCostKrw: totalCostUsd * exchangeRate,
      breakdown,
      exchangeRate,
    });
  } catch (error) {
    console.error('[API] marketing/costs GET:', error);
    return NextResponse.json({ error: '비용 조회 실패' }, { status: 500 });
  }
}
