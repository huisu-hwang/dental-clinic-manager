import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { CONFIG, isApiMode } from './config.js';
import { NaverBlogPublisher } from './publisher/naver-blog-publisher.js';
import { WorkerApiClient, type ScheduledItem } from './api-client.js';

// ============================================
// 자동 발행 스케줄러
// API 모드: 대시보드 API를 통해 DB 작업
// 레거시 모드: Supabase 직접 접속 (하위 호환)
// ============================================

const IMAGE_TEMP_DIR = path.join(os.tmpdir(), 'marketing-images-publish');

let apiClient: WorkerApiClient | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let supabase: any = null;
let publisher: NaverBlogPublisher | null = null;
let dailyPublishCount = 0;
let lastPublishDate = '';

function getApiClient(): WorkerApiClient {
  if (!apiClient) {
    apiClient = new WorkerApiClient(CONFIG.api.dashboardUrl, CONFIG.api.workerApiKey);
  }
  return apiClient;
}

async function getSupabase() {
  if (!supabase) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);
  }
  return supabase;
}

/**
 * Supabase Storage URL에서 이미지를 로컬 임시 파일로 다운로드
 */
async function downloadImages(
  generatedImages: { path: string; prompt: string; fileName?: string }[]
): Promise<{ path: string; prompt: string }[]> {
  if (!fs.existsSync(IMAGE_TEMP_DIR)) {
    fs.mkdirSync(IMAGE_TEMP_DIR, { recursive: true });
  }

  const downloaded: { path: string; prompt: string }[] = [];
  const MAX_RETRIES = 3;

  for (let i = 0; i < generatedImages.length; i++) {
    const img = generatedImages[i];
    let success = false;

    for (let retry = 0; retry < MAX_RETRIES && !success; retry++) {
      try {
        if (retry > 0) {
          console.log(`[Scheduler] 이미지 다운로드 재시도 (${retry + 1}/${MAX_RETRIES}): ${img.fileName || img.path}`);
          await new Promise(r => setTimeout(r, 2000 * retry)); // 점진적 대기
        }

        const response = await fetch(img.path, { signal: AbortSignal.timeout(30000) });
        if (!response.ok) {
          console.warn(`[Scheduler] 이미지 다운로드 실패 (HTTP ${response.status}): ${img.path}`);
          continue;
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        if (buffer.length < 100) {
          console.warn(`[Scheduler] 이미지 크기 비정상 (${buffer.length}B): ${img.path}`);
          continue;
        }
        const ext = path.extname(img.fileName || 'image.png') || '.png';
        const localPath = path.join(IMAGE_TEMP_DIR, `img_${Date.now()}_${i}${ext}`);
        fs.writeFileSync(localPath, buffer);
        downloaded.push({ path: localPath, prompt: img.prompt });
        console.log(`[Scheduler] 이미지 다운로드 완료 (${i + 1}/${generatedImages.length}): ${img.fileName || img.path} (${(buffer.length / 1024).toFixed(1)}KB)`);
        success = true;
      } catch (error) {
        console.warn(`[Scheduler] 이미지 다운로드 오류 (시도 ${retry + 1}): ${error instanceof Error ? error.message : error}`);
      }
    }

    if (!success) {
      console.error(`[Scheduler] 이미지 다운로드 최종 실패: ${img.fileName || img.path}`);
    }
  }

  return downloaded;
}

/**
 * 임시 이미지 파일 정리
 */
function cleanupTempImages(images: { path: string }[]): void {
  for (const img of images) {
    try { fs.unlinkSync(img.path); } catch { /* ignore */ }
  }
}

/**
 * 스케줄러 시작
 */
export function startScheduler(): void {
  const mode = isApiMode() ? 'API' : '레거시';
  console.log(`[Scheduler] 시작 (${CONFIG.worker.cronInterval}, 모드: ${mode})`);

  // 시작 직후 첫 번째 실행 (cron 대기 없이 즉시)
  setTimeout(async () => {
    console.log('[Scheduler] 초기 실행 시작...');
    try {
      await processScheduledItems();
    } catch (error) {
      console.error('[Scheduler] 초기 실행 오류:', error);
    }
  }, 3000); // 서버 초기화 대기 3초

  cron.schedule(CONFIG.worker.cronInterval, async () => {
    try {
      await processScheduledItems();
    } catch (error) {
      console.error('[Scheduler] 처리 오류:', error);
    }
  });
}

/**
 * 예약된 발행 항목 처리
 */
async function processScheduledItems(): Promise<void> {
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = nowKst.toISOString().split('T')[0];
  const timeKst = nowKst.toISOString().split('T')[1].slice(0, 5);

  console.log(`[Scheduler] 폴링 실행 (${today} ${timeKst} KST, 오늘 발행: ${dailyPublishCount}/${CONFIG.publishing.maxPostsPerDay}건)`);

  // 일일 카운터 리셋 (KST 기준)
  if (lastPublishDate !== today) {
    dailyPublishCount = 0;
    lastPublishDate = today;
  }

  if (dailyPublishCount >= CONFIG.publishing.maxPostsPerDay) {
    console.log(`[Scheduler] 하루 최대 발행 수(${CONFIG.publishing.maxPostsPerDay}건) 도달 - 대기`);
    return;
  }

  if (isApiMode()) {
    await processViaApi();
  } else {
    await processViaSupabase();
  }
}

/**
 * API 모드: 대시보드 API를 통해 발행 대상 조회 및 발행
 */
async function processViaApi(): Promise<void> {
  const client = getApiClient();

  console.log(`[Scheduler] API 폴링: ${CONFIG.api.dashboardUrl}/api/marketing/worker-api/poll`);
  const { nextItem, control } = await client.poll();
  console.log(`[Scheduler] API 응답: nextItem=${nextItem ? `"${nextItem.title}"` : '없음'}, headless=${control.headless}`);

  if (!nextItem) {
    console.log('[Scheduler] 발행 대상 없음 - 다음 폴링까지 대기');
    return;
  }

  console.log(`[Scheduler] 발행 대상: "${nextItem.title}" (${nextItem.publish_date} ${nextItem.publish_time})`);
  await publishItemApi(nextItem, control.headless);
}

/**
 * API 모드: 개별 항목 발행
 */
async function publishItemApi(item: ScheduledItem, headless = false): Promise<void> {
  const client = getApiClient();
  let downloadedImages: { path: string; prompt: string }[] = [];

  try {
    await client.updateItemStatus(item.id, 'generating');

    if (!item.generated_content) {
      console.warn(`[Scheduler] "${item.title}" - 생성된 콘텐츠 없음, 건너뜀`);
      await client.updateItemStatus(item.id, 'failed', { fail_reason: '생성된 콘텐츠가 없습니다.' });
      return;
    }

    let parsedContent: { title: string; body: string; hashtags?: string[] };
    try {
      parsedContent = JSON.parse(item.generated_content);
    } catch {
      parsedContent = { title: item.title, body: item.generated_content };
    }

    // 이미지 다운로드
    if (item.generated_images && item.generated_images.length > 0) {
      console.log(`[Scheduler] 이미지 ${item.generated_images.length}장 다운로드 시작...`);
      downloadedImages = await downloadImages(item.generated_images);
      console.log(`[Scheduler] 이미지 다운로드 완료: ${downloadedImages.length}/${item.generated_images.length}장`);
    }

    await client.updateItemStatus(item.id, 'publishing');

    const publishedUrls: Record<string, string> = {};

    if (item.platforms.naverBlog) {
      const blogConfig = await client.getPlatformSettings(item.clinic_id, 'naverBlog');

      if (!publisher) {
        publisher = new NaverBlogPublisher();
        await publisher.init(blogConfig ? {
          blogId: blogConfig.blogId || blogConfig.naverId || '',
          naverId: blogConfig.naverId,
          naverPassword: blogConfig.naverPassword,
          loginCookie: blogConfig.loginCookie,
        } : undefined, { headless });
      }

      const result = await publisher.publish({
        title: parsedContent.title,
        body: parsedContent.body,
        hashtags: parsedContent.hashtags,
        images: downloadedImages.length > 0 ? downloadedImages : undefined,
      });

      await client.logPublish({
        item_id: item.id,
        platform: 'naver_blog',
        status: result.success ? 'success' : 'failed',
        published_url: result.blogUrl,
        error_message: result.error,
        duration_seconds: result.durationSeconds,
        keyword: item.keyword || undefined,
        clinic_id: item.clinic_id,
      });

      if (result.success && result.blogUrl) {
        publishedUrls.naverBlog = result.blogUrl;
      } else if (!result.success) {
        throw new Error(`네이버 블로그 발행 실패: ${result.error}`);
      }
    }

    await client.updateItemStatus(item.id, 'published', { published_urls: publishedUrls });

    dailyPublishCount++;
    console.log(`[Scheduler] 발행 완료: "${item.title}" (오늘 ${dailyPublishCount}건)`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Scheduler] 발행 실패: "${item.title}"`, errorMessage);
    await client.updateItemStatus(item.id, 'failed', { fail_reason: errorMessage });
  } finally {
    if (downloadedImages.length > 0) cleanupTempImages(downloadedImages);
  }
}

// ─── 레거시 모드 (Supabase 직접 접속 - 하위 호환) ───

async function processViaSupabase(): Promise<void> {
  const sb = await getSupabase();

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentDate = kst.toISOString().split('T')[0];
  const currentTime = kst.toISOString().split('T')[1].slice(0, 5);

  console.log(`[Scheduler] Supabase 조회: date=${currentDate}, time=${currentTime}`);

  let { data: items, error } = await sb
    .from('content_calendar_items')
    .select(`*, content_calendars!inner(clinic_id, status)`)
    .in('status', ['approved', 'scheduled'])
    .eq('content_calendars.status', 'approved')
    .lt('publish_date', currentDate)
    .order('publish_date', { ascending: true })
    .order('publish_time', { ascending: true })
    .limit(1);

  if (!error && (!items || items.length === 0)) {
    const result = await sb
      .from('content_calendar_items')
      .select(`*, content_calendars!inner(clinic_id, status)`)
      .in('status', ['approved', 'scheduled'])
      .eq('content_calendars.status', 'approved')
      .eq('publish_date', currentDate)
      .lte('publish_time', currentTime)
      .order('publish_time', { ascending: true })
      .limit(1);
    items = result.data;
    error = result.error;
  }

  if (error) {
    console.error('[Scheduler] 조회 오류:', error.message);
    return;
  }
  if (!items?.length) {
    console.log('[Scheduler] 발행 대상 없음 - 다음 폴링까지 대기');
    return;
  }

  const item = items[0];
  console.log(`[Scheduler] 발행 대상: "${item.title}" (${item.publish_date} ${item.publish_time})`);
  await publishItemSupabase(item);
}

async function publishItemSupabase(item: Record<string, unknown>): Promise<void> {
  const sb = await getSupabase();
  const itemId = item.id as string;
  let downloadedImages: { path: string; prompt: string }[] = [];

  try {
    await sb.from('content_calendar_items').update({ status: 'generating' }).eq('id', itemId);

    const content = item.generated_content as string | null;
    if (!content) {
      await sb.from('content_calendar_items').update({ status: 'failed', fail_reason: '생성된 콘텐츠가 없습니다.' }).eq('id', itemId);
      return;
    }

    let parsedContent: { title: string; body: string; hashtags?: string[] };
    try { parsedContent = JSON.parse(content); } catch { parsedContent = { title: item.title as string, body: content }; }

    const generatedImages = item.generated_images as { path: string; prompt: string; fileName?: string }[] | null;
    if (generatedImages && generatedImages.length > 0) {
      console.log(`[Scheduler] 이미지 ${generatedImages.length}장 다운로드 시작...`);
      downloadedImages = await downloadImages(generatedImages);
      console.log(`[Scheduler] 이미지 다운로드 완료: ${downloadedImages.length}/${generatedImages.length}장`);
    }

    await sb.from('content_calendar_items').update({ status: 'publishing' }).eq('id', itemId);

    const platforms = item.platforms as Record<string, boolean>;
    const publishedUrls: Record<string, string> = {};

    if (platforms.naverBlog) {
      const clinicId = (item.content_calendars as Record<string, unknown>)?.clinic_id as string;
      const { data: platformSettings } = await sb
        .from('marketing_platform_settings')
        .select('config')
        .eq('clinic_id', clinicId)
        .eq('platform', 'naverBlog')
        .single();

      const blogConfig = platformSettings?.config as {
        blogId?: string; naverId?: string; naverPassword?: string; loginCookie?: string;
      } | null;

      if (!publisher) {
        publisher = new NaverBlogPublisher();
        await publisher.init(blogConfig ? {
          blogId: blogConfig.blogId || blogConfig.naverId || '',
          naverId: blogConfig.naverId,
          naverPassword: blogConfig.naverPassword,
          loginCookie: blogConfig.loginCookie,
        } : undefined);
      }

      const result = await publisher.publish({
        title: parsedContent.title,
        body: parsedContent.body,
        hashtags: parsedContent.hashtags,
        images: downloadedImages.length > 0 ? downloadedImages : undefined,
      });

      await sb.from('content_publish_logs').insert({
        item_id: itemId, platform: 'naver_blog',
        status: result.success ? 'success' : 'failed',
        published_url: result.blogUrl, error_message: result.error,
        duration_seconds: result.durationSeconds,
      });

      if (result.success && result.blogUrl) {
        publishedUrls.naverBlog = result.blogUrl;
      } else if (!result.success) {
        throw new Error(`네이버 블로그 발행 실패: ${result.error}`);
      }
    }

    await sb.from('content_calendar_items').update({ status: 'published', published_urls: publishedUrls }).eq('id', itemId);

    const keyword = item.keyword as string;
    const clinicId = (item.content_calendars as Record<string, unknown>)?.clinic_id as string;
    if (keyword && clinicId) {
      await sb.from('keyword_publish_history').upsert({
        clinic_id: clinicId, keyword,
        published_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0],
        item_id: itemId,
      }, { onConflict: 'clinic_id,keyword,published_at' });
    }

    dailyPublishCount++;
    console.log(`[Scheduler] 발행 완료: "${item.title}" (오늘 ${dailyPublishCount}건)`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Scheduler] 발행 실패: "${item.title}"`, errorMessage);
    await sb.from('content_calendar_items').update({ status: 'failed', fail_reason: errorMessage }).eq('id', itemId);
  } finally {
    if (downloadedImages.length > 0) cleanupTempImages(downloadedImages);
  }
}

/**
 * 즉시 발행 처리 (HTTP 트리거에서 호출)
 */
export async function processScheduledItemsOnce(): Promise<void> {
  try {
    await processScheduledItems();
  } catch (error) {
    console.error('[Scheduler] 즉시 처리 오류:', error);
  }
}

/**
 * 스케줄러 정리 (프로세스 종료 시)
 */
export async function stopScheduler(): Promise<void> {
  if (publisher) {
    await publisher.close();
    publisher = null;
  }
  console.log('[Scheduler] 종료');
}
