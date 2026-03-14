import { HttpSession } from '../../types/scrapingContext.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';
/** 세금계산서 매출 (Protocol) */
export declare function scrapeTaxInvoiceSalesProtocol(session: HttpSession, year: number, month: number): Promise<ScrapeResult>;
/** 세금계산서 매입 (Protocol) */
export declare function scrapeTaxInvoicePurchaseProtocol(session: HttpSession, year: number, month: number): Promise<ScrapeResult>;
//# sourceMappingURL=taxInvoiceProtocol.d.ts.map