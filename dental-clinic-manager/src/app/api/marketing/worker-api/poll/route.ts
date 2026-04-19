import { NextRequest, NextResponse } from 'next/server';
import { verifyWorkerApiKey } from '@/lib/marketing/workerApiAuth';
import { transformToNaverBlog } from '@/lib/marketing/platform-adapters/naver-blog';
import type {
  GeneratedImageMeta,
  PlatformOptions,
  TopicCategory,
} from '@/types/marketing';

interface CalendarItemRow {
  id: string;
  title: string;
  keyword: string | null;
  publish_date: string;
  publish_time: string;
  generated_content: string | null;
  generated_images: GeneratedImageMeta[] | null;
  platforms: PlatformOptions | null;
  topic_category: TopicCategory | null;
  needs_medical_review: boolean | null;
  content_calendars?: { clinic_id: string; status: string };
}

interface GeneratedContentJson {
  title?: string;
  body?: string;
  hashtags?: string[];
}

export async function GET(request: NextRequest) {
  try {
    const admin = await verifyWorkerApiKey(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // 1. 제어 신호 조회
    const { data: controlData } = await admin
      .from('marketing_worker_control')
      .select('start_requested, stop_requested, headless, update_requested')
      .eq('id', 'main')
      .single();

    // 2. 발행 대상 조회 (KST 기준)
    // 핵심 안전장치: status='scheduled' 만 pickup. 'proposed'/'approved'는 절대 발행 안 됨.
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const currentDate = kst.toISOString().split('T')[0];
    const currentTime = kst.toISOString().split('T')[1].slice(0, 5);

    // 2-1: 과거 날짜 항목
    let { data: items } = await admin
      .from('content_calendar_items')
      .select(`*, content_calendars!inner(clinic_id, status)`)
      .eq('status', 'scheduled')
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
        .eq('status', 'scheduled')
        .eq('content_calendars.status', 'approved')
        .eq('publish_date', currentDate)
        .lte('publish_time', currentTime)
        .order('publish_time', { ascending: true })
        .limit(1);
      items = result.data;
    }

    const first = items?.[0] as unknown as CalendarItemRow | undefined;
    let naverBlogPayload: Awaited<ReturnType<typeof transformToNaverBlog>> | null = null;
    if (first?.generated_content && first.platforms?.naverBlog) {
      try {
        const parsed = JSON.parse(first.generated_content) as GeneratedContentJson;
        if (parsed.body) {
          naverBlogPayload = await transformToNaverBlog(
            parsed.title || first.title,
            parsed.body,
            first.generated_images || [],
            {
              keyword: first.keyword || '치과',
              topicCategory: first.topic_category ?? undefined,
              clinicName: '하얀치과',
            }
          );
        }
      } catch (e) {
        console.error('[worker-api/poll] naver-blog 변환 실패:', e);
      }
    }

    const nextItem = first
      ? {
          id: first.id,
          title: first.title,
          keyword: first.keyword,
          publish_date: first.publish_date,
          publish_time: first.publish_time,
          generated_content: first.generated_content,
          generated_images: first.generated_images,
          platforms: first.platforms,
          clinic_id: first.content_calendars?.clinic_id,
          naverBlog: naverBlogPayload,
        }
      : null;

    return NextResponse.json({
      control: {
        start_requested: controlData?.start_requested || false,
        stop_requested: controlData?.stop_requested || false,
        headless: controlData?.headless || false,
        update_requested: controlData?.update_requested || false,
      },
      nextItem,
    });
  } catch (error) {
    console.error('[worker-api/poll]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
