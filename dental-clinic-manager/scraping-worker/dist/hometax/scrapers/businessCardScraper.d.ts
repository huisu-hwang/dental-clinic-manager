import { Page, BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
/**
 * 신용카드 매입 스크래핑 흐름:
 * 1. 로그인 (완료)
 * 2. 계산서·영수증·카드 메뉴
 *   2.1 신용카드 매입
 *   2.2 사업용 신용카드 사용내역
 *   2.3 매입내역 누계 조회
 *     → $c.pp.fn_topMenuOpen($p, 'menuAtag_4608020300')
 *   2.4 조회년도 확인 후 조회 클릭
 *   2.5 필요 정보 스크래핑
 */
export declare function scrapeBusinessCardPurchase(context: BrowserContext, year: number, month: number, _clinicId?: string, sharedPage?: Page): Promise<ScrapeResult>;
//# sourceMappingURL=businessCardScraper.d.ts.map