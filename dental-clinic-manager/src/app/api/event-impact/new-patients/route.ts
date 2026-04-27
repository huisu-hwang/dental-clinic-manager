// ============================================
// 이벤트 효과 분석 - 일별 신환 수 조회 API
// GET: Supabase의 dentweb_patients.registration_date 기반으로 일별 신환 수 집계
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET /api/event-impact/new-patients?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: 'start_date, end_date 필수' },
        { status: 400 }
      );
    }

    // 날짜 형식 검증 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
      return NextResponse.json(
        { success: false, error: '날짜 형식이 올바르지 않습니다. (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    // 사용자 인증 (Supabase SSR 쿠키 기반)
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: '인증이 필요합니다.' },
        { status: 401 }
      );
    }

    // 사용자의 clinic_id 조회
    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json(
        { success: false, error: '클리닉 정보가 없습니다.' },
        { status: 403 }
      );
    }

    // dentweb_patients에서 registration_date 기간으로 조회 (페이지네이션으로 전체 가져오기)
    const PAGE_SIZE = 1000;
    const allRegistrations: Array<{ registration_date: string | null }> = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const { data: page, error } = await supabase
        .from('dentweb_patients')
        .select('registration_date')
        .eq('clinic_id', userData.clinic_id)
        .gte('registration_date', startDate)
        .lte('registration_date', endDate)
        .not('registration_date', 'is', null)
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        return NextResponse.json(
          { success: false, error: error.message },
          { status: 500 }
        );
      }

      if (!page || page.length === 0) break;
      allRegistrations.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    // 날짜별 집계
    const counts = new Map<string, number>();
    for (const p of allRegistrations) {
      if (!p.registration_date) continue;
      const dateStr = p.registration_date.slice(0, 10); // YYYY-MM-DD
      counts.set(dateStr, (counts.get(dateStr) || 0) + 1);
    }

    // 시작일~종료일 범위의 모든 날짜 채우기 (없는 날은 0)
    const data: Array<{ date: string; count: number }> = [];
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      data.push({ date: dateStr, count: counts.get(dateStr) || 0 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[event-impact/new-patients] Error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
