import { BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
/** 세금계산서 매출 스크래핑 — 전체 흐름 (2.1 ~ 2.9) */
export declare function scrapeTaxInvoiceSales(context: BrowserContext, year: number, _month: number, clinicId?: string): Promise<ScrapeResult>;
/** 세금계산서 매입 스크래핑 — 매출과 동일 페이지 (매출/매입 통계 조회) */
export declare function scrapeTaxInvoicePurchase(context: BrowserContext, year: number, _month: number, clinicId?: string): Promise<ScrapeResult>;
//# sourceMappingURL=taxInvoiceScraper.d.ts.map