import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { CONFIG } from '../config.js';
import { randomDelay } from '../utils/delay.js';
import {
  humanType,
  humanTypeInto,
  typeBodyContent,
  typeHashtags,
  waitForPageStable,
  handlePopups,
} from '../typing-simulator.js';

// ============================================
// 네이버 블로그 자동 발행기
// Playwright 기반, 체류시간 확보 전략 적용
//
// 포스팅 1건 목표 소요시간: 5~10분
// - 복사 붙여넣기 절대 금지 → 한 글자씩 타이핑
// - 모든 동작에 랜덤 딜레이
// ============================================

const { delays } = CONFIG;

interface PublishResult {
  success: boolean;
  blogUrl?: string;
  error?: string;
  durationSeconds: number;
}

interface BlogPostData {
  title: string;
  body: string;
  category?: string;
  hashtags?: string[];
  images?: { path: string; prompt: string }[];
}

interface NaverBlogConfig {
  blogId: string;
  naverId?: string;
  naverPassword?: string;
  loginCookie?: string;
}

export class NaverBlogPublisher {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private blogConfig: NaverBlogConfig | null = null;

  /**
   * 브라우저 인스턴스 시작
   * @param config DB에서 가져온 블로그 설정 (없으면 환경변수 사용)
   */
  async init(config?: NaverBlogConfig): Promise<void> {
    // DB 설정 우선, 없으면 환경변수 폴백
    this.blogConfig = config || {
      blogId: CONFIG.naver.blogId,
      loginCookie: CONFIG.naver.loginCookie,
    };

    if (!this.blogConfig.blogId) {
      throw new Error('블로그 ID가 설정되지 않았습니다. 마케팅 설정에서 블로그 ID를 입력해주세요.');
    }

    this.browser = await chromium.launch({
      headless: false, // 네이버 봇 감지 방지: headful 모드
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
      ],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    // 네이버 로그인 쿠키 복원
    const cookieStr = this.blogConfig.loginCookie || CONFIG.naver.loginCookie;
    if (cookieStr) {
      try {
        const cookies = JSON.parse(cookieStr);
        await this.context.addCookies(cookies);
      } catch (e) {
        console.error('[NaverBlog] 쿠키 파싱 실패:', e);
      }
    }

    console.log(`[NaverBlog] 초기화 완료 (blogId: ${this.blogConfig.blogId})`);
  }

  /**
   * 브라우저 종료
   */
  async close(): Promise<void> {
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.context = null;
    this.browser = null;
  }

  /**
   * 블로그 글 발행
   */
  async publish(postData: BlogPostData): Promise<PublishResult> {
    const startTime = Date.now();

    if (!this.context) {
      await this.init();
    }

    const page = await this.context!.newPage();

    try {
      // 1. 글쓰기 페이지 진입
      await this.navigateToEditor(page);

      // 2. 팝업 처리
      await handlePopups(page);

      // 3. 카테고리 선택 (있는 경우)
      if (postData.category) {
        await this.selectCategory(page, postData.category);
      }

      // 4. 제목 입력
      await this.typeTitle(page, postData.title);

      // 5. 본문 입력 (타이핑 시뮬레이션 + 이미지 삽입)
      await this.typeBody(page, postData.body, postData.images);

      // 6. 해시태그 입력
      if (postData.hashtags && postData.hashtags.length > 0) {
        await this.addHashtags(page, postData.hashtags);
      }

      // 7. 발행
      const blogUrl = await this.clickPublish(page);

      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      console.log(`[NaverBlog] 발행 완료 (${durationSeconds}초): ${blogUrl}`);

      return {
        success: true,
        blogUrl,
        durationSeconds,
      };
    } catch (error) {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[NaverBlog] 발행 실패 (${durationSeconds}초):`, errorMessage);

      return {
        success: false,
        error: errorMessage,
        durationSeconds,
      };
    } finally {
      await page.close();
    }
  }

  // ─── 내부 메서드 ───

  /**
   * 글쓰기 페이지로 이동
   */
  private async navigateToEditor(page: Page): Promise<void> {
    const blogId = this.blogConfig?.blogId || CONFIG.naver.blogId;
    if (!blogId) {
      throw new Error('블로그 ID가 설정되지 않았습니다.');
    }
    const editorUrl = `https://blog.naver.com/${blogId}/postwrite`;

    await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await waitForPageStable(page);

    // 로그인 확인
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('nid.naver.com')) {
      throw new Error('네이버 로그인이 필요합니다. 쿠키를 갱신해주세요.');
    }

    console.log('[NaverBlog] 에디터 페이지 진입 완료');
  }

  /**
   * 카테고리 선택
   */
  private async selectCategory(page: Page, category: string): Promise<void> {
    try {
      // 카테고리 드롭다운 클릭
      const categoryButton = page.locator('.publish_category_btn, [class*="category"]').first();
      if (await categoryButton.isVisible({ timeout: 3000 })) {
        await categoryButton.click();
        await randomDelay(delays.popupHandle);

        // 카테고리 항목 선택
        const categoryItem = page.locator(`text="${category}"`).first();
        if (await categoryItem.isVisible({ timeout: 2000 })) {
          await categoryItem.click();
          await randomDelay(delays.templateApply);
        }
      }
    } catch {
      console.warn(`[NaverBlog] 카테고리 "${category}" 선택 실패, 건너뜀`);
    }
  }

  /**
   * 제목 입력 (타이핑 시뮬레이션)
   */
  private async typeTitle(page: Page, title: string): Promise<void> {
    // 제목 입력 영역 클릭
    const titleSelector = '.se-title-text, [class*="title"] [contenteditable]';
    await page.click(titleSelector);
    await randomDelay(delays.titleToBody);

    // 한 글자씩 타이핑
    await humanType(page, title);

    console.log(`[NaverBlog] 제목 입력 완료: "${title}"`);
    await randomDelay(delays.titleToBody);
  }

  /**
   * 본문 입력 (타이핑 시뮬레이션 + 이미지 삽입)
   */
  private async typeBody(
    page: Page,
    body: string,
    images?: { path: string; prompt: string }[]
  ): Promise<void> {
    // 본문 영역 클릭
    const bodySelector = '.se-text-paragraph, [class*="content"] [contenteditable]';
    await page.click(bodySelector);
    await randomDelay(delays.titleToBody);

    let imageIndex = 0;

    // [IMAGE: ...] 마커 위치에서 이미지 삽입
    await typeBodyContent(page, body, async (prompt: string) => {
      if (images && imageIndex < images.length) {
        await this.insertImage(page, images[imageIndex].path);
        imageIndex++;
      }
    });

    console.log(`[NaverBlog] 본문 입력 완료 (이미지 ${imageIndex}장 삽입)`);
  }

  /**
   * 이미지 삽입 (클립보드 붙여넣기 우선, 파일 업로드 폴백)
   */
  private async insertImage(page: Page, imagePath: string): Promise<void> {
    try {
      // 1순위: 클립보드 붙여넣기 (가장 자연스러움)
      await this.pasteImageFromClipboard(page, imagePath);
    } catch {
      // 2순위: 파일 업로드
      console.warn('[NaverBlog] 클립보드 붙여넣기 실패, 파일 업로드 시도');
      await this.uploadImageViaFileInput(page, imagePath);
    }

    // 업로드 완료 대기
    await randomDelay(delays.imageUpload);
  }

  /**
   * 클립보드 붙여넣기 방식 이미지 삽입
   */
  private async pasteImageFromClipboard(page: Page, imagePath: string): Promise<void> {
    const fs = await import('fs');
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');

    await page.evaluate(async (b64: string) => {
      const res = await fetch(`data:image/png;base64,${b64}`);
      const blob = await res.blob();

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([blob], 'image.png', { type: 'image/png' }));

      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dataTransfer,
      });

      const editor = document.querySelector(
        '.se-text-paragraph, [contenteditable="true"]'
      );
      editor?.dispatchEvent(pasteEvent);
    }, base64Image);

    // 이미지 로딩 대기
    try {
      await page.waitForSelector('.se-image-resource, .se-module-image', {
        timeout: 15000,
      });
    } catch {
      throw new Error('이미지 로딩 타임아웃');
    }
  }

  /**
   * 파일 업로드 방식 이미지 삽입 (폴백)
   */
  private async uploadImageViaFileInput(page: Page, imagePath: string): Promise<void> {
    // 이미지 버튼 클릭
    const imageButton = page.locator(
      'button[class*="image"], .se-toolbar-button-image, [data-name="image"]'
    ).first();
    await imageButton.click();
    await randomDelay(delays.popupHandle);

    // 파일 input에 설정
    const fileInput = page.locator('input[type="file"][accept*="image"]').first();
    await fileInput.setInputFiles(imagePath);

    // 업로드 완료 대기
    try {
      await page.waitForSelector('.se-image-resource, .se-module-image', {
        timeout: 30000,
      });
    } catch {
      console.warn('[NaverBlog] 이미지 업로드 타임아웃');
    }
  }

  /**
   * 해시태그 입력
   */
  private async addHashtags(page: Page, hashtags: string[]): Promise<void> {
    try {
      // 태그 입력 영역 클릭
      const tagSelector = '.se-tag-input, [placeholder*="태그"], [class*="tag"] input';
      const tagInput = page.locator(tagSelector).first();

      if (await tagInput.isVisible({ timeout: 3000 })) {
        await tagInput.click();
        await randomDelay(delays.titleToBody);
        await typeHashtags(page, hashtags.slice(0, 10)); // 최대 10개
        console.log(`[NaverBlog] 해시태그 ${Math.min(hashtags.length, 10)}개 입력 완료`);
      }
    } catch {
      console.warn('[NaverBlog] 해시태그 입력 실패, 건너뜀');
    }
  }

  /**
   * 발행 버튼 클릭
   */
  private async clickPublish(page: Page): Promise<string> {
    // 최종 확인 대기 (사람이 글을 다시 읽는 시간)
    await randomDelay(delays.beforeSave);

    // 발행 버튼 클릭
    const publishButton = page.locator(
      'button:has-text("발행"), button:has-text("등록"), .publish_btn__Y9Ldv'
    ).first();
    await publishButton.click();

    await randomDelay(delays.popupHandle);

    // 발행 확인 팝업에서 "발행" 클릭 (있는 경우)
    try {
      const confirmButton = page.locator(
        '.confirm_btn:has-text("발행"), button:has-text("확인")'
      ).first();
      if (await confirmButton.isVisible({ timeout: 3000 })) {
        await confirmButton.click();
      }
    } catch {
      // 확인 팝업이 없을 수 있음
    }

    // 발행 완료 대기
    await randomDelay(delays.afterSave);

    // 발행된 글 URL 추출
    const currentUrl = page.url();
    if (currentUrl.includes('/postwrite')) {
      // 아직 에디터에 있으면 발행 실패
      throw new Error('발행 버튼 클릭 후에도 에디터 페이지에 머물러 있습니다');
    }

    console.log(`[NaverBlog] 발행 URL: ${currentUrl}`);
    return currentUrl;
  }
}
