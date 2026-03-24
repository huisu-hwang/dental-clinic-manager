import { Page, BrowserContext } from 'playwright';
export interface ScrapeResult {
    dataType: string;
    records: Record<string, unknown>[];
    totalCount: number;
    scrapedAt: string;
    period: {
        year: number;
        month: number;
    };
}
/** 홈택스 메뉴 페이지로 이동 */
export declare function navigateToMenu(page: Page, menuPath: string): Promise<void>;
/** 조회 기간 설정 (연/월) */
export declare function setPeriod(page: Page, year: number, month: number): Promise<void>;
/** 조회 버튼 클릭 후 결과 대기 — WebSquare <a> 태그 지원 */
export declare function clickSearchAndWait(page: Page): Promise<void>;
/** HTML 테이블에서 데이터 추출 */
export declare function parseTable(page: Page, tableSelector?: string): Promise<Record<string, unknown>[]>;
/** 페이지네이션 처리하며 모든 데이터 수집 */
export declare function scrapeAllPages(page: Page, tableSelector?: string): Promise<Record<string, unknown>[]>;
/** 새 페이지에서 스크래핑 수행 후 페이지 닫기 */
export declare function withPage<T>(context: BrowserContext, fn: (page: Page) => Promise<T>): Promise<T>;
//# sourceMappingURL=baseScraper.d.ts.map