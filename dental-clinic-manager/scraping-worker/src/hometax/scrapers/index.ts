import { BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
import { scrapeTaxInvoiceSales, scrapeTaxInvoicePurchase } from './taxInvoiceScraper.js';
import { scrapeCashReceiptSales, scrapeCashReceiptPurchase } from './cashReceiptScraper.js';
import { scrapeBusinessCardPurchase } from './businessCardScraper.js';
import { scrapeCreditCardSales } from './creditCardSalesScraper.js';

export type DataType =
  | 'tax_invoice_sales'
  | 'tax_invoice_purchase'
  | 'cash_receipt_sales'
  | 'cash_receipt_purchase'
  | 'business_card_purchase'
  | 'credit_card_sales';

/** 데이터 타입별 스크래퍼 매핑 */
const SCRAPER_MAP: Record<DataType, (ctx: BrowserContext, year: number, month: number) => Promise<ScrapeResult>> = {
  tax_invoice_sales: scrapeTaxInvoiceSales,
  tax_invoice_purchase: scrapeTaxInvoicePurchase,
  cash_receipt_sales: scrapeCashReceiptSales,
  cash_receipt_purchase: scrapeCashReceiptPurchase,
  business_card_purchase: scrapeBusinessCardPurchase,
  credit_card_sales: scrapeCreditCardSales,
};

/** 지정된 데이터 타입의 스크래퍼 실행 */
export async function runScraper(
  context: BrowserContext,
  dataType: DataType,
  year: number,
  month: number,
): Promise<ScrapeResult> {
  const scraper = SCRAPER_MAP[dataType];
  if (!scraper) {
    throw new Error(`지원하지 않는 데이터 타입: ${dataType}`);
  }
  return scraper(context, year, month);
}

export type { ScrapeResult } from './baseScraper.js';
