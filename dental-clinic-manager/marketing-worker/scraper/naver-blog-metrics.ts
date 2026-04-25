import { type Browser, type Page } from 'playwright';
import { launchChromiumWithAutoInstall } from '../utils/playwright-launch.js';

// ============================================
// 네이버 블로그 KPI 스크래퍼
// - 게시글 URL 방문 → 조회수·공감·댓글·스크랩 추출
// - 익명 접근 (로그인 불필요) — 조회수 공개 영역만 사용
// - 페이지 구조 변경에 대비해 여러 selector 시도
// ============================================

export interface NaverBlogMetrics {
  views: number | null;
  comments: number | null;
  likes: number | null;     // 공감수
  scraps: number | null;    // 스크랩수
  raw_payload?: Record<string, unknown>;
}

export class NaverBlogMetricsScraper {
  private browser: Browser | null = null;

  async init(headless: boolean = true): Promise<void> {
    this.browser = await launchChromiumWithAutoInstall({
      headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });
  }

  /**
   * 단건 스크래핑
   * @param blogUrl 네이버 블로그 게시글 URL
   *   예: https://blog.naver.com/whitedc0902/223234567890
   */
  async scrape(blogUrl: string): Promise<NaverBlogMetrics> {
    if (!this.browser) throw new Error('init() 호출 필요');

    const context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    const page = await context.newPage();

    try {
      await page.goto(blogUrl, { waitUntil: 'networkidle', timeout: 30000 });

      // 네이버 블로그는 iframe 내부에 본문이 들어가 있는 경우가 많음
      const frame =
        page.frame({ name: 'mainFrame' }) ||
        page.frames().find((f) => f.url().includes('PostView'));
      const target = frame || page;

      const metrics: NaverBlogMetrics = {
        views: null,
        comments: null,
        likes: null,
        scraps: null,
      };

      // 조회수 — 여러 selector 시도
      metrics.views = await firstNumber(target, [
        '.area_visitor .num',                    // 모바일/일부 PC
        '.blog_count .num',                      // 변종
        '.post_view_count em, .post_view_count', // 신 에디터
        'em.post_count',                         // 신 에디터 변종
        'span.btn_visit_count em',
      ]);

      // 댓글
      metrics.comments = await firstNumber(target, [
        '#commentCount',
        '.btn_comment em',
        'em.u_cnt',
        '.area_comment .num',
      ]);

      // 공감
      metrics.likes = await firstNumber(target, [
        '.u_likeit_text._count',
        '#viewCntLayer .num',
        'em.u_likeit_list_module__count',
        '.like .num',
      ]);

      // 스크랩
      metrics.scraps = await firstNumber(target, [
        '.area_subscribe .num',
        'em.scrap_count',
        '.btn_scrap em',
      ]);

      // 디버깅용 raw payload (제목·URL)
      const title = await target.title().catch(() => '');
      metrics.raw_payload = { url: blogUrl, page_title: title };

      return metrics;
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

/**
 * 여러 selector를 순회하며 처음으로 매칭되는 숫자를 반환
 * - 텍스트에서 콤마/공백 제거 후 정수 변환
 */
async function firstNumber(
  ctx: import('playwright').Page | import('playwright').Frame,
  selectors: string[]
): Promise<number | null> {
  for (const sel of selectors) {
    try {
      const el = ctx.locator(sel).first();
      if ((await el.count()) === 0) continue;
      const txt = (await el.innerText({ timeout: 2000 })).trim();
      const num = parseInt(txt.replace(/[,\s]/g, ''), 10);
      if (!Number.isNaN(num)) return num;
    } catch {
      continue;
    }
  }
  return null;
}
