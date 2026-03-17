import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateContent } from '@/lib/marketing/content-generator';

// 프롬프트 테스트 (샌드박스)
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

    if (!userData?.clinic_id || userData.role !== 'owner') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { topic, keyword, tone, postType } = body;

    if (!topic || !keyword) {
      return NextResponse.json({ error: '주제와 키워드는 필수입니다.' }, { status: 400 });
    }

    const result = await generateContent(
      {
        topic,
        keyword,
        postType: postType || 'informational',
        tone: tone || 'friendly',
        useResearch: false,
        factCheck: false,
        platforms: { naverBlog: true, instagram: false, facebook: false, threads: false },
        schedule: { snsDelayMinutes: 30 },
      },
      userData.clinic_id
    );

    return NextResponse.json({
      data: result,
      analysis: {
        wordCount: result.wordCount,
        keywordCount: result.keywordCount,
        imageCount: result.imageMarkers.length,
        hashtagCount: result.hashtags.length,
      },
    });
  } catch (error) {
    console.error('[API] marketing/prompts/test POST:', error);
    const message = error instanceof Error ? error.message : '테스트 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
