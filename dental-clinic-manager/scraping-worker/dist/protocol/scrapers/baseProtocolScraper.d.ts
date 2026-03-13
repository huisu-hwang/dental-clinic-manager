import { HttpSession } from '../../types/scrapingContext.js';
import { ScrapeResult } from '../../hometax/scrapers/baseScraper.js';
/** WebSquare XML Action 요청 (홈택스 데이터 조회 공통 패턴) */
export declare function queryData(session: HttpSession, actionUrl: string, xmlPayload: string): Promise<string>;
/** WebSquare JSON Action 요청 */
export declare function queryJsonData(session: HttpSession, actionUrl: string, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
/** 기간 파라미터 생성 (YYYYMMDD 형식) */
export declare function buildPeriodParams(year: number, month: number): {
    startDate: string;
    endDate: string;
};
/** JSON 응답에서 리스트 데이터 추출 (홈택스 공통 응답 구조) */
export declare function extractListFromResponse(data: Record<string, unknown>): Record<string, unknown>[];
/** 페이지네이션 처리 (Protocol 모드) */
export declare function queryAllPages(session: HttpSession, actionUrl: string, basePayload: Record<string, unknown>, maxPages?: number): Promise<Record<string, unknown>[]>;
/** 금액 파싱 */
export declare function parseAmount(value: unknown): number;
/** ScrapeResult 빌더 */
export declare function buildResult(dataType: string, records: Record<string, unknown>[], year: number, month: number): ScrapeResult;
//# sourceMappingURL=baseProtocolScraper.d.ts.map