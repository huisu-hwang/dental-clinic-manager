import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateContent } from '@/lib/marketing/content-generator';
import { generateImagesFromMarkers } from '@/lib/marketing/image-generator';
import type { ContentGenerateOptions } from '@/types/marketing';

// AI 글 생성
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const options: ContentGenerateOptions = {
      topic: body.topic,
      keyword: body.keyword,
      postType: body.postType || 'informational',
      tone: body.tone || 'friendly',
      useResearch: body.useResearch || false,
      factCheck: body.factCheck || false,
      platforms: body.platforms || { naverBlog: true, instagram: false, facebook: false, threads: false },
      schedule: body.schedule || { snsDelayMinutes: 30 },
      clinical: body.clinical,
      notice: body.notice,
    };

    if (!options.topic || !options.keyword) {
      return NextResponse.json({ error: '주제와 키워드는 필수입니다.' }, { status: 400 });
    }

    const result = await generateContent(options, userData.clinic_id);

    // 이미지 마커가 있으면 이미지 생성
    if (result.imageMarkers && result.imageMarkers.length > 0) {
      try {
        const images = await generateImagesFromMarkers(result.imageMarkers);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any).generatedImages = images;
      } catch (imgError) {
        console.error('[API] 이미지 생성 실패 (글 생성은 성공):', imgError);
        // 이미지 실패해도 글은 반환
      }
    }

    // 캘린더 항목 ID가 있으면 generated_content 업데이트
    if (body.itemId) {
      await supabase
        .from('content_calendar_items')
        .update({
          generated_content: JSON.stringify(result),
          status: 'scheduled',
        })
        .eq('id', body.itemId);
    }

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('[API] marketing/generate POST:', error);
    const message = error instanceof Error ? error.message : '글 생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
