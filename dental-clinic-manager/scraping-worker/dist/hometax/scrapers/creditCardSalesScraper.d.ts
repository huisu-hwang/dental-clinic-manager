import { Page, BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
/**
 * 신용카드 매출 스크래핑 흐름:
 * 1. 로그인 후 (loginService에서 처리 완료)
 * 2. 계산서·영수증·카드 > 신용카드 매출 > 신용카드·판매(결제)대행 매출자료 조회
 *    → $c.pp.fn_topMenuOpen($p, 'menuAtag_4607010000')
 * 2.3 결제년도 및 분기 선택 후 조회
 * 2.4 필요 정보 스크래핑
 */
export declare function scrapeCreditCardSales(context: BrowserContext, year: number, month: number, _clinicId?: string, sharedPage?: Page): Promise<ScrapeResult>;
//# sourceMappingURL=creditCardSalesScraper.d.ts.map