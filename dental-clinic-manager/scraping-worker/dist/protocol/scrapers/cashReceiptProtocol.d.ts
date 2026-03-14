import { HttpSession } from '../../types/scrapingContext.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';
/** 현금영수증 매출 (Protocol) */
export declare function scrapeCashReceiptSalesProtocol(session: HttpSession, year: number, month: number): Promise<ScrapeResult>;
/** 현금영수증 매입 (Protocol) */
export declare function scrapeCashReceiptPurchaseProtocol(session: HttpSession, year: number, month: number): Promise<ScrapeResult>;
//# sourceMappingURL=cashReceiptProtocol.d.ts.map