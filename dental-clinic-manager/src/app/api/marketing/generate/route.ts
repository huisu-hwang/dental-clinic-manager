import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generateContent } from '@/lib/marketing/content-generator';
import { generateBlogImage } from '@/lib/marketing/image-generator';
import type { ContentGenerateOptions } from '@/types/marketing';

// Vercel 서버리스 함수 타임아웃 확장 (Claude + Gemini API 호출 소요 시간 대응)
export const maxDuration = 120;

// AI 글 생성 (SSE 스트리밍으로 진행 상태 전송)
export async function POST(request: NextRequest) {
  const encoder = new TextEncoder();

  const sendEvent = (
    controller: ReadableStreamDefaultController,
    data: object
  ) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  // 요청 바디를 스트림 시작 전에 파싱
  const body = await request.json();

  const stream = new ReadableStream({
    async start(controller) {
      let keepalive: ReturnType<typeof setInterval> | null = null;
      try {
        // 인증 확인
        const supabase = await createClient();
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          sendEvent(controller, { error: '인증이 필요합니다.' });
          controller.close();
          return;
        }

        const { data: userData } = await supabase
          .from('users')
          .select('clinic_id, role')
          .eq('id', user.id)
          .single();

        if (!userData?.clinic_id) {
          sendEvent(controller, { error: '클리닉 정보가 없습니다.' });
          controller.close();
          return;
        }

        const options: ContentGenerateOptions = {
          topic: body.topic,
          keyword: body.keyword,
          postType: body.postType || 'informational',
          tone: body.tone || 'friendly',
          useResearch: body.useResearch || false,
          factCheck: body.factCheck || false,
          platforms: body.platforms || {
            naverBlog: true,
            instagram: false,
            facebook: false,
            threads: false,
          },
          schedule: body.schedule || { snsDelayMinutes: 30 },
          clinical: body.clinical,
          notice: body.notice,
        };

        if (!options.topic || !options.keyword) {
          sendEvent(controller, { error: '주제와 키워드는 필수입니다.' });
          controller.close();
          return;
        }

        // 1단계: 텍스트 생성 (Claude)
        sendEvent(controller, {
          progress: 5,
          step: 'AI가 글을 작성하고 있습니다...',
        });

        const result = await generateContent(options, userData.clinic_id);

        sendEvent(controller, {
          progress: 55,
          step: '글 작성이 완료되었습니다.',
        });

        // 2단계: 이미지 병렬 생성 (Gemini) + Storage 업로드
        const imageMarkers = (result.imageMarkers || []).slice(0, 3); // 최대 3개
        if (imageMarkers.length > 0) {
          const admin = getSupabaseAdmin();

          sendEvent(controller, {
            progress: 60,
            step: `이미지 ${imageMarkers.length}개를 생성하고 있습니다...`,
          });

          // Keepalive: 이미지 생성 중 5초마다 heartbeat 전송
          keepalive = setInterval(() => {
            try {
              sendEvent(controller, { heartbeat: true });
            } catch { /* stream closed */ }
          }, 5000);

          // 병렬 생성 (개별 55초 타임아웃)
          const imagePromises = imageMarkers.map(async (marker) => {
            try {
              const timeoutPromise = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('이미지 생성 타임아웃')), 55000)
              );
              const { imageBase64, fileName } = await Promise.race([
                generateBlogImage(marker.prompt, userData.clinic_id),
                timeoutPromise,
              ]);

              // Supabase Storage에 업로드
              let imagePath = '';
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

              if (!imagePath && imageBase64.length < 500000) {
                imagePath = `data:image/png;base64,${imageBase64}`;
              }

              return imagePath ? { fileName, prompt: marker.prompt, path: imagePath } : null;
            } catch (imgError) {
              console.error(`[API] 이미지 생성 실패: "${marker.prompt}"`, imgError);
              return null;
            }
          });

          const imageResults = await Promise.allSettled(imagePromises);
          clearInterval(keepalive);

          const generatedImages = imageResults
            .filter((r): r is PromiseFulfilledResult<{ fileName: string; prompt: string; path: string } | null> =>
              r.status === 'fulfilled' && r.value !== null
            )
            .map(r => r.value!);

          sendEvent(controller, {
            progress: 90,
            step: `이미지 ${generatedImages.length}/${imageMarkers.length}개 생성 완료`,
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any).generatedImages = generatedImages;
        }

        // 3단계: 캘린더 항목 저장
        sendEvent(controller, { progress: 95, step: '저장 중...' });

        if (body.itemId) {
          await supabase
            .from('content_calendar_items')
            .update({
              generated_content: JSON.stringify(result),
              status: 'scheduled',
            })
            .eq('id', body.itemId);
        }

        // 완료 - 최종 결과 전송
        sendEvent(controller, {
          progress: 100,
          step: '생성이 완료되었습니다!',
          result,
        });
        controller.close();
      } catch (error) {
        if (keepalive) clearInterval(keepalive);
        console.error('[API] marketing/generate POST:', error);
        const message =
          error instanceof Error ? error.message : '글 생성 실패';
        try {
          sendEvent(controller, { error: message });
          controller.close();
        } catch {
          // controller가 이미 닫힌 경우 무시
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
