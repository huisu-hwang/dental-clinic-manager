import { createClient } from '@supabase/supabase-js';
import { CONFIG } from '../config.js';
import { NaverBlogPublisher } from './naver-blog-publisher.js';
import { MetaPublisher } from './meta-publisher.js';
import { ThreadsPublisher } from './threads-publisher.js';
import { randomDelay } from '../utils/delay.js';

// ============================================
// 배포 오케스트레이터
// 플랫폼별 순차 배포 (블로그 → 대기 → SNS)
// ============================================

const supabase = createClient(CONFIG.supabase.url, CONFIG.supabase.serviceRoleKey);

interface PlatformContent {
  naverBlog?: { title: string; body: string; hashtags?: string[]; images?: { path: string; prompt: string }[] };
  instagram?: { caption: string; imageUrls: string[] };
  facebook?: { message: string; link?: string };
  threads?: { text: string; imageUrl?: string; link?: string };
}

interface OrchestratorResult {
  publishedUrls: Record<string, string>;
  errors: Record<string, string>;
  allSuccess: boolean;
}

export class PublishOrchestrator {
  private naverPublisher: NaverBlogPublisher | null = null;
  private metaPublisher: MetaPublisher | null = null;
  private threadsPublisher: ThreadsPublisher | null = null;

  /**
   * 플랫폼별 순차 배포 실행
   * 1. 네이버 블로그 (Playwright, 5~10분)
   * 2. 대기 (snsDelayMinutes)
   * 3. 인스타그램 (Graph API)
   * 4. 페이스북 (Graph API)
   * 5. 쓰레드 (Threads API)
   */
  async publishAll(
    itemId: string,
    platforms: Record<string, boolean>,
    content: PlatformContent,
    snsDelayMinutes: number = 30
  ): Promise<OrchestratorResult> {
    const publishedUrls: Record<string, string> = {};
    const errors: Record<string, string> = {};

    // 1. 네이버 블로그
    if (platforms.naverBlog && content.naverBlog) {
      try {
        if (!this.naverPublisher) {
          this.naverPublisher = new NaverBlogPublisher();
          await this.naverPublisher.init();
        }

        const result = await this.naverPublisher.publish(content.naverBlog);
        await this.logPublish(itemId, 'naver_blog', result.success, result.blogUrl, result.error, result.durationSeconds);

        if (result.success && result.blogUrl) {
          publishedUrls.naverBlog = result.blogUrl;
        } else {
          errors.naverBlog = result.error || '발행 실패';
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.naverBlog = msg;
        await this.logPublish(itemId, 'naver_blog', false, undefined, msg, 0);
      }
    }

    // 2. SNS 배포 전 대기
    const hasSns = platforms.instagram || platforms.facebook || platforms.threads;
    if (hasSns && Object.keys(publishedUrls).length > 0) {
      console.log(`[Orchestrator] SNS 배포 대기: ${snsDelayMinutes}분`);
      await new Promise((resolve) => setTimeout(resolve, snsDelayMinutes * 60 * 1000));
    }

    // 블로그 URL (SNS에서 링크로 사용)
    const blogUrl = publishedUrls.naverBlog || '';

    // 3. 인스타그램
    if (platforms.instagram && content.instagram) {
      try {
        await this.initMetaPublisher();
        if (this.metaPublisher) {
          const imageUrls = content.instagram.imageUrls;
          const result = imageUrls.length > 1
            ? await this.metaPublisher.publishInstagramCarousel(imageUrls, content.instagram.caption)
            : await this.metaPublisher.publishInstagramSingle(imageUrls[0] || '', content.instagram.caption);

          await this.logPublish(itemId, 'instagram', result.success, result.postUrl, result.error, 0);

          if (result.success) {
            publishedUrls.instagram = result.postUrl || result.postId || '';
          } else {
            errors.instagram = result.error || '발행 실패';
          }
        }
      } catch (error) {
        errors.instagram = error instanceof Error ? error.message : String(error);
      }

      await randomDelay({ min: 5000, max: 10000 }); // SNS 간 짧은 대기
    }

    // 4. 페이스북
    if (platforms.facebook && content.facebook) {
      try {
        await this.initMetaPublisher();
        if (this.metaPublisher) {
          const message = content.facebook.message;
          const link = content.facebook.link || blogUrl;
          const result = await this.metaPublisher.publishFacebook(message, link);

          await this.logPublish(itemId, 'facebook', result.success, result.postUrl, result.error, 0);

          if (result.success) {
            publishedUrls.facebook = result.postUrl || result.postId || '';
          } else {
            errors.facebook = result.error || '발행 실패';
          }
        }
      } catch (error) {
        errors.facebook = error instanceof Error ? error.message : String(error);
      }

      await randomDelay({ min: 5000, max: 10000 });
    }

    // 5. 쓰레드
    if (platforms.threads && content.threads) {
      try {
        await this.initThreadsPublisher();
        if (this.threadsPublisher) {
          const link = content.threads.link || blogUrl;
          const result = content.threads.imageUrl
            ? await this.threadsPublisher.publishWithImage(content.threads.text, content.threads.imageUrl, link)
            : await this.threadsPublisher.publishText(content.threads.text, link);

          await this.logPublish(itemId, 'threads', result.success, result.postUrl, result.error, 0);

          if (result.success) {
            publishedUrls.threads = result.postUrl || result.postId || '';
          } else {
            errors.threads = result.error || '발행 실패';
          }
        }
      } catch (error) {
        errors.threads = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      publishedUrls,
      errors,
      allSuccess: Object.keys(errors).length === 0,
    };
  }

  private async initMetaPublisher(): Promise<void> {
    if (this.metaPublisher) return;
    const token = process.env.META_ACCESS_TOKEN;
    const igId = process.env.META_INSTAGRAM_ACCOUNT_ID;
    const fbId = process.env.META_FACEBOOK_PAGE_ID;
    if (token && igId && fbId) {
      this.metaPublisher = new MetaPublisher({
        accessToken: token,
        instagramAccountId: igId,
        facebookPageId: fbId,
      });
    }
  }

  private async initThreadsPublisher(): Promise<void> {
    if (this.threadsPublisher) return;
    const token = process.env.THREADS_ACCESS_TOKEN;
    const userId = process.env.THREADS_USER_ID;
    if (token && userId) {
      this.threadsPublisher = new ThreadsPublisher({
        accessToken: token,
        userId,
      });
    }
  }

  private async logPublish(
    itemId: string,
    platform: string,
    success: boolean,
    url?: string,
    error?: string,
    duration?: number
  ): Promise<void> {
    await supabase.from('content_publish_logs').insert({
      item_id: itemId,
      platform,
      status: success ? 'success' : 'failed',
      published_url: url,
      error_message: error,
      duration_seconds: duration || 0,
    });
  }

  async close(): Promise<void> {
    if (this.naverPublisher) {
      await this.naverPublisher.close();
      this.naverPublisher = null;
    }
  }
}
