import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generateContent } from '@/lib/marketing/content-generator';
import { generateBlogImage } from '@/lib/marketing/image-generator';
import { transformToInstagram } from '@/lib/marketing/platform-adapters/instagram';
import { transformToFacebook } from '@/lib/marketing/platform-adapters/facebook';
import { transformToThreads } from '@/lib/marketing/platform-adapters/threads';
import type { ContentGenerateOptions, PlatformContent } from '@/types/marketing';

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
          imageStyle: body.imageStyle || undefined,
          referenceImageBase64: body.referenceImageBase64 || undefined,
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
                generateBlogImage(marker.prompt, options.imageStyle, options.referenceImageBase64, userData.clinic_id),
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

        // 3단계: 플랫폼별 글 변환 (선택된 플랫폼만)
        const { platforms } = options;
        const hasSnsPlatform = platforms.instagram || platforms.facebook || platforms.threads;

        if (hasSnsPlatform) {
          sendEvent(controller, {
            progress: 92,
            step: '플랫폼별 글을 변환하고 있습니다...',
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const generatedImages = (result as any).generatedImages || [];
          const platformContent: PlatformContent = {};

          const transformPromises: Promise<void>[] = [];

          if (platforms.instagram) {
            transformPromises.push(
              transformToInstagram(result.title, result.body, options.keyword, generatedImages)
                .then(content => { platformContent.instagram = content; })
                .catch(err => console.error('[API] Instagram 변환 실패:', err))
            );
          }

          if (platforms.facebook) {
            transformPromises.push(
              transformToFacebook(result.title, result.body, '', generatedImages)
                .then(content => { platformContent.facebook = content; })
                .catch(err => console.error('[API] Facebook 변환 실패:', err))
            );
          }

          if (platforms.threads) {
            transformPromises.push(
              transformToThreads(result.title, result.body, '', generatedImages)
                .then(content => { platformContent.threads = content; })
                .catch(err => console.error('[API] Threads 변환 실패:', err))
            );
          }

          await Promise.allSettled(transformPromises);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result as any).platformContent = platformContent;
        }

        // 4단계: 자동 저장
        sendEvent(controller, { progress: 95, step: '저장 중...' });

        let savedItemId: string | null = body.itemId || null;

        if (savedItemId) {
          // 기존 항목 업데이트
          await supabase
            .from('content_calendar_items')
            .update({
              generated_content: JSON.stringify(result),
              generated_images: // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (result as any).generatedImages || null,
              status: 'review',
            })
            .eq('id', savedItemId);
        } else {
          // 신규 항목 자동 생성 (캘린더 + 항목)
          const today = new Date().toISOString().split('T')[0];
          const { data: calendar } = await supabase
            .from('content_calendars')
            .insert({
              clinic_id: userData.clinic_id,
              period_start: today,
              period_end: today,
              status: 'approved',
              created_by: user.id,
              approved_by: user.id,
              approved_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (calendar) {
            const { data: item } = await supabase
              .from('content_calendar_items')
              .insert({
                calendar_id: calendar.id,
                publish_date: today,
                publish_time: '09:00',
                title: result.title,
                topic: options.topic,
                keyword: options.keyword,
                post_type: options.postType,
                tone: options.tone,
                use_research: options.useResearch,
                fact_check: options.factCheck,
                platforms: options.platforms,
                status: 'review',
                generated_content: JSON.stringify(result),
                generated_images: // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (result as any).generatedImages || null,
              })
              .select('id')
              .single();

            if (item) {
              savedItemId = item.id;
            }
          }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (result as any).savedItemId = savedItemId;

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
