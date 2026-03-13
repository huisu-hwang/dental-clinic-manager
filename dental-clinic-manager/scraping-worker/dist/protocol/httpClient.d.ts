import { HttpSession } from '../types/scrapingContext.js';
/** 새 HTTP 세션 생성 */
export declare function createHttpSession(): HttpSession;
/** HTTP 세션으로 GET 요청 */
export declare function httpGet(session: HttpSession, path: string, extraHeaders?: Record<string, string>): Promise<{
    status: number;
    body: string;
    headers: Headers;
}>;
/** HTTP 세션으로 POST 요청 */
export declare function httpPost(session: HttpSession, path: string, body: string | Record<string, unknown>, contentType?: 'json' | 'form' | 'xml', extraHeaders?: Record<string, string>): Promise<{
    status: number;
    body: string;
    headers: Headers;
}>;
/** WebSquare Action 요청 (홈택스 공통 패턴) */
export declare function websquareAction(session: HttpSession, actionPath: string, payload: Record<string, unknown>): Promise<Record<string, unknown>>;
/** 홈택스 WMONID 초기 세션 획득 */
export declare function initSession(session: HttpSession): Promise<void>;
/** 세션 닫기 (리소스 정리) */
export declare function closeHttpSession(session: HttpSession): Promise<void>;
//# sourceMappingURL=httpClient.d.ts.map