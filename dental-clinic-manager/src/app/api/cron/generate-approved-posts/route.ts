// 승인된 캘린더 항목 자동 생성 cron
// - 매일 KST 새벽 3시 (vercel.json: 18 UTC) 실행
// - status='approved' AND publish_date(KST) <= today(KST)+2 인 항목을 picking
// - generateContent로 본문 생성 → status='scheduled' 전이
// - 한 번에 최대 5건만 처리 (Vercel maxDuration 60초 안전)
import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generateContent } from '@/lib/marketing/content-generator';
import type {
  ContentGenerateOptions,
  PostType,
  ToneType,
  PlatformOptions,
} from '@/types/marketing';

export const maxDuration = 60;

const BATCH_SIZE = 5;

interface CalendarItemRow {
  id: string;
  calendar_id: string;
  title: string;
  topic: string | null;
  keyword: string | null;
  post_type: string;
  tone: string;
  use_research: boolean;
  fact_check: boolean;
  platforms: PlatformOptions;
  publish_date: string;
  publish_time: string;
  status: string;
  topic_category: string | null;
  needs_medical_review: boolean | null;
  content_calendars?: { clinic_id: string; status: string };
}

export async function GET(request: Request) {
  // CRON_SECRET 검증 (Vercel cron 또는 수동 호출)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret.trim()}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase admin 초기화 실패' }, { status: 500 });
  }

  // 1. 'generating' 상태로 1시간 이상 정체된 항목 복구
  // - 이전 cron 실행이 타임아웃/오류로 중단되어 status가 generating에 묶인 경우
  // - approved로 되돌려 다음 사이클에서 재처리되도록 한다.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await admin
    .from('content_calendar_items')
    .update({ status: 'approved' })
    .eq('status', 'generating')
    .lt('updated_at', oneHourAgo);

  // 오늘(KST) + 2일 이내 발행 예정인 approved 항목 조회
  // publish_date 컬럼은 사용자가 KST 기준으로 입력하므로 비교도 KST 날짜로 수행해야 한다.
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const cutoff = new Date(nowKst);
  cutoff.setUTCDate(cutoff.getUTCDate() + 2);
  const todayStr = nowKst.toISOString().split('T')[0];
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: items, error: fetchError } = await admin
    .from('content_calendar_items')
    .select(`*, content_calendars!inner(clinic_id, status)`)
    .eq('status', 'approved')
    .eq('content_calendars.status', 'approved')
    .lte('publish_date', cutoffStr)
    .gte('publish_date', todayStr)
    .order('publish_date', { ascending: true })
    .order('publish_time', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({
      success: true,
      message: '처리할 approved 항목이 없습니다.',
      processed: 0,
    });
  }

  const results: { id: string; status: 'scheduled' | 'failed'; error?: string }[] = [];

  for (const raw of items as unknown as CalendarItemRow[]) {
    const item = raw;
    const clinicId = item.content_calendars?.clinic_id;
    if (!clinicId) {
      results.push({ id: item.id, status: 'failed', error: 'clinic_id 없음' });
      continue;
    }

    try {
      // generating 상태로 마킹 (중복 처리 방지)
      await admin
        .from('content_calendar_items')
        .update({ status: 'generating' })
        .eq('id', item.id);

      const opts: ContentGenerateOptions = {
        topic: item.topic || item.title,
        keyword: item.keyword || '치과',
        postType: (item.post_type as PostType) || 'informational',
        tone: (item.tone as ToneType) || 'friendly',
        useResearch: !!item.use_research,
        factCheck: !!item.fact_check,
        useSeoAnalysis: false,
        platforms: item.platforms || {
          naverBlog: true,
          instagram: false,
          facebook: false,
          threads: false,
        },
        imageCount: 3,
        schedule: {
          publishAt: `${item.publish_date}T${item.publish_time}:00+09:00`,
          snsDelayMinutes: 30,
        },
      };

      const content = await generateContent(opts, clinicId);

      // 결과 저장 + scheduled 전이
      const { error: updateError } = await admin
        .from('content_calendar_items')
        .update({
          status: 'scheduled',
          generated_content: JSON.stringify({
            title: content.title,
            body: content.body,
            imageMarkers: content.imageMarkers,
            hashtags: content.hashtags,
            wordCount: content.wordCount,
            keywordCount: content.keywordCount,
          }),
          fail_reason: null,
        })
        .eq('id', item.id);

      if (updateError) throw new Error(updateError.message);

      results.push({ id: item.id, status: 'scheduled' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[cron/generate-approved-posts] ${item.id} 실패:`, message);
      await admin
        .from('content_calendar_items')
        .update({
          status: 'failed',
          fail_reason: message.slice(0, 500),
        })
        .eq('id', item.id);
      results.push({ id: item.id, status: 'failed', error: message });
    }
  }

  return NextResponse.json({
    success: true,
    processed: results.length,
    results,
    timestamp: new Date().toISOString(),
  });
}
