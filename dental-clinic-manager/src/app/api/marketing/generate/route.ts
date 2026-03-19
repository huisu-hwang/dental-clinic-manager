import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateContent } from '@/lib/marketing/content-generator';
import { generateBlogImage } from '@/lib/marketing/image-generator';
import type { ContentGenerateOptions } from '@/types/marketing';

// Vercel 서버리스 함수 타임아웃 확장 (Claude + Gemini API 호출 소요 시간 대응)
export const maxDuration = 60;

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

        // 2단계: 이미지 생성 (Gemini) - 마커별 진행상황 전송
        const imageMarkers = result.imageMarkers || [];
        if (imageMarkers.length > 0) {
          const generatedImages: {
            fileName: string;
            prompt: string;
            path: string;
          }[] = [];

          for (let i = 0; i < imageMarkers.length; i++) {
            const progress = 55 + Math.round(((i) / imageMarkers.length) * 35);
            sendEvent(controller, {
              progress,
              step: `이미지를 생성하고 있습니다... (${i + 1}/${imageMarkers.length})`,
            });

            try {
              const { imageBase64, fileName } = await generateBlogImage(
                imageMarkers[i].prompt
              );
              generatedImages.push({
                fileName,
                prompt: imageMarkers[i].prompt,
                path: `data:image/png;base64,${imageBase64}`,
              });
            } catch (imgError) {
              console.error(
                `[API] 이미지 생성 실패: "${imageMarkers[i].prompt}"`,
                imgError
              );
              // 실패 시 건너뛰고 계속 진행
            }
          }

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
        console.error('[API] marketing/generate POST:', error);
        const message = error instanceof Error ? error.message : '글 생성 실패';
        sendEvent(controller, { error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
