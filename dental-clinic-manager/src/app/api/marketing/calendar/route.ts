import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateCalendar, type CalendarRequest } from '@/lib/marketing/calendar-generator';

// 캘린더 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabase
      .from('content_calendars')
      .select(`
        *,
        content_calendar_items(*)
      `)
      .eq('clinic_id', userData.clinic_id)
      .order('period_start', { ascending: false })
      .limit(10);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;

    // 발행됨 상태 항목의 최신 metrics 일괄 조회 → 카드별 매핑
    type CalendarRow = { id: string; content_calendar_items?: { id: string; status: string }[] };
    const calendarRows = (data as unknown as CalendarRow[] | null) || [];
    const allItemIds = calendarRows
      .flatMap((c) => c.content_calendar_items || [])
      .filter((i) => i.status === 'published')
      .map((i) => i.id);

    let metricsMap: Record<string, {
      platform: string; views: number | null; comments: number | null;
      likes: number | null; scraps: number | null; measured_at: string;
    }[]> = {};
    if (allItemIds.length > 0) {
      const { data: metricsRows } = await supabase
        .from('content_post_metrics_latest')
        .select('*')
        .in('item_id', allItemIds);

      metricsMap = (metricsRows || []).reduce((acc, m) => {
        const id = m.item_id as string;
        if (!acc[id]) acc[id] = [];
        acc[id].push({
          platform: m.platform as string,
          views: m.views as number | null,
          comments: m.comments as number | null,
          likes: m.likes as number | null,
          scraps: m.scraps as number | null,
          measured_at: m.measured_at as string,
        });
        return acc;
      }, {} as typeof metricsMap);
    }

    // 각 캘린더의 항목에 metrics 부착
    const enriched = calendarRows.map((cal) => ({
      ...cal,
      content_calendar_items: (cal.content_calendar_items || []).map((it) => ({
        ...it,
        metrics: metricsMap[it.id] || [],
      })),
    }));

    return NextResponse.json({ data: enriched });
  } catch (error) {
    console.error('[API] calendar GET:', error);
    return NextResponse.json({ error: '캘린더 조회 실패' }, { status: 500 });
  }
}

// AI 캘린더 생성 요청
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const calendarRequest: CalendarRequest = {
      period: body.period || 'weekly',
      startDate: body.startDate || new Date().toISOString().split('T')[0],
      postsPerWeek: body.postsPerWeek || 5,
      ratio: body.ratio || { informational: 60, promotional: 30, clinical: 10 },
      focusKeywords: body.focusKeywords,
      excludeKeywords: body.excludeKeywords,
      skipWeekends: body.skipWeekends ?? true,
    };

    const result = await generateCalendar(userData.clinic_id, user.id, calendarRequest);

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    console.error('[API] calendar POST:', error);
    const message = error instanceof Error ? error.message : '캘린더 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
