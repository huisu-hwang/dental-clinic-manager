import { BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
export type DataType = 'tax_invoice_sales' | 'tax_invoice_purchase' | 'cash_receipt_sales' | 'cash_receipt_purchase' | 'business_card_purchase' | 'credit_card_sales';
/** 지정된 데이터 타입의 스크래퍼 실행 */
export declare function runScraper(context: BrowserContext, dataType: DataType, year: number, month: number): Promise<ScrapeResult>;
export type { ScrapeResult } from './baseScraper.js';
//# sourceMappingURL=index.d.ts.map