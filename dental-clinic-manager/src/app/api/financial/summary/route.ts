// ============================================
// 재무 요약 API
// GET: 월별/연간 재무 요약 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 재무 요약 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!clinicId || !year) {
      return NextResponse.json({ error: 'clinicId와 year가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // 월별 조회
    if (month) {
      const { data, error } = await supabase
        .from('financial_summary_view')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('year', parseInt(year))
        .eq('month', parseInt(month))
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching financial summary:', error);
        return NextResponse.json({ error: '재무 요약 조회에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    // 연간 조회
    const { data, error } = await supabase
      .from('financial_summary_view')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('year', parseInt(year))
      .order('month', { ascending: true });

    if (error) {
      console.error('Error fetching annual financial summary:', error);
      return NextResponse.json({ error: '연간 재무 요약 조회에 실패했습니다.' }, { status: 500 });
    }

    // 연간 합계 계산
    const months = data || [];
    const initialTotals = {
      total_revenue: 0,
      total_expense: 0,
      total_tax: 0,
      pre_tax_profit: 0,
      post_tax_profit: 0,
    };

    const totals = months.reduce(
      (acc: typeof initialTotals, m: Record<string, number | null>) => ({
        total_revenue: acc.total_revenue + (m.total_revenue || 0),
        total_expense: acc.total_expense + (m.total_expense || 0),
        total_tax: acc.total_tax + (m.actual_tax_paid || 0),
        pre_tax_profit: acc.pre_tax_profit + (m.pre_tax_profit || 0),
        post_tax_profit: acc.post_tax_profit + (m.post_tax_profit || 0),
      }),
      initialTotals
    );

    const monthCount = months.length || 1;

    return NextResponse.json({
      success: true,
      data: {
        clinic_id: clinicId,
        year: parseInt(year),
        months,
        totals: {
          ...totals,
          average_monthly_revenue: Math.round(totals.total_revenue / monthCount),
          average_monthly_expense: Math.round(totals.total_expense / monthCount),
          average_profit_margin:
            totals.total_revenue > 0
              ? Math.round(((totals.pre_tax_profit / totals.total_revenue) * 100) * 100) / 100
              : 0,
        },
      },
    });
  } catch (error) {
    console.error('Unexpected error in GET /api/financial/summary:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
