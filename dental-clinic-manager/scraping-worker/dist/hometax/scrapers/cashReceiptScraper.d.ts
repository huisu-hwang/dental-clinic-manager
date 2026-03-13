import { BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
/** 현금영수증 매출 스크래핑 */
export declare function scrapeCashReceiptSales(context: BrowserContext, year: number, month: number): Promise<ScrapeResult>;
/** 현금영수증 매입 스크래핑 */
export declare function scrapeCashReceiptPurchase(context: BrowserContext, year: number, month: number): Promise<ScrapeResult>;
//# sourceMappingURL=cashReceiptScraper.d.ts.map