import { BrowserContext, Page } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
// 세금계산서는 현재 제외 (추후 구현 예정)
// import { scrapeTaxInvoiceSales, scrapeTaxInvoicePurchase } from './taxInvoiceScraper.js';
import { scrapeCashReceiptSales, scrapeCashReceiptPurchase } from './cashReceiptScraper.js';
import { scrapeBusinessCardPurchase } from './businessCardScraper.js';
import { scrapeCreditCardSales } from './creditCardSalesScraper.js';
import { runProtocolScraper } from '../../protocol/scrapers/index.js';
import { config } from '../../config.js';
import { ScrapingSession, getBrowserContext, getHttpSession } from '../../types/scrapingContext.js';

/** ScrapingSession 타입 가드 */
function isScrapingSession(obj: unknown): obj is ScrapingSession {
  return typeof obj === 'object' && obj !== null && 'type' in obj
    && ((obj as ScrapingSession).type === 'playwright' || (obj as ScrapingSession).type === 'protocol');
}

export type DataType =
  | 'tax_invoice_sales'
  | 'tax_invoice_purchase'
  | 'cash_receipt_sales'
  | 'cash_receipt_purchase'
  | 'business_card_purchase'
  | 'credit_card_sales';

type ScraperFn = (ctx: BrowserContext, year: number, month: number, clinicId?: string, sharedPage?: Page) => Promise<ScrapeResult>;

/** Playwright 모드 스크래퍼 매핑 — 세금계산서는 현재 제외 */
const PLAYWRIGHT_SCRAPER_MAP: Partial<Record<DataType, ScraperFn>> = {
  // tax_invoice_sales: 추후 구현
  // tax_invoice_purchase: 추후 구현
  cash_receipt_sales: scrapeCashReceiptSales,
  cash_receipt_purchase: scrapeCashReceiptPurchase,
  business_card_purchase: scrapeBusinessCardPurchase,
  credit_card_sales: scrapeCreditCardSales,
};

/**
 * 지정된 데이터 타입의 스크래퍼 실행 (모드 자동 선택)
 * - ScrapingSession 전달 시: 세션 타입에 따라 자동 라우팅
 * - BrowserContext 전달 시: Playwright 모드 (하위 호환)
 */
export async function runScraper(
  context: BrowserContext | ScrapingSession,
  dataType: DataType,
  year: number,
  month: number,
  clinicId?: string,
): Promise<ScrapeResult> {
  // ScrapingSession 타입인지 확인 (type 필드 존재)
  if (isScrapingSession(context)) {
    if (context.type === 'protocol') {
      return runProtocolScraper(getHttpSession(context), dataType, year, month);
    }

    // Playwright 세션
    const browserContext = getBrowserContext(context);
    const scraper = PLAYWRIGHT_SCRAPER_MAP[dataType];
    if (!scraper) {
      throw new Error(`지원하지 않는 데이터 타입: ${dataType}`);
    }
    return scraper(browserContext, year, month, clinicId);
  }

  // 하위 호환: BrowserContext 직접 전달
  const scraper = PLAYWRIGHT_SCRAPER_MAP[dataType];
  if (!scraper) {
    throw new Error(`지원하지 않는 데이터 타입: ${dataType}`);
  }
  return scraper(context as BrowserContext, year, month, clinicId);
}

/**
 * 공유 페이지로 스크래퍼 실행 (Playwright 모드 전용)
 * 이미 로드된 메인 페이지가 있을 때 goto/로그인 확인 단계를 건너뜁니다.
 */
export async function runScraperWithPage(
  page: Page,
  session: ScrapingSession,
  dataType: DataType,
  year: number,
  month: number,
  clinicId?: string,
): Promise<ScrapeResult> {
  if (session.type === 'protocol') {
    // protocol 모드는 페이지 공유 불가 — 기존 방식으로 폴백
    return runProtocolScraper(getHttpSession(session), dataType, year, month);
  }

  const browserContext = getBrowserContext(session);
  const scraper = PLAYWRIGHT_SCRAPER_MAP[dataType];
  if (!scraper) {
    throw new Error(`지원하지 않는 데이터 타입: ${dataType}`);
  }
  return scraper(browserContext, year, month, clinicId, page);
}

/** 현재 설정된 스크래핑 모드 확인 */
export function getScrapingMode(): 'playwright' | 'protocol' {
  return config.scrapingMode;
}

export type { ScrapeResult } from './baseScraper.js';
