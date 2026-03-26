import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { CONFIG } from '../config.js';
import { randomDelay } from '../utils/delay.js';
import {
  humanType,
  typeBodyContent,
  typeHashtags,
  waitForPageStable,
  handleDraftPopup,
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
   */
  private headless = false;

  async init(config?: NaverBlogConfig, options?: { headless?: boolean }): Promise<void> {
    this.blogConfig = config || {
      blogId: CONFIG.naver.blogId,
      loginCookie: CONFIG.naver.loginCookie,
    };

    if (options?.headless !== undefined) this.headless = options.headless;

    if (!this.blogConfig.blogId) {
      throw new Error('블로그 ID가 설정되지 않았습니다. 마케팅 설정에서 블로그 ID를 입력해주세요.');
    }

    this.browser = await chromium.launch({
      headless: this.headless,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });

    // 저장된 쿠키 파일 로드
    try {
      const fs = await import('fs');
      const path = await import('path');
      const cookiePath = path.join(import.meta.dirname, '..', 'naver-cookies.json');
      if (fs.existsSync(cookiePath)) {
        const cookies = JSON.parse(fs.readFileSync(cookiePath, 'utf-8'));
        await this.context.addCookies(cookies);
        console.log(`[NaverBlog] 저장된 쿠키 로드 (${cookies.length}개)`);
      }
    } catch { /* 쿠키 파일 없으면 무시 */ }

    // DB 쿠키 로드
    const cookieStr = this.blogConfig.loginCookie || CONFIG.naver.loginCookie;
    if (cookieStr) {
      try {
        const cookies = JSON.parse(cookieStr);
        await this.context.addCookies(cookies);
      } catch { /* 파싱 실패 무시 */ }
    }

    console.log(`[NaverBlog] 초기화 완료 (blogId: ${this.blogConfig.blogId})`);
  }

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
    if (!this.context) await this.init();
    const page = await this.context!.newPage();

    try {
      // 1. 에디터 진입 (로그인 + 임시저장 팝업 처리)
      await this.navigateToEditor(page);

      // 2. 카테고리 선택
      if (postData.category) await this.selectCategory(page, postData.category);

      // 3. 제목 입력
      await this.typeTitle(page, postData.title);

      // 4. 본문 입력 (소제목 스타일 + 이미지 포함)
      await this.typeBody(page, postData.body, postData.images);

      // 5. 발행 (상단 발행 → 태그 → 최종 발행)
      const blogUrl = await this.clickPublish(page, postData.hashtags);

      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      console.log(`[NaverBlog] 발행 완료 (${durationSeconds}초): ${blogUrl}`);
      return { success: true, blogUrl, durationSeconds };
    } catch (error) {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[NaverBlog] 발행 실패 (${durationSeconds}초):`, errorMessage);
      try { await page.screenshot({ path: `/tmp/naver-error-${Date.now()}.png` }); } catch { /* ignore */ }
      return { success: false, error: errorMessage, durationSeconds };
    } finally {
      await page.close();
    }
  }

  // ─── 내부 메서드 ───

  /**
   * 에디터 진입 (로그인 + 임시저장 팝업 처리)
   */
  private async navigateToEditor(page: Page): Promise<void> {
    const blogId = this.blogConfig?.blogId || CONFIG.naver.blogId;
    if (!blogId) throw new Error('블로그 ID가 설정되지 않았습니다.');

    const editorUrl = `https://blog.naver.com/${blogId}/postwrite`;
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
    await waitForPageStable(page);

    // 로그인 필요 시
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('nid.naver.com')) {
      console.log('[NaverBlog] 로그인 필요 감지');
      await this.performLogin(page);
      await page.goto(editorUrl, { waitUntil: 'domcontentloaded' });
      await waitForPageStable(page);
      if (page.url().includes('login') || page.url().includes('nid.naver.com')) {
        throw new Error('네이버 로그인에 실패했습니다.');
      }
    }

    // [FIX #2] 임시저장 복원 팝업 → "아니오" 클릭
    await handleDraftPopup(page);
    console.log('[NaverBlog] 에디터 페이지 진입 완료');
  }

  /**
   * [FIX #1] ID/PW 로그인 + 비밀번호 오류 감지
   */
  private async performLogin(page: Page): Promise<void> {
    const naverId = this.blogConfig?.naverId;
    const naverPassword = this.blogConfig?.naverPassword;
    if (!naverId || !naverPassword) {
      throw new Error('네이버 로그인 정보(ID/PW)가 설정되지 않았습니다.');
    }

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });

    await page.goto('https://nid.naver.com/nidlogin.login', { waitUntil: 'networkidle' });
    await randomDelay(delays.pageLoad);

    // ID 입력
    console.log('[NaverBlog] ID 입력 중...');
    await page.click('#id');
    await randomDelay({ min: 200, max: 400 });
    await page.keyboard.type(naverId, { delay: 50 });
    await randomDelay({ min: 300, max: 600 });

    // PW 입력
    console.log('[NaverBlog] PW 입력 중...');
    await page.click('#pw');
    await randomDelay({ min: 200, max: 400 });
    await page.keyboard.type(naverPassword, { delay: 50 });
    await randomDelay({ min: 300, max: 600 });

    // 로그인 클릭
    await page.locator('button[type="submit"].btn_login, #log\\.login').first().click();
    console.log('[NaverBlog] 로그인 버튼 클릭');

    // 10초 대기 후 결과 확인
    await page.waitForTimeout(10000);

    if (page.url().includes('login') || page.url().includes('nid.naver.com')) {
      const html = await page.content();

      // [FIX #1] 비밀번호 오류 감지
      if (html.includes('비밀번호가 틀렸') || html.includes('비밀번호를 잘못') ||
          html.includes('비밀번호가 일치하지') || html.includes('아이디 또는 비밀번호')) {
        throw new Error('WRONG_PASSWORD: 네이버 비밀번호가 잘못되었습니다. 마케팅 설정에서 비밀번호를 확인해주세요.');
      }

      // 캡차/기기인증 대기
      if (html.includes('자동입력') || html.includes('captcha') ||
          html.includes('새로운 환경') || html.includes('기기')) {
        console.log('[NaverBlog] 캡차/기기인증 감지, 수동 해결 대기 (최대 120초)...');
        for (let i = 0; i < 60; i++) {
          await page.waitForTimeout(2000);
          if (!page.url().includes('nidlogin') && !page.url().includes('login')) break;
        }
      }
    }

    if (page.url().includes('login') || page.url().includes('nid.naver.com')) {
      throw new Error('네이버 로그인 실패. 캡차 또는 기기인증이 필요할 수 있습니다.');
    }

    console.log('[NaverBlog] 로그인 성공');

    // 쿠키 저장
    if (this.context) {
      try {
        const cookies = await this.context.cookies();
        const fs = await import('fs');
        const path = await import('path');
        fs.writeFileSync(
          path.join(import.meta.dirname, '..', 'naver-cookies.json'),
          JSON.stringify(cookies, null, 2)
        );
        console.log(`[NaverBlog] 쿠키 저장 (${cookies.length}개)`);
      } catch { /* ignore */ }
    }
  }

  private async selectCategory(page: Page, category: string): Promise<void> {
    try {
      const btn = page.locator('[class*="category"] button, button[class*="category"]').first();
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
        await randomDelay(delays.popupHandle);
        const item = page.locator(`text="${category}"`).first();
        if (await item.isVisible({ timeout: 2000 })) {
          await item.click();
          await randomDelay(delays.templateApply);
        }
      }
    } catch {
      console.warn(`[NaverBlog] 카테고리 "${category}" 선택 실패, 건너뜀`);
    }
  }

  /**
   * [FIX #3] 제목만 제목란에 입력
   */
  private async typeTitle(page: Page, title: string): Promise<void> {
    // 정확한 제목 영역 셀렉터
    const titleSelector = '.se-documentTitle .se-text-paragraph';
    await page.click(titleSelector, { timeout: 10000 });
    await randomDelay(delays.titleToBody);
    await humanType(page, title);
    console.log(`[NaverBlog] 제목 입력 완료: "${title}"`);
    await randomDelay(delays.titleToBody);
  }

  /**
   * [FIX #3, #4, #6] 본문 입력 (본문 영역에 정확히 입력 + 이미지 + 소제목)
   */
  private async typeBody(
    page: Page,
    body: string,
    images?: { path: string; prompt: string }[]
  ): Promise<void> {
    // [FIX #3] 본문 영역으로 정확히 이동
    try {
      const bodySelector = '.se-component.se-text .se-text-paragraph';
      await page.click(bodySelector, { timeout: 5000 });
    } catch {
      // 폴백: Tab으로 이동
      console.log('[NaverBlog] 본문 직접 클릭 실패, Tab으로 이동');
      await page.keyboard.press('Tab');
      await page.waitForTimeout(1000);
    }
    await randomDelay(delays.titleToBody);

    let imageIndex = 0;

    await typeBodyContent(
      page,
      body,
      // [FIX #4] 이미지 삽입
      async (_prompt: string) => {
        if (images && imageIndex < images.length) {
          await this.insertImage(page, images[imageIndex].path);
          imageIndex++;
        }
      },
      // [FIX #6] 소제목 스타일 전환
      async (headingText: string) => {
        await this.applyHeadingStyle(page);
        await humanType(page, headingText);
        await page.keyboard.press('Enter');
        await this.restoreBodyStyle(page);
      }
    );

    console.log(`[NaverBlog] 본문 입력 완료 (이미지 ${imageIndex}장 삽입)`);
  }

  /**
   * [FIX #6] "본문" 드롭다운 → "소제목" 선택
   */
  private async applyHeadingStyle(page: Page): Promise<void> {
    try {
      // "본문" 문단 서식 드롭다운 버튼 클릭
      const styleBtn = page.locator('button.se-text-format-toolbar-button').first();
      if (await styleBtn.isVisible({ timeout: 3000 })) {
        await styleBtn.click();
        await randomDelay({ min: 500, max: 1000 });

        // "소제목" 옵션 버튼 클릭
        const heading = page.locator('button.se-toolbar-option-text-button span.se-toolbar-option-label:has-text("소제목")').first();
        if (await heading.isVisible({ timeout: 2000 })) {
          await heading.click();
          await randomDelay({ min: 300, max: 600 });
          console.log('[NaverBlog] 소제목 스타일 적용');
          return;
        }
      }
      console.warn('[NaverBlog] 소제목 드롭다운 못찾음, 일반 텍스트로 입력');
    } catch {
      console.warn('[NaverBlog] 소제목 스타일 전환 실패');
    }
  }

  private async restoreBodyStyle(page: Page): Promise<void> {
    try {
      const styleBtn = page.locator('button.se-text-format-toolbar-button').first();
      if (await styleBtn.isVisible({ timeout: 2000 })) {
        await styleBtn.click();
        await randomDelay({ min: 500, max: 1000 });
        const bodyOpt = page.locator('button.se-toolbar-option-text-button span.se-toolbar-option-label:has-text("본문")').first();
        if (await bodyOpt.isVisible({ timeout: 2000 })) {
          await bodyOpt.click();
          await randomDelay({ min: 300, max: 600 });
        }
      }
    } catch { /* 무시 */ }
  }

  /**
   * [FIX #4] 이미지 삽입 - fileChooser 이벤트 가로채기 방식
   * 사진 버튼 클릭 시 발생하는 파일 선택 다이얼로그를 Playwright가 직접 처리
   */
  private async insertImage(page: Page, imagePath: string): Promise<void> {
    try {
      const fs = await import('fs');
      if (!fs.existsSync(imagePath)) {
        console.warn(`[NaverBlog] 이미지 파일 없음: ${imagePath}`);
        return;
      }

      const fileSize = (fs.statSync(imagePath).size / 1024).toFixed(1);
      console.log(`[NaverBlog] 이미지 삽입 시도: ${imagePath} (${fileSize}KB)`);

      // fileChooser 이벤트를 기다리면서 동시에 사진 버튼 클릭
      const [fileChooser] = await Promise.all([
        page.waitForEvent('filechooser', { timeout: 10000 }),
        (async () => {
          // 사진 버튼 클릭
          const photoBtn = page.locator('button.se-image-toolbar-button').first();
          await photoBtn.click({ timeout: 5000 });
          console.log('[NaverBlog] 사진 추가 버튼 클릭');
        })(),
      ]);

      // fileChooser로 직접 파일 설정 (file input 셀렉터 불필요)
      await fileChooser.setFiles(imagePath);
      console.log('[NaverBlog] fileChooser로 이미지 파일 설정 완료');

      // 업로드 완료 대기 (이미지 컴포넌트가 DOM에 나타날 때까지)
      try {
        await page.waitForSelector('.se-image-resource, .se-module-image, .se-component-image', { timeout: 30000 });
        console.log('[NaverBlog] 이미지 삽입 완료');
      } catch {
        console.warn('[NaverBlog] 이미지 업로드 대기 타임아웃');
      }

      await randomDelay(delays.imageUpload);

      // 본문으로 포커스 복귀 후 줄바꿈
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      await page.keyboard.press('Enter');
      await randomDelay({ min: 500, max: 1000 });
    } catch (error) {
      console.warn(`[NaverBlog] 이미지 삽입 실패: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * [FIX #5] 발행: 상단 발행 → 태그 입력 → 패널 내 최종 발행
   */
  private async clickPublish(page: Page, hashtags?: string[]): Promise<string> {
    await randomDelay(delays.beforeSave);

    // Step 1: 상단 "발행" 버튼 → 발행 패널 열기
    const topPublishBtn = page.locator('button[class*="publish_btn"]').first();
    await topPublishBtn.click({ timeout: 10000 });
    console.log('[NaverBlog] 상단 발행 버튼 클릭 → 패널 열림');
    await page.waitForTimeout(2000);

    // Step 2: 태그 입력
    if (hashtags && hashtags.length > 0) {
      try {
        const tagInput = page.locator('input[placeholder*="태그"], input[class*="tag"], [class*="tag"] input').first();
        if (await tagInput.isVisible({ timeout: 3000 })) {
          await tagInput.click();
          await randomDelay({ min: 300, max: 600 });
          await typeHashtags(page, hashtags.slice(0, 10));
          console.log(`[NaverBlog] 태그 ${Math.min(hashtags.length, 10)}개 입력`);
        }
      } catch {
        console.warn('[NaverBlog] 태그 입력 실패, 건너뜀');
      }
    }

    await randomDelay(delays.beforeSave);

    // Step 3: 패널 내 최종 "발행" 버튼 클릭
    // 상단 버튼 클릭 후 패널이 열리면 visible한 발행 버튼이 2개 → last()로 패널 내 버튼 선택
    try {
      const allPublishBtns = page.locator('button[class*="publish_btn"]:visible');
      const count = await allPublishBtns.count();
      if (count >= 2) {
        await allPublishBtns.last().click();
        console.log('[NaverBlog] 패널 내 최종 발행 버튼 클릭');
      } else if (count === 1) {
        // 패널 내에 별도 확인 버튼이 있을 수 있음
        const confirmBtn = page.locator('button:has-text("발행"):visible').last();
        await confirmBtn.click();
        console.log('[NaverBlog] 발행 확인 버튼 클릭');
      }
    } catch {
      throw new Error('발행 버튼을 찾을 수 없습니다');
    }

    // 발행 완료 대기 (페이지 이동)
    await page.waitForTimeout(5000);
    try {
      await page.waitForURL((url) => !url.toString().includes('/postwrite'), { timeout: 15000 });
    } catch {
      // 한번 더 시도
      const stillEditor = page.url().includes('/postwrite');
      if (stillEditor) {
        throw new Error('발행 후 페이지 이동이 되지 않았습니다');
      }
    }

    const finalUrl = page.url();
    console.log(`[NaverBlog] 발행 URL: ${finalUrl}`);
    return finalUrl;
  }
}
