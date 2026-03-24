import { createContext, createPage } from '../browser/browserManager.js';
import { saveSession, loadSession, isSessionValid } from './sessionManager.js';
import { getSupabaseClient } from '../db/supabaseClient.js';
import { decryptFromJson } from '../crypto/encryption.js';
import { createChildLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
const log = createChildLogger('loginService');
const HOMETAX_URL = 'https://www.hometax.go.kr';
const LOGIN_URL = `${HOMETAX_URL}/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml`;
/**
 * 안전한 클릭 헬퍼 — Playwright의 가시성 기반 클릭을 시도하고,
 * 실패하면 JavaScript 직접 클릭으로 폴백
 */
async function safeClick(page, selectors, description, options) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    const timeout = options?.timeout ?? 10000;
    for (const selector of selectorList) {
        try {
            // 1차: locator로 visible 요소만 대상으로 클릭 시도
            const locator = page.locator(selector).first();
            await locator.click({ timeout });
            log.info({ selector, description }, '클릭 성공 (locator)');
            return true;
        }
        catch {
            // 2차: JS 직접 클릭 시도 — page.evaluate 내부는 브라우저 컨텍스트
            try {
                const clicked = await page.evaluate((sel) => {
                    /* eslint-disable @typescript-eslint/no-explicit-any */
                    const doc = globalThis.document;
                    const elements = doc.querySelectorAll(sel);
                    for (let i = 0; i < elements.length; i++) {
                        const el = elements[i];
                        const rect = el.getBoundingClientRect();
                        if (rect.width > 0 || rect.height > 0 || el.offsetParent !== null) {
                            el.click();
                            return true;
                        }
                    }
                    if (elements.length > 0) {
                        elements[0].click();
                        return true;
                    }
                    return false;
                }, selector);
                if (clicked) {
                    log.info({ selector, description }, '클릭 성공 (JS fallback)');
                    return true;
                }
            }
            catch {
                log.debug({ selector, description }, 'JS 클릭도 실패, 다음 셀렉터 시도');
            }
        }
    }
    log.warn({ selectors: selectorList, description }, '모든 셀렉터 클릭 실패');
    return false;
}
/**
 * 안전한 입력 헬퍼 — visible 요소를 찾아 포커스 후 타이핑
 */
async function safeType(page, selectors, text, description) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of selectorList) {
        try {
            const locator = page.locator(selector).first();
            await locator.waitFor({ state: 'visible', timeout: 5000 });
            await locator.click({ timeout: 5000 });
            await locator.fill('');
            await page.keyboard.type(text, { delay: 50 });
            log.info({ selector, description }, '입력 성공');
            return true;
        }
        catch {
            // JS 폴백: focus + value 설정 후 이벤트 발생 — 브라우저 컨텍스트
            try {
                const found = await page.evaluate(({ sel, val }) => {
                    /* eslint-disable @typescript-eslint/no-explicit-any */
                    const doc = globalThis.document;
                    const win = globalThis; // eslint-disable-line @typescript-eslint/no-explicit-any
                    const el = doc.querySelector(sel);
                    if (!el)
                        return false;
                    el.focus();
                    el.value = '';
                    const nativeInputValueSetter = win.Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
                    if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(el, val);
                    }
                    else {
                        el.value = val;
                    }
                    el.dispatchEvent(new win.Event('input', { bubbles: true }));
                    el.dispatchEvent(new win.Event('change', { bubbles: true }));
                    el.dispatchEvent(new win.Event('keyup', { bubbles: true }));
                    return true;
                }, { sel: selector, val: text });
                if (found) {
                    log.info({ selector, description }, '입력 성공 (JS fallback)');
                    return true;
                }
            }
            catch {
                log.debug({ selector, description }, 'JS 입력도 실패, 다음 셀렉터 시도');
            }
        }
    }
    log.warn({ selectors: selectorList, description }, '모든 셀렉터 입력 실패');
    return false;
}
/** DB에서 클리닉의 홈택스 인증정보 복호화 조회 */
async function getCredentials(clinicId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('hometax_credentials')
        .select('hometax_user_id, encrypted_password, encrypted_resident_number, business_number')
        .eq('clinic_id', clinicId)
        .single();
    if (error || !data) {
        log.error({ error, clinicId }, '홈택스 인증정보 조회 실패');
        return null;
    }
    try {
        return {
            login_id: data.hometax_user_id,
            login_pw: decryptFromJson(data.encrypted_password),
            resident_number: data.encrypted_resident_number ? decryptFromJson(data.encrypted_resident_number) : null,
            business_number: data.business_number,
        };
    }
    catch (err) {
        log.error({ err, clinicId }, '인증정보 복호화 실패');
        return null;
    }
}
/** 로그인 결과를 DB에 기록 */
async function recordLoginResult(clinicId, success, errorMessage) {
    const supabase = getSupabaseClient();
    const update = {
        last_login_attempt: new Date().toISOString(),
        last_login_success: success,
    };
    if (success) {
        update.last_login_error = null;
        update.login_fail_count = 0;
    }
    else {
        update.last_login_error = errorMessage || '알 수 없는 오류';
    }
    await supabase
        .from('hometax_credentials')
        .update(update)
        .eq('clinic_id', clinicId);
}
/** 홈택스 ID/PW 로그인 수행 */
async function performLogin(page, loginId, loginPw, residentNumber) {
    try {
        // 1. 홈택스 메인 접속
        // waitUntil: 'load' 사용 (domcontentloaded는 WebSquare SPA의 추가 네비게이션을 기다리지 않아
        // "Execution context was destroyed" 에러 발생)
        log.info('홈택스 메인 페이지 접속');
        await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 30000 });
        // WebSquare SPA 초기화 완료 대기 (JS 기반 리다이렉트/네비게이션 안정화)
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });
        // 보안 프로그램 팝업 닫기 (있는 경우)
        await dismissSecurityPopups(page);
        // 2. 로그인 버튼 클릭하여 로그인 페이지 이동
        log.info('로그인 페이지 이동');
        const loginClicked = await safeClick(page, [
            'a.hd_log', // 홈택스 헤더 로그인 링크
            'a[href*="login"]',
            '#login_btn',
            '.login_btn',
            'button:has-text("로그인")',
            'a:has-text("로그인")',
            'text=로그인',
        ], '로그인 버튼', { timeout: 10000 });
        if (loginClicked) {
            await page.waitForLoadState('load', { timeout: 15000 }).catch(() => { });
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
        }
        // 3. "아이디 로그인" 탭 선택
        log.info('아이디 로그인 탭 선택');
        await safeClick(page, [
            'li:has-text("아이디 로그인") > a',
            'a:has-text("아이디 로그인")',
            'text=아이디 로그인',
            '[class*="tab"]:has-text("아이디")',
        ], '아이디 로그인 탭', { timeout: 10000 });
        await page.waitForTimeout(1500); // 탭 전환 후 폼 렌더링 대기
        // 4. ID 입력 (홈택스는 키보드 이벤트를 감지하므로 type 사용)
        log.info('ID/PW 입력');
        const idTyped = await safeType(page, [
            'input[id="iptUserId"]',
            'input[id*="iptUserId"]',
            'input[name*="userId"]',
            'input[id*="id"]:not([type="password"]):not([type="hidden"])',
        ], loginId, '아이디 입력');
        if (!idTyped) {
            return { success: false, errorMessage: '아이디 입력 필드를 찾을 수 없습니다', errorCode: 'UNKNOWN' };
        }
        // 5. PW 입력
        const pwTyped = await safeType(page, [
            'input[id="iptUserPw"]',
            'input[id*="iptUserPw"]',
            'input[name*="userPw"]',
            'input[type="password"]:visible',
            'input[type="password"]',
        ], loginPw, '비밀번호 입력');
        if (!pwTyped) {
            return { success: false, errorMessage: '비밀번호 입력 필드를 찾을 수 없습니다', errorCode: 'UNKNOWN' };
        }
        // 5.5. 주민등록번호 입력 (현재 홈택스 아이디 로그인에서는 불필요할 수 있음)
        // 필드가 존재하지 않을 경우 빠르게 스킵 (짧은 타임아웃)
        if (residentNumber) {
            log.info('주민등록번호 입력 시도 (필드 존재 시에만)');
            const birthDate = residentNumber.substring(0, 6);
            const genderDigit = residentNumber.substring(6, 7);
            // 생년월일 필드가 있는지 빠르게 확인 (2초)
            const hasBirthField = await page.locator('input[id*="iptSrnoBirth"], input[id*="birth"], input[placeholder*="생년월일"]').first().isVisible().catch(() => false);
            if (hasBirthField) {
                await safeType(page, [
                    'input[id*="iptSrnoBirth"]',
                    'input[id*="birth"]',
                    'input[placeholder*="생년월일"]',
                ], birthDate, '생년월일 입력');
                await safeType(page, [
                    'input[id*="iptSrnoGndr"]',
                    'input[id*="gender"]',
                    'input[placeholder*="뒷자리"]',
                ], genderDigit, '주민번호 뒷자리 입력');
            }
            else {
                log.info('주민등록번호 입력 필드 없음 - 현재 홈택스에서 불필요, 스킵');
            }
        }
        // 6. 로그인 버튼 클릭 (홈택스는 <a> 태그를 버튼으로 사용 — WebSquare)
        log.info('로그인 시도');
        const submitClicked = await safeClick(page, [
            '#mf_txppWframe_anchor25', // 아이디 로그인 페이지 제출 버튼 (정확한 ID)
            'a.logingbtn', // 로그인 버튼 고유 클래스
            '.logingbtn', // 클래스 단독
            '#mf_txppWframe_anchor48', // 대체 로그인 버튼 ID
            'a[role="button"]:has-text("로그인"):not(:has-text("아이디")):not(:has-text("비회원"))', // <a> 태그 버튼 중 정확히 "로그인"만
            'button:has-text("로그인")', // 일반 버튼 폴백
        ], '로그인 제출 버튼', { timeout: 10000 });
        if (!submitClicked) {
            return { success: false, errorMessage: '로그인 버튼을 찾을 수 없습니다', errorCode: 'UNKNOWN' };
        }
        // 7. 로그인 결과 확인 (로그인 요청 처리 시간 대기 후)
        await page.waitForTimeout(3000); // 서버 응답 대기
        const result = await Promise.race([
            waitForLoginSuccess(page),
            waitForLoginError(page),
            page.waitForTimeout(20000).then(() => ({
                success: false,
                errorMessage: '로그인 응답 시간 초과',
                errorCode: 'TIMEOUT',
            })),
        ]);
        return result;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ err }, '로그인 수행 중 오류');
        return { success: false, errorMessage: message, errorCode: 'UNKNOWN' };
    }
}
/** 로그인 성공 감지 — 로그아웃 버튼, URL 변경, 또는 사용자 정보 출현 감지 */
async function waitForLoginSuccess(page) {
    try {
        // Playwright .or() 체이닝으로 여러 성공 지표 감지
        const successLocator = page.locator('text=로그아웃')
            .or(page.locator('text=마이홈택스'))
            .or(page.locator('#logoutBtn'))
            .or(page.locator('a:has-text("로그아웃")'));
        await successLocator.first().waitFor({ state: 'visible', timeout: 15000 });
        log.info('로그인 성공 감지');
        return { success: true };
    }
    catch {
        // URL 변경으로 성공 감지 시도 (로그인 후 메인/대시보드로 리다이렉트)
        const currentUrl = page.url();
        if (currentUrl.includes('index_pp') && !currentUrl.includes('login')) {
            // 메인 페이지로 돌아왔으면 로그인 성공일 수 있음
            const logoutBtn = await page.locator('text=로그아웃').isVisible().catch(() => false);
            if (logoutBtn) {
                log.info('로그인 성공 감지 (URL 기반)');
                return { success: true };
            }
        }
        log.warn({ currentUrl }, '로그인 성공 확인 실패');
        return { success: false, errorMessage: '로그인 성공 확인 실패', errorCode: 'UNKNOWN' };
    }
}
/** 로그인 에러 감지 — WebSquare alert 또는 visible 에러 메시지 감지 */
async function waitForLoginError(page) {
    try {
        // WebSquare는 alert() 다이얼로그를 사용할 수 있음 — dialog 이벤트 감지
        const dialogPromise = new Promise((resolve) => {
            const handler = (dialog) => {
                const msg = dialog.message();
                dialog.accept().catch(() => { });
                page.removeListener('dialog', handler);
                resolve(msg);
            };
            page.on('dialog', handler);
            // 15초 후 타임아웃
            setTimeout(() => {
                page.removeListener('dialog', handler);
                resolve('');
            }, 15000);
        });
        // visible 에러 요소 감지 (OR 체이닝)
        const errorLocator = page.locator('text=비밀번호가 일치하지 않습니다')
            .or(page.locator('text=아이디를 확인해 주세요'))
            .or(page.locator('text=입력하신 정보가 올바르지 않습니다'))
            .or(page.locator('text=로그인 정보가 올바르지 않습니다'));
        const errorElementPromise = errorLocator.first()
            .waitFor({ state: 'visible', timeout: 15000 })
            .then(() => errorLocator.first().textContent())
            .catch(() => '');
        // dialog 또는 visible 에러 중 먼저 발생하는 것 감지
        const errorText = await Promise.race([dialogPromise, errorElementPromise]);
        if (!errorText) {
            // 아무 에러도 감지되지 않음
            return { success: false, errorMessage: '로그인 결과 확인 실패', errorCode: 'UNKNOWN' };
        }
        log.warn({ errorText }, '로그인 에러 감지');
        if (errorText.includes('보안문자') || errorText.includes('자동입력방지')) {
            return { success: false, errorMessage: 'CAPTCHA 입력이 필요합니다', errorCode: 'CAPTCHA_REQUIRED' };
        }
        if (errorText.includes('추가인증') || errorText.includes('본인확인')) {
            return { success: false, errorMessage: '추가 인증이 필요합니다', errorCode: 'ADDITIONAL_AUTH' };
        }
        return { success: false, errorMessage: errorText.trim() || '로그인 실패', errorCode: 'INVALID_CREDENTIALS' };
    }
    catch {
        return { success: false, errorMessage: '로그인 결과 확인 실패', errorCode: 'UNKNOWN' };
    }
}
/** 보안 프로그램 설치 팝업 닫기 */
async function dismissSecurityPopups(page) {
    try {
        // 일반적인 보안 프로그램 팝업 닫기 버튼들
        const closeSelectors = [
            '.popup_close',
            '.btn_close',
            'button:has-text("닫기")',
            'a:has-text("닫기")',
            'button:has-text("나중에 설치")',
            'button:has-text("설치 안 함")',
            'text=닫기',
            'text=나중에 설치',
            'text=설치 안 함',
        ];
        for (const selector of closeSelectors) {
            try {
                const locator = page.locator(selector).first();
                const isVisible = await locator.isVisible().catch(() => false);
                if (isVisible) {
                    await locator.click({ timeout: 3000 }).catch(() => {
                        // JS fallback
                        page.evaluate((sel) => {
                            const el = (globalThis.document).querySelector(sel); // eslint-disable-line @typescript-eslint/no-explicit-any
                            if (el)
                                el.click(); // eslint-disable-line @typescript-eslint/no-explicit-any
                        }, selector).catch(() => { });
                    });
                    await page.waitForTimeout(500);
                    log.debug({ selector }, '보안 팝업 닫기');
                }
            }
            catch {
                // 개별 셀렉터 실패 무시
            }
        }
    }
    catch {
        // 팝업이 없으면 무시
    }
}
/** 홈택스 로그인 (세션 재사용 포함) */
export async function loginToHometax(clinicId) {
    log.info({ clinicId }, '홈택스 로그인 시작');
    // 1. 인증정보 조회
    const credentials = await getCredentials(clinicId);
    if (!credentials) {
        return {
            success: false,
            context: null,
            errorMessage: '홈택스 인증정보가 등록되지 않았습니다',
            errorCode: 'INVALID_CREDENTIALS',
        };
    }
    // 2. 저장된 세션으로 먼저 시도
    const savedSession = await loadSession(clinicId);
    if (savedSession) {
        log.info({ clinicId }, '저장된 세션으로 로그인 시도');
        const context = await createContext(savedSession.cookies);
        const valid = await isSessionValid(context);
        if (valid) {
            log.info({ clinicId }, '세션 재사용 성공');
            await recordLoginResult(clinicId, true);
            return { success: true, context };
        }
        await context.close();
        log.info({ clinicId }, '저장된 세션 만료, 새 로그인 진행');
    }
    // 3. 새 로그인 수행 (재시도 포함)
    const context = await createContext();
    const page = await createPage(context);
    try {
        await withRetry(async () => {
            const loginResult = await performLogin(page, credentials.login_id, credentials.login_pw, credentials.resident_number);
            if (!loginResult.success) {
                // CAPTCHA나 추가인증은 재시도 불가
                if (loginResult.errorCode === 'CAPTCHA_REQUIRED' || loginResult.errorCode === 'ADDITIONAL_AUTH') {
                    throw Object.assign(new Error(loginResult.errorMessage), { noRetry: true });
                }
                throw new Error(loginResult.errorMessage);
            }
            return loginResult;
        }, 'hometax-login', { maxRetries: 2, delays: [3000, 5000] });
        // 로그인 성공
        log.info({ clinicId }, '홈택스 로그인 성공');
        await saveSession(clinicId, context);
        await recordLoginResult(clinicId, true);
        await page.close();
        return { success: true, context };
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.error({ clinicId, err }, '홈택스 로그인 최종 실패');
        await recordLoginResult(clinicId, false, message);
        await page.close();
        await context.close();
        return {
            success: false,
            context: null,
            errorMessage: message,
            errorCode: 'UNKNOWN',
        };
    }
}
/** 홈택스 로그아웃 */
export async function logoutFromHometax(context) {
    try {
        const page = await createPage(context);
        try {
            await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
            const logoutBtn = await page.$('text=로그아웃');
            if (logoutBtn) {
                await logoutBtn.click();
                await page.waitForTimeout(2000);
            }
        }
        finally {
            await page.close();
        }
    }
    catch (err) {
        log.warn({ err }, '로그아웃 실패 (무시)');
    }
    finally {
        await context.close();
    }
}
//# sourceMappingURL=loginService.js.map