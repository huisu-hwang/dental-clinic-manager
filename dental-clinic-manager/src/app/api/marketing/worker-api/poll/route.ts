import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. 제어 신호 조회
    const { data: controlData } = await admin
      .from('marketing_worker_control')
      .select('start_requested, stop_requested')
      .eq('id', 'main')
      .single();

    // 2. 발행 대상 조회 (KST 기준)
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentDate = kst.toISOString().split('T')[0];
    const currentTime = kst.toISOString().split('T')[1].slice(0, 5);

    // 2-1: 과거 날짜 항목
    let { data: items } = await admin
      .from('content_calendar_items')
      .select(`*, content_calendars!inner(clinic_id, status)`)
      .in('status', ['approved', 'scheduled'])
      .eq('content_calendars.status', 'approved')
      .lt('publish_date', currentDate)
      .order('publish_date', { ascending: true })
      .order('publish_time', { ascending: true })
      .limit(1);

    // 2-2: 오늘 날짜 + 시간 지난 항목
    if (!items?.length) {
      const result = await admin
        .from('content_calendar_items')
        .select(`*, content_calendars!inner(clinic_id, status)`)
        .in('status', ['approved', 'scheduled'])
        .eq('content_calendars.status', 'approved')
        .eq('publish_date', currentDate)
        .lte('publish_time', currentTime)
        .order('publish_time', { ascending: true })
        .limit(1);
      items = result.data;
    }

    const nextItem = items?.[0] ? {
      id: items[0].id,
      title: items[0].title,
      keyword: items[0].keyword,
      publish_date: items[0].publish_date,
      publish_time: items[0].publish_time,
      generated_content: items[0].generated_content,
      generated_images: items[0].generated_images,
      platforms: items[0].platforms,
      clinic_id: ((items[0] as Record<string, unknown>).content_calendars as { clinic_id: string })?.clinic_id,
    } : null;

    return NextResponse.json({
      control: {
        start_requested: controlData?.start_requested || false,
        stop_requested: controlData?.stop_requested || false,
      },
      nextItem,
    });
  } catch (error) {
    console.error('[worker-api/poll]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
