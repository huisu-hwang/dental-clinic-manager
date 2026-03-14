import { Browser, BrowserContext, Page } from 'playwright';
/** Playwright 브라우저 인스턴스 획득 (싱글톤) */
export declare function getBrowser(): Promise<Browser>;
/** 새 브라우저 컨텍스트 생성 (세션 격리) */
export declare function createContext(cookies?: Parameters<BrowserContext['addCookies']>[0]): Promise<BrowserContext>;
/** 새 페이지 생성 */
export declare function createPage(context: BrowserContext): Promise<Page>;
/** 브라우저 종료 */
export declare function closeBrowser(): Promise<void>;
//# sourceMappingURL=browserManager.d.ts.map