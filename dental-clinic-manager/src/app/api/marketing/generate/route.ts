import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { generateContent } from '@/lib/marketing/content-generator';
import { extractKeywordsFromPosts } from '@/lib/marketing/seo-text-miner';
import { generateBlogImage, generatePlatformImage } from '@/lib/marketing/image-generator';
import { transformToInstagram } from '@/lib/marketing/platform-adapters/instagram';
import { transformToFacebook } from '@/lib/marketing/platform-adapters/facebook';
import { transformToThreads } from '@/lib/marketing/platform-adapters/threads';
import type { ContentGenerateOptions, PlatformContent, SeoKeywordMiningResult } from '@/types/marketing';

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
          imageVisualStyle: body.imageVisualStyle || undefined,
          imageCount: body.imageCount !== undefined ? Number(body.imageCount) : 3,
          referenceImageBase64: body.referenceImageBase64 || undefined,
          schedule: body.schedule || { snsDelayMinutes: 30 },
          clinical: body.clinical,
          notice: body.notice,
        };

        const useSeoAnalysis = body.useSeoAnalysis || false;

        if (!options.topic || !options.keyword) {
          sendEvent(controller, { error: '주제와 키워드는 필수입니다.' });
          controller.close();
          return;
        }

        // 글 생성 세션 ID 발급 (비용 추적용)
        const generationSessionId = crypto.randomUUID();

        let seoKeywordData: SeoKeywordMiningResult | undefined;

        if (useSeoAnalysis) {
          sendEvent(controller, { progress: 1, step: 'SEO 키워드 분석을 시작합니다...' });

          try {
            const admin = getSupabaseAdmin();
            if (admin) {
              // 1. Check 24h cache in seo_keyword_analyses
              const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
              const { data: cached } = await admin
                .from('seo_keyword_analyses')
                .select('id, status')
                .eq('keyword', options.keyword.trim())
                .gte('created_at', oneDayAgo)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1);

              let analysisId: string | null = cached?.[0]?.id || null;

              if (!analysisId) {
                // 2. Check if already in progress
                const { data: inProgress } = await admin
                  .from('seo_keyword_analyses')
                  .select('id, status')
                  .eq('keyword', options.keyword.trim())
                  .gte('created_at', oneDayAgo)
                  .in('status', ['pending', 'collecting', 'analyzing_quantitative', 'analyzing_qualitative'])
                  .order('created_at', { ascending: false })
                  .limit(1);

                if (inProgress?.[0]) {
                  analysisId = inProgress[0].id;
                } else {
                  // 3. Create new seo_jobs entry
                  sendEvent(controller, { progress: 2, step: 'SEO 워커에 분석을 요청합니다...' });
                  const { data: job } = await admin
                    .from('seo_jobs')
                    .insert({
                      job_type: 'keyword_analysis',
                      status: 'pending',
                      params: { keyword: options.keyword.trim() },
                      created_by: user.id,
                    })
                    .select('id')
                    .single();

                  if (job) {
                    // Poll for the analysis to be created by the worker
                    for (let i = 0; i < 15; i++) {
                      await new Promise(r => setTimeout(r, 3000));
                      const { data: check } = await admin
                        .from('seo_keyword_analyses')
                        .select('id, status')
                        .eq('keyword', options.keyword.trim())
                        .gte('created_at', oneDayAgo)
                        .order('created_at', { ascending: false })
                        .limit(1);

                      if (check?.[0]) {
                        if (check[0].status === 'completed') {
                          analysisId = check[0].id;
                          break;
                        }
                        if (check[0].status === 'failed') break;
                      }
                      sendEvent(controller, { heartbeat: true });
                    }
                  }
                }
              }

              // 4. Fetch analyzed posts body_text for text mining
              if (analysisId) {
                sendEvent(controller, { progress: 3, step: '경쟁 글 텍스트 마이닝 중...' });
                const { data: posts } = await admin
                  .from('seo_analyzed_posts')
                  .select('body_text, title, tags, body_length, image_count, heading_count, keyword_count')
                  .eq('analysis_id', analysisId)
                  .order('rank', { ascending: true });

                if (posts && posts.length > 0) {
                  seoKeywordData = extractKeywordsFromPosts(posts, options.keyword);
                  sendEvent(controller, {
                    progress: 4,
                    step: `핵심 키워드 ${seoKeywordData.recommendedKeywords.length}개 추출 완료`,
                  });
                }
              } else {
                sendEvent(controller, { progress: 4, step: 'SEO 분석 결과 없음 - 기본 모드로 진행합니다' });
              }
            }
          } catch (seoErr) {
            console.error('[API] SEO 분석 오류:', seoErr);
            sendEvent(controller, { progress: 4, step: 'SEO 분석 건너뜀 - 기본 모드로 진행합니다' });
          }
        }

        // 1단계: 텍스트 생성 (Claude)
        sendEvent(controller, {
          progress: 5,
          step: 'AI가 글을 작성하고 있습니다...',
        });

        const result = await generateContent(options, userData.clinic_id, undefined, generationSessionId, seoKeywordData);

        sendEvent(controller, {
          progress: 55,
          step: '글 작성이 완료되었습니다.',
        });

        // 2단계: 이미지 병렬 생성 (Gemini) + Storage 업로드
        const maxImages = options.imageCount ?? 3;
        const imageMarkers = maxImages > 0 ? (result.imageMarkers || []).slice(0, maxImages) : [];
        const admin = getSupabaseAdmin();
        if (imageMarkers.length > 0) {

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
                generateBlogImage(marker.prompt, options.imageStyle, options.referenceImageBase64, userData.clinic_id, undefined, options.imageVisualStyle, generationSessionId, userData.clinic_id),
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

        // 3단계: 플랫폼별 글 변환 + 플랫폼별 이미지 생성
        const { platforms } = options;
        const hasSnsPlatform = platforms.instagram || platforms.facebook || platforms.threads;

        if (hasSnsPlatform) {
          sendEvent(controller, {
            progress: 92,
            step: '플랫폼별 글과 이미지를 생성하고 있습니다...',
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const generatedImages = (result as any).generatedImages || [];
          const platformContent: PlatformContent = {};

          // 첫 번째 이미지 마커의 프롬프트를 플랫폼 이미지 생성에 사용
          const firstImagePrompt = result.imageMarkers?.[0]?.prompt || result.title;

          // 플랫폼별 이미지 생성 + 텍스트 변환을 병렬 수행
          const transformPromises: Promise<void>[] = [];

          if (platforms.instagram) {
            transformPromises.push(
              (async () => {
                // 인스타그램용 이미지 생성 (정사각형, 캐러셀용)
                let instaImages = generatedImages;
                if (maxImages > 0) {
                  try {
                    const { imageBase64, fileName } = await generatePlatformImage(
                      firstImagePrompt, 'instagram', options.imageStyle, options.referenceImageBase64, undefined, generationSessionId, userData.clinic_id
                    );
                    let imagePath = '';
                    if (admin) {
                      try {
                        const buffer = Buffer.from(imageBase64, 'base64');
                        const safeFileName = `insta_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
                        const storagePath = `generated/${safeFileName}`;
                        const { error: upErr } = await admin.storage.from('marketing-images').upload(storagePath, buffer, { contentType: 'image/png', upsert: true });
                        if (!upErr) imagePath = admin.storage.from('marketing-images').getPublicUrl(storagePath).data.publicUrl;
                      } catch { /* fallback */ }
                    }
                    if (!imagePath && imageBase64.length < 500000) imagePath = `data:image/png;base64,${imageBase64}`;
                    if (imagePath) {
                      instaImages = [{ fileName, prompt: firstImagePrompt, path: imagePath, width: 1080, height: 1080 }, ...generatedImages];
                    }
                  } catch (err) {
                    console.error('[API] Instagram 이미지 생성 실패:', err);
                  }
                }
                const content = await transformToInstagram(result.title, result.body, options.keyword, instaImages);
                platformContent.instagram = content;
              })().catch(err => console.error('[API] Instagram 변환 실패:', err))
            );
          }

          if (platforms.facebook) {
            transformPromises.push(
              (async () => {
                // 페이스북용 이미지 생성 (가로형)
                let fbImages = generatedImages;
                if (maxImages > 0) {
                  try {
                    const { imageBase64, fileName } = await generatePlatformImage(
                      firstImagePrompt, 'facebook', options.imageStyle, options.referenceImageBase64, undefined, generationSessionId, userData.clinic_id
                    );
                    let imagePath = '';
                    if (admin) {
                      try {
                        const buffer = Buffer.from(imageBase64, 'base64');
                        const safeFileName = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
                        const storagePath = `generated/${safeFileName}`;
                        const { error: upErr } = await admin.storage.from('marketing-images').upload(storagePath, buffer, { contentType: 'image/png', upsert: true });
                        if (!upErr) imagePath = admin.storage.from('marketing-images').getPublicUrl(storagePath).data.publicUrl;
                      } catch { /* fallback */ }
                    }
                    if (!imagePath && imageBase64.length < 500000) imagePath = `data:image/png;base64,${imageBase64}`;
                    if (imagePath) {
                      fbImages = [{ fileName, prompt: firstImagePrompt, path: imagePath }];
                    }
                  } catch (err) {
                    console.error('[API] Facebook 이미지 생성 실패:', err);
                  }
                }
                const content = await transformToFacebook(result.title, result.body, '', fbImages);
                platformContent.facebook = content;
              })().catch(err => console.error('[API] Facebook 변환 실패:', err))
            );
          }

          if (platforms.threads) {
            transformPromises.push(
              (async () => {
                // 쓰레드용 이미지 생성 (미니멀)
                let threadsImages = generatedImages;
                if (maxImages > 0) {
                  try {
                    const { imageBase64, fileName } = await generatePlatformImage(
                      firstImagePrompt, 'threads', options.imageStyle, options.referenceImageBase64, undefined, generationSessionId, userData.clinic_id
                    );
                    let imagePath = '';
                    if (admin) {
                      try {
                        const buffer = Buffer.from(imageBase64, 'base64');
                        const safeFileName = `threads_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.png`;
                        const storagePath = `generated/${safeFileName}`;
                        const { error: upErr } = await admin.storage.from('marketing-images').upload(storagePath, buffer, { contentType: 'image/png', upsert: true });
                        if (!upErr) imagePath = admin.storage.from('marketing-images').getPublicUrl(storagePath).data.publicUrl;
                      } catch { /* fallback */ }
                    }
                    if (!imagePath && imageBase64.length < 500000) imagePath = `data:image/png;base64,${imageBase64}`;
                    if (imagePath) {
                      threadsImages = [{ fileName, prompt: firstImagePrompt, path: imagePath }];
                    }
                  } catch (err) {
                    console.error('[API] Threads 이미지 생성 실패:', err);
                  }
                }
                const content = await transformToThreads(result.title, result.body, '', threadsImages);
                platformContent.threads = content;
              })().catch(err => console.error('[API] Threads 변환 실패:', err))
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
