import { config } from '../config.js';
import { createChildLogger } from '../utils/logger.js';
const log = createChildLogger('httpClient');
const HOMETAX_BASE = 'https://www.hometax.go.kr';
/** Set-Cookie 헤더에서 쿠키 파싱 */
function parseCookies(setCookieHeaders) {
    const cookies = {};
    for (const header of setCookieHeaders) {
        const match = header.match(/^([^=]+)=([^;]*)/);
        if (match) {
            cookies[match[1].trim()] = match[2].trim();
        }
    }
    return cookies;
}
/** 쿠키 객체를 Cookie 헤더 문자열로 변환 */
function cookiesToString(cookies) {
    return Object.entries(cookies)
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
}
/** 새 HTTP 세션 생성 */
export function createHttpSession() {
    return {
        type: 'protocol',
        cookies: {},
        headers: {
            'User-Agent': config.protocol.userAgent,
            'Accept': 'application/json, text/xml, text/html, */*',
            'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': `${HOMETAX_BASE}/websquare/websquare.wq`,
            'Origin': HOMETAX_BASE,
        },
        valid: false,
    };
}
/** HTTP 세션으로 GET 요청 */
export async function httpGet(session, path, extraHeaders) {
    const url = path.startsWith('http') ? path : `${HOMETAX_BASE}${path}`;
    const headers = {
        ...session.headers,
        ...extraHeaders,
    };
    if (Object.keys(session.cookies).length > 0) {
        headers['Cookie'] = cookiesToString(session.cookies);
    }
    log.debug({ url }, 'HTTP GET');
    const res = await fetch(url, {
        method: 'GET',
        headers,
        redirect: 'manual',
        signal: AbortSignal.timeout(config.protocol.timeoutMs),
    });
    // 응답 쿠키 업데이트
    const setCookies = res.headers.getSetCookie?.() || [];
    Object.assign(session.cookies, parseCookies(setCookies));
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
}
/** HTTP 세션으로 POST 요청 */
export async function httpPost(session, path, body, contentType = 'json', extraHeaders) {
    const url = path.startsWith('http') ? path : `${HOMETAX_BASE}${path}`;
    const headers = {
        ...session.headers,
        ...extraHeaders,
    };
    if (Object.keys(session.cookies).length > 0) {
        headers['Cookie'] = cookiesToString(session.cookies);
    }
    let requestBody;
    switch (contentType) {
        case 'json':
            headers['Content-Type'] = 'application/json; charset=UTF-8';
            requestBody = typeof body === 'string' ? body : JSON.stringify(body);
            break;
        case 'form':
            headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
            if (typeof body === 'object') {
                requestBody = Object.entries(body)
                    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
                    .join('&');
            }
            else {
                requestBody = body;
            }
            break;
        case 'xml':
            headers['Content-Type'] = 'text/xml; charset=UTF-8';
            requestBody = typeof body === 'string' ? body : JSON.stringify(body);
            break;
    }
    log.debug({ url, contentType }, 'HTTP POST');
    const res = await fetch(url, {
        method: 'POST',
        headers,
        body: requestBody,
        redirect: 'manual',
        signal: AbortSignal.timeout(config.protocol.timeoutMs),
    });
    // 응답 쿠키 업데이트
    const setCookies = res.headers.getSetCookie?.() || [];
    Object.assign(session.cookies, parseCookies(setCookies));
    const responseBody = await res.text();
    return { status: res.status, body: responseBody, headers: res.headers };
}
/** WebSquare Action 요청 (홈택스 공통 패턴) */
export async function websquareAction(session, actionPath, payload) {
    const res = await httpPost(session, `/websquare/websquare.wq?w2xPath=${actionPath}`, payload, 'json', {
        'X-Requested-With': 'XMLHttpRequest',
    });
    if (res.status !== 200) {
        throw new Error(`WebSquare 요청 실패: ${res.status} - ${actionPath}`);
    }
    try {
        return JSON.parse(res.body);
    }
    catch {
        log.warn({ actionPath, bodyPreview: res.body.substring(0, 200) }, 'JSON 파싱 실패, XML 응답 시도');
        // XML 응답인 경우 raw body 반환
        return { _raw: res.body, _format: 'xml' };
    }
}
/** 홈택스 WMONID 초기 세션 획득 */
export async function initSession(session) {
    log.info('홈택스 초기 세션 획득');
    await httpGet(session, '/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml');
    log.info({ cookieCount: Object.keys(session.cookies).length }, '초기 세션 쿠키 획득 완료');
}
/** 세션 닫기 (리소스 정리) */
export async function closeHttpSession(session) {
    try {
        // 로그아웃 요청
        await httpGet(session, '/pubcLogin/logOut.do');
    }
    catch {
        // 무시
    }
    session.cookies = {};
    session.valid = false;
    log.info('HTTP 세션 종료');
}
//# sourceMappingURL=httpClient.js.map