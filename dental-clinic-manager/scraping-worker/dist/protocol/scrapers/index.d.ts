import { HttpSession } from '../../types/scrapingContext.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';
type DataType = 'tax_invoice_sales' | 'tax_invoice_purchase' | 'cash_receipt_sales' | 'cash_receipt_purchase' | 'business_card_purchase' | 'credit_card_sales';
/** Protocol 모드 스크래퍼 실행 */
export declare function runProtocolScraper(session: HttpSession, dataType: DataType, year: number, month: number): Promise<ScrapeResult>;
export {};
//# sourceMappingURL=index.d.ts.map