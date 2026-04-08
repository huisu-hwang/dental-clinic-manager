import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generateBlogImage } from '@/lib/marketing/image-generator';
import type { ImageStyleOption, ImageVisualStyle } from '@/types/marketing';

// Gemini 이미지 생성 타임아웃 대응
export const maxDuration = 60;

// 단일 이미지 재생성 API
export async function POST(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 400 });
    }

    const body = await request.json();
    const {
      prompt,
      imageStyle,
      imageVisualStyle,
      referenceImageBase64,
    } = body as {
      prompt: string;
      imageStyle?: ImageStyleOption;
      imageVisualStyle?: ImageVisualStyle;
      referenceImageBase64?: string;
    };

    if (!prompt) {
      return NextResponse.json({ error: '이미지 프롬프트가 필요합니다.' }, { status: 400 });
    }

    // 비용 추적용 세션 ID
    const generationSessionId = crypto.randomUUID();

    // Gemini로 이미지 생성
    const { imageBase64, fileName } = await generateBlogImage(
      prompt,
      imageStyle,
      referenceImageBase64,
      userData.clinic_id,
      undefined,
      imageVisualStyle,
      generationSessionId,
      userData.clinic_id,
    );

    // Supabase Storage에 업로드
    let imagePath = '';
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        const buffer = Buffer.from(imageBase64, 'base64');
        const safeFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
        const storagePath = `generated/${safeFileName}`;
        const { error: uploadError } = await admin.storage
          .from('marketing-images')
          .upload(storagePath, buffer, {
            contentType: 'image/png',
            upsert: true,
          });
        if (!uploadError) {
          const { data: urlData } = admin.storage
            .from('marketing-images')
            .getPublicUrl(storagePath);
          imagePath = urlData.publicUrl;
        }
      } catch (uploadErr) {
        console.error('[API] Storage 업로드 실패:', uploadErr);
      }
    }

    // Storage 업로드 실패 시 base64 폴백
    if (!imagePath && imageBase64.length < 500000) {
      imagePath = `data:image/png;base64,${imageBase64}`;
    }

    if (!imagePath) {
      return NextResponse.json({ error: '이미지 업로드에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({
      path: imagePath,
      fileName,
      prompt,
    });
  } catch (error) {
    console.error('[API] regenerate-image POST:', error);
    const message = error instanceof Error ? error.message : '이미지 재생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
