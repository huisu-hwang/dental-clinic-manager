import { BrowserContext } from 'playwright';

/** HTTP 세션 컨텍스트 (Protocol 모드) */
export interface HttpSession {
  type: 'protocol';
  cookies: Record<string, string>;
  headers: Record<string, string>;
  /** 세션 유효 여부 */
  valid: boolean;
}

/** Playwright 브라우저 컨텍스트 래퍼 */
export interface PlaywrightSession {
  type: 'playwright';
  context: BrowserContext;
}

/** 스크래핑 모드에 따른 세션 타입 */
export type ScrapingSession = HttpSession | PlaywrightSession;

/** 스크래핑 모드 */
export type ScrapingMode = 'playwright' | 'protocol';

/** 세션에서 BrowserContext 추출 (Playwright 모드 전용) */
export function getBrowserContext(session: ScrapingSession): BrowserContext {
  if (session.type !== 'playwright') {
    throw new Error('BrowserContext는 playwright 모드에서만 사용 가능합니다');
  }
  return session.context;
}

/** 세션에서 HttpSession 추출 (Protocol 모드 전용) */
export function getHttpSession(session: ScrapingSession): HttpSession {
  if (session.type !== 'protocol') {
    throw new Error('HttpSession은 protocol 모드에서만 사용 가능합니다');
  }
  return session;
}
