import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generateContent } from '@/lib/marketing/content-generator';
import { generateBlogImage } from '@/lib/marketing/image-generator';
import type { PromptCategory } from '@/types/marketing';

export const maxDuration = 90;

// 프롬프트 테스트 (샌드박스) - 편집 중인 미저장 프롬프트 포함
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

    if (!userData?.clinic_id || !['owner', 'master_admin'].includes(userData.role)) {
      return NextResponse.json({ error: '마스터 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const {
      topic,
      keyword,
      tone,
      postType,
      customSystemPrompt,
      category,
      imagePrompt,
    }: {
      topic?: string;
      keyword?: string;
      tone?: string;
      postType?: string;
      customSystemPrompt?: string;
      category?: PromptCategory;
      imagePrompt?: string;
    } = body;

    // ─── 이미지 카테고리 테스트 ───
    if (category === 'image') {
      const prompt = imagePrompt || '치과 치아 건강 관리 이미지';
      try {
        // 60초 타임아웃으로 이미지 생성 (Vercel 함수 타임아웃 전에 제어)
        const imageResult = await Promise.race([
          generateBlogImage(
            prompt,
            undefined, // imageStyle
            undefined, // referenceImageBase64
            userData.clinic_id,
            customSystemPrompt || undefined,
          ),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('이미지 생성 시간이 초과되었습니다. 다시 시도해주세요.')), 60000)
          ),
        ]);

        const { imageBase64, fileName } = imageResult;
        const admin = getSupabaseAdmin();

        let imagePath = '';
        if (admin && imageBase64) {
          try {
            const buffer = Buffer.from(imageBase64, 'base64');
            const safeFileName = `test_${Date.now()}.png`;
            const storagePath = `generated/${safeFileName}`;
            const { error: uploadError } = await admin.storage
              .from('marketing-images')
              .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });
            if (!uploadError) {
              const { data: urlData } = admin.storage
                .from('marketing-images')
                .getPublicUrl(storagePath);
              imagePath = urlData.publicUrl;
            }
          } catch {
            // Storage 실패 시 base64로 폴백
          }
        }
        if (!imagePath && imageBase64) {
          imagePath = `data:image/png;base64,${imageBase64}`;
        }

        return NextResponse.json({
          data: {
            category: 'image',
            images: imagePath ? [{ fileName, prompt, path: imagePath }] : [],
          },
        });
      } catch (imgError: unknown) {
        console.error('[API] 이미지 테스트 실패:', imgError);
        const msg = imgError instanceof Error ? imgError.message : '이미지 생성 실패';
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    // ─── 컨텐츠/변환/품질 카테고리 테스트 ───
    if (!topic || !keyword) {
      return NextResponse.json({ error: '주제와 키워드는 필수입니다.' }, { status: 400 });
    }

    const result = await generateContent(
      {
        topic,
        keyword,
        postType: (postType as 'informational' | 'promotional' | 'clinical' | 'notice') || 'informational',
        tone: (tone as 'friendly' | 'polite' | 'casual' | 'expert' | 'warm') || 'friendly',
        useResearch: false,
        factCheck: false,
        platforms: { naverBlog: true, instagram: false, facebook: false, threads: false },
        schedule: { snsDelayMinutes: 30 },
      },
      userData.clinic_id,
      customSystemPrompt || undefined,
    );

    return NextResponse.json({
      data: {
        category: category || 'content',
        title: result.title,
        body: result.body,
        wordCount: result.wordCount,
        keywordCount: result.keywordCount,
        imageMarkers: result.imageMarkers,
        hashtags: result.hashtags,
      },
    });
  } catch (error) {
    console.error('[API] marketing/prompts/test POST:', error);
    const message = error instanceof Error ? error.message : '테스트 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
