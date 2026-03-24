import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { CONFIG } from './config.js';
import { NaverBlogPublisher } from './publisher/naver-blog-publisher.js';

// ============================================
// 자동 발행 스케줄러
// 매 5분마다 승인된 항목 중 발행 시간이 된 것을 자동 발행
// ============================================

const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);

const IMAGE_TEMP_DIR = '/tmp/marketing-images-publish';

let publisher: NaverBlogPublisher | null = null;
let dailyPublishCount = 0;
let lastPublishDate = '';

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

  for (let i = 0; i < generatedImages.length; i++) {
    const img = generatedImages[i];
    try {
      const response = await fetch(img.path);
      if (!response.ok) {
        console.warn(`[Scheduler] 이미지 다운로드 실패 (${response.status}): ${img.path}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = path.extname(img.fileName || 'image.png') || '.png';
      const localPath = path.join(IMAGE_TEMP_DIR, `img_${Date.now()}_${i}${ext}`);
      fs.writeFileSync(localPath, buffer);
      downloaded.push({ path: localPath, prompt: img.prompt });
      console.log(`[Scheduler] 이미지 다운로드 완료 (${i + 1}/${generatedImages.length}): ${img.fileName || img.path}`);
    } catch (error) {
      console.warn(`[Scheduler] 이미지 다운로드 오류: ${error instanceof Error ? error.message : error}`);
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
  console.log(`[Scheduler] 시작 (${CONFIG.worker.cronInterval})`);

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
  // 일일 카운터 리셋 (KST 기준)
  const todayKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const today = todayKst.toISOString().split('T')[0];
  if (lastPublishDate !== today) {
    dailyPublishCount = 0;
    lastPublishDate = today;
  }

  // 하루 최대 3건 제한
  if (dailyPublishCount >= CONFIG.publishing.maxPostsPerDay) {
    return;
  }

  // 현재 시간 기준 발행 대상 조회 (KST 기준)
  // 1차: 과거 날짜 항목 (시간 무관, 즉시 발행)
  // 2차: 오늘 날짜 + 발행 시간 지난 항목
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000); // UTC+9
  const currentDate = kst.toISOString().split('T')[0];
  const currentTime = kst.toISOString().split('T')[1].slice(0, 5); // HH:MM (KST)

  // 1차: 과거 날짜 항목
  let { data: items, error } = await supabase
    .from('content_calendar_items')
    .select(`
      *,
      content_calendars!inner(clinic_id, status)
    `)
    .in('status', ['approved', 'scheduled'])
    .eq('content_calendars.status', 'approved')
    .lt('publish_date', currentDate)
    .order('publish_date', { ascending: true })
    .order('publish_time', { ascending: true })
    .limit(1);

  // 2차: 오늘 날짜 + 시간 지난 항목
  if (!error && (!items || items.length === 0)) {
    const result = await supabase
      .from('content_calendar_items')
      .select(`
        *,
        content_calendars!inner(clinic_id, status)
      `)
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
    console.log(`[Scheduler] 발행 대상 없음 (date: ${currentDate}, time: ${currentTime})`);
    return;
  }

  const item = items[0];
  console.log(`[Scheduler] 발행 대상: "${item.title}" (${item.publish_date} ${item.publish_time})`);

  await publishItem(item);
}

/**
 * 개별 항목 발행 처리
 */
async function publishItem(item: Record<string, unknown>): Promise<void> {
  const itemId = item.id as string;
  let downloadedImages: { path: string; prompt: string }[] = [];

  try {
    // 1. 상태 → generating
    await updateItemStatus(itemId, 'generating');

    // 2. 생성된 콘텐츠 확인 (없으면 스킵 - 수동 생성 필요)
    const content = item.generated_content as string | null;
    if (!content) {
      console.warn(`[Scheduler] "${item.title}" - 생성된 콘텐츠 없음, 건너뜀`);
      await updateItemStatus(itemId, 'failed', '생성된 콘텐츠가 없습니다. 수동으로 글을 생성해주세요.');
      return;
    }

    let parsedContent: { title: string; body: string; hashtags?: string[] };
    try {
      parsedContent = JSON.parse(content);
    } catch {
      parsedContent = { title: item.title as string, body: content };
    }

    // 3. 이미지 다운로드 (generated_images가 있는 경우)
    const generatedImages = item.generated_images as { path: string; prompt: string; fileName?: string }[] | null;
    if (generatedImages && generatedImages.length > 0) {
      console.log(`[Scheduler] 이미지 ${generatedImages.length}장 다운로드 시작...`);
      downloadedImages = await downloadImages(generatedImages);
      console.log(`[Scheduler] 이미지 다운로드 완료: ${downloadedImages.length}/${generatedImages.length}장`);
    }

    // 4. 상태 → publishing
    await updateItemStatus(itemId, 'publishing');

    // 5. 플랫폼별 발행
    const platforms = item.platforms as Record<string, boolean>;
    const publishedUrls: Record<string, string> = {};

    // 네이버 블로그 발행
    if (platforms.naverBlog) {
      // DB에서 플랫폼 설정 조회
      const clinicId = (item.content_calendars as Record<string, unknown>)?.clinic_id as string;
      const { data: platformSettings } = await supabase
        .from('marketing_platform_settings')
        .select('config')
        .eq('clinic_id', clinicId)
        .eq('platform', 'naverBlog')
        .single();

      const blogConfig = platformSettings?.config as {
        blogId?: string;
        naverId?: string;
        naverPassword?: string;
        loginCookie?: string;
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

      // 발행 로그 기록
      await supabase.from('content_publish_logs').insert({
        item_id: itemId,
        platform: 'naver_blog',
        status: result.success ? 'success' : 'failed',
        published_url: result.blogUrl,
        error_message: result.error,
        duration_seconds: result.durationSeconds,
      });

      if (result.success && result.blogUrl) {
        publishedUrls.naverBlog = result.blogUrl;
      } else if (!result.success) {
        throw new Error(`네이버 블로그 발행 실패: ${result.error}`);
      }
    }

    // SNS는 Phase 4에서 구현 (지연 발행)
    // if (platforms.instagram) { ... }
    // if (platforms.facebook) { ... }
    // if (platforms.threads) { ... }

    // 5. 완료 처리
    await supabase
      .from('content_calendar_items')
      .update({
        status: 'published',
        published_urls: publishedUrls,
      })
      .eq('id', itemId);

    // 6. 키워드 이력 기록
    const keyword = item.keyword as string;
    const clinicId = (item.content_calendars as Record<string, unknown>)?.clinic_id as string;
    if (keyword && clinicId) {
      await supabase.from('keyword_publish_history').upsert({
        clinic_id: clinicId,
        keyword,
        published_at: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0],
        item_id: itemId,
      }, { onConflict: 'clinic_id,keyword,published_at' });
    }

    dailyPublishCount++;
    console.log(`[Scheduler] 발행 완료: "${item.title}" (오늘 ${dailyPublishCount}건)`);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Scheduler] 발행 실패: "${item.title}"`, errorMessage);
    await updateItemStatus(itemId, 'failed', errorMessage);
  } finally {
    // 임시 이미지 파일 정리
    if (downloadedImages.length > 0) {
      cleanupTempImages(downloadedImages);
    }
  }
}

/**
 * 항목 상태 업데이트
 */
async function updateItemStatus(
  itemId: string,
  status: string,
  failReason?: string
): Promise<void> {
  const update: Record<string, unknown> = { status };
  if (failReason) update.fail_reason = failReason;

  await supabase
    .from('content_calendar_items')
    .update(update)
    .eq('id', itemId);
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
