import { Page, BrowserContext } from 'playwright';
import { ScrapeResult } from './baseScraper.js';
/**
 * 현금영수증 매출 스크래핑 흐름:
 * 1. 로그인 (완료 상태)
 * 2. 계산서·영수증·카드 메뉴
 *   2.1 현금영수증 가맹점 클릭
 *   2.2 가맹점 매출 조회 클릭
 *   2.3 현금영수증 매출내역 누계조회 클릭
 *     → $c.pp.fn_topMenuOpen($p, 'menuAtag_4606010200')
 *   2.4 조회 클릭
 *   2.5 필요 데이터 스크래핑
 */
export declare function scrapeCashReceiptSales(context: BrowserContext, year: number, month: number, _clinicId?: string, sharedPage?: Page): Promise<ScrapeResult>;
/**
 * 현금영수증 매입 스크래핑 흐름:
 * 1. 로그인 (완료 상태)
 * 2. 계산서·영수증·카드 메뉴
 *   2.1 현금영수증 매입 지출 증빙
 *   2.2 현금영수증 매입내역 지출증빙 조회
 *   2.3 분기별 클릭
 *   2.4 조회기간에서 해당 분기인지 확인
 *   2.5 조회 클릭
 *   2.6 필요정보 스크래핑
 */
export declare function scrapeCashReceiptPurchase(context: BrowserContext, year: number, month: number, _clinicId?: string, sharedPage?: Page): Promise<ScrapeResult>;
//# sourceMappingURL=cashReceiptScraper.d.ts.map