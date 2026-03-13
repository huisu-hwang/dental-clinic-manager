import { BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
/** 세금계산서 매출 스크래핑 */
export declare function scrapeTaxInvoiceSales(context: BrowserContext, year: number, month: number): Promise<ScrapeResult>;
/** 세금계산서 매입 스크래핑 */
export declare function scrapeTaxInvoicePurchase(context: BrowserContext, year: number, month: number): Promise<ScrapeResult>;
//# sourceMappingURL=taxInvoiceScraper.d.ts.map