import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';

const log = createChildLogger('browserManager');

let browser: Browser | null = null;

/** Playwright 브라우저 인스턴스 획득 (싱글톤) */
export async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    log.info({ headless: config.playwright.headless }, 'Chromium 브라우저 시작');
    browser = await chromium.launch({
      headless: config.playwright.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
    });
  }
  return browser;
}

/** 새 브라우저 컨텍스트 생성 (세션 격리) */
export async function createContext(cookies?: Parameters<BrowserContext['addCookies']>[0]): Promise<BrowserContext> {
  const br = await getBrowser();
  const context = await br.newContext({
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    javaScriptEnabled: true,
  });

  // 자동화 탐지 우회
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  if (cookies && cookies.length > 0) {
    await context.addCookies(cookies);
  }

  return context;
}

/** 새 페이지 생성 */
export async function createPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultTimeout(config.playwright.timeoutMs);
  page.setDefaultNavigationTimeout(config.playwright.timeoutMs);
  return page;
}

/** 브라우저 종료 */
export async function closeBrowser(): Promise<void> {
  if (browser) {
    try {
      await browser.close();
      log.info('브라우저 종료');
    } catch (err) {
      log.warn({ err }, '브라우저 종료 중 오류');
    }
    browser = null;
  }
}
