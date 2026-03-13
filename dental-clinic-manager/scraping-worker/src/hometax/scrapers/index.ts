import { BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
import { scrapeTaxInvoiceSales, scrapeTaxInvoicePurchase } from './taxInvoiceScraper.js';
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

/** Playwright 모드 스크래퍼 매핑 */
const PLAYWRIGHT_SCRAPER_MAP: Record<DataType, (ctx: BrowserContext, year: number, month: number) => Promise<ScrapeResult>> = {
  tax_invoice_sales: scrapeTaxInvoiceSales,
  tax_invoice_purchase: scrapeTaxInvoicePurchase,
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
    return scraper(browserContext, year, month);
  }

  // 하위 호환: BrowserContext 직접 전달
  const scraper = PLAYWRIGHT_SCRAPER_MAP[dataType];
  if (!scraper) {
    throw new Error(`지원하지 않는 데이터 타입: ${dataType}`);
  }
  return scraper(context as BrowserContext, year, month);
}

/** 현재 설정된 스크래핑 모드 확인 */
export function getScrapingMode(): 'playwright' | 'protocol' {
  return config.scrapingMode;
}

export type { ScrapeResult } from './baseScraper.js';
