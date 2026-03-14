import { BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
import { ScrapingSession } from '../../types/scrapingContext.js';
export type DataType = 'tax_invoice_sales' | 'tax_invoice_purchase' | 'cash_receipt_sales' | 'cash_receipt_purchase' | 'business_card_purchase' | 'credit_card_sales';
/**
 * 지정된 데이터 타입의 스크래퍼 실행 (모드 자동 선택)
 * - ScrapingSession 전달 시: 세션 타입에 따라 자동 라우팅
 * - BrowserContext 전달 시: Playwright 모드 (하위 호환)
 */
export declare function runScraper(context: BrowserContext | ScrapingSession, dataType: DataType, year: number, month: number): Promise<ScrapeResult>;
/** 현재 설정된 스크래핑 모드 확인 */
export declare function getScrapingMode(): 'playwright' | 'protocol';
export type { ScrapeResult } from './baseScraper.js';
//# sourceMappingURL=index.d.ts.map