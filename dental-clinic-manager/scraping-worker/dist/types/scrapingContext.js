/** 세션에서 BrowserContext 추출 (Playwright 모드 전용) */
export function getBrowserContext(session) {
    if (session.type !== 'playwright') {
        throw new Error('BrowserContext는 playwright 모드에서만 사용 가능합니다');
    }
    return session.context;
}
/** 세션에서 HttpSession 추출 (Protocol 모드 전용) */
export function getHttpSession(session) {
    if (session.type !== 'protocol') {
        throw new Error('HttpSession은 protocol 모드에서만 사용 가능합니다');
    }
    return session;
}
//# sourceMappingURL=scrapingContext.js.map