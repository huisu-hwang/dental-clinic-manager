import { Page, BrowserContext } from 'playwright';
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
async function safeClick(page: Page, selectors: string | string[], description: string, options?: { timeout?: number }): Promise<boolean> {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors];
  const timeout = options?.timeout ?? 10000;

  for (const selector of selectorList) {
    try {
      // 1차: locator로 visible 요소만 대상으로 클릭 시도
      const locator = page.locator(selector).first();
      await locator.click({ timeout });
      log.info({ selector, description }, '클릭 성공 (locator)');
      return true;
    } catch {
      // 2차: JS 직접 클릭 시도 — page.evaluate 내부는 브라우저 컨텍스트
      try {
        const clicked = await page.evaluate((sel: string) => {
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const doc = (globalThis as any).document;
          const elements = doc.querySelectorAll(sel);
          for (let i = 0; i < elements.length; i++) {
            const el = elements[i] as any;
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 || rect.height > 0 || el.offsetParent !== null) {
              el.click();
              return true;
            }
          }
          if (elements.length > 0) {
            (elements[0] as any).click();
            return true;
          }
          return false;
        }, selector);

        if (clicked) {
          log.info({ selector, description }, '클릭 성공 (JS fallback)');
          return true;
        }
      } catch {
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
async function safeType(page: Page, selectors: string | string[], text: string, description: string): Promise<boolean> {
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
    } catch {
      // JS 폴백: focus + value 설정 후 이벤트 발생 — 브라우저 컨텍스트
      try {
        const found = await page.evaluate(({ sel, val }: { sel: string; val: string }) => {
          /* eslint-disable @typescript-eslint/no-explicit-any */
          const doc = (globalThis as any).document;
          const win = globalThis as any; // eslint-disable-line @typescript-eslint/no-explicit-any
          const el = doc.querySelector(sel);
          if (!el) return false;
          el.focus();
          el.value = '';
          const nativeInputValueSetter = win.Object.getOwnPropertyDescriptor(
            win.HTMLInputElement.prototype, 'value'
          )?.set;
          if (nativeInputValueSetter) {
            nativeInputValueSetter.call(el, val);
          } else {
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
      } catch {
        log.debug({ selector, description }, 'JS 입력도 실패, 다음 셀렉터 시도');
      }
    }
  }
  log.warn({ selectors: selectorList, description }, '모든 셀렉터 입력 실패');
  return false;
}

export interface LoginResult {
  success: boolean;
  context: BrowserContext | null;
  errorMessage?: string;
  errorCode?: 'INVALID_CREDENTIALS' | 'CAPTCHA_REQUIRED' | 'ADDITIONAL_AUTH' | 'MAINTENANCE' | 'TIMEOUT' | 'UNKNOWN';
}

interface HometaxCredentials {
  login_id: string;
  login_pw: string;
  business_number: string;
  resident_number: string | null;
}

/** DB에서 클리닉의 홈택스 인증정보 복호화 조회 */
async function getCredentials(clinicId: string): Promise<HometaxCredentials | null> {
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
  } catch (err) {
    log.error({ err, clinicId }, '인증정보 복호화 실패');
    return null;
  }
}

/** 로그인 결과를 DB에 기록 */
async function recordLoginResult(clinicId: string, success: boolean, errorMessage?: string): Promise<void> {
  const supabase = getSupabaseClient();
  const update: Record<string, unknown> = {
    last_login_attempt: new Date().toISOString(),
    last_login_success: success,
  };

  if (success) {
    update.last_login_error = null;
    update.login_fail_count = 0;
  } else {
    update.last_login_error = errorMessage || '알 수 없는 오류';
  }

  await supabase
    .from('hometax_credentials')
    .update(update)
    .eq('clinic_id', clinicId);
}

/** 홈택스 ID/PW 로그인 수행 */
async function performLogin(page: Page, loginId: string, loginPw: string, residentNumber?: string | null): Promise<{ success: boolean; errorMessage?: string; errorCode?: LoginResult['errorCode'] }> {
  try {
    // 1. 홈택스 메인 접속
    // waitUntil: 'load' 사용 (domcontentloaded는 WebSquare SPA의 추가 네비게이션을 기다리지 않아
    // "Execution context was destroyed" 에러 발생)
    log.info('홈택스 메인 페이지 접속');
    await page.goto(LOGIN_URL, { waitUntil: 'load', timeout: 30000 });
    // WebSquare SPA 초기화 완료 대기 (JS 기반 리다이렉트/네비게이션 안정화)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // 디버그: 메인 페이지 스크린샷
    const mainSS = `/tmp/login-1-main-${Date.now()}.png`;
    await page.screenshot({ path: mainSS, fullPage: false }).catch(() => {});
    log.info({ screenshot: mainSS, url: page.url() }, '1) 메인 페이지 접속 후 스크린샷');

    // 보안 프로그램 팝업 닫기 (있는 경우)
    await dismissSecurityPopups(page);

    // 2. 로그인 버튼 클릭하여 로그인 페이지 이동
    log.info('로그인 페이지 이동');
    const loginClicked = await safeClick(page, [
      'a.hd_log',                           // 홈택스 헤더 로그인 링크
      'a[href*="login"]',
      '#login_btn',
      '.login_btn',
      'button:has-text("로그인")',
      'a:has-text("로그인")',
      'text=로그인',
    ], '로그인 버튼', { timeout: 10000 });

    if (loginClicked) {
      await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }

    // 디버그: 로그인 버튼 클릭 후 스크린샷
    const loginPageSS = `/tmp/login-2-loginpage-${Date.now()}.png`;
    await page.screenshot({ path: loginPageSS, fullPage: false }).catch(() => {});
    log.info({ screenshot: loginPageSS, url: page.url(), loginClicked }, '2) 로그인 버튼 클릭 후 스크린샷');

    // 3. "아이디 로그인" 탭 선택
    log.info('아이디 로그인 탭 선택');

    // JS TreeWalker로 "아이디 로그인" 텍스트 직접 클릭 (WebSquare SPA에서 Playwright 셀렉터 실패 보완)
    const jsIdTabResult = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const win = globalThis as any;
      const doc = win.document;
      const walker = doc.createTreeWalker(doc.body, win.NodeFilter.SHOW_ELEMENT);
      let node: any = walker.currentNode;
      while (node) {
        const el = node as any;
        const directText = Array.from(el.childNodes as any[])
          .filter((n: any) => n.nodeType === win.Node.TEXT_NODE)
          .map((n: any) => (n.textContent?.trim() || '') as string)
          .join('');
        if (directText === '아이디 로그인') {
          el.click();
          return `clicked: ${el.tagName}#${el.id}.${el.className}`;
        }
        node = walker.nextNode();
      }
      return 'not found';
    }).catch(() => 'error');

    log.info({ jsIdTabResult }, '아이디 로그인 탭 JS 클릭 결과');

    // ID 입력 필드가 visible해질 때까지 대기 (최대 10초) — 탭 클릭 성공의 핵심 지표
    const idFieldAppeared = await page.locator('input[id*="iptUserId"], input[id*="userId"]')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (!idFieldAppeared) {
      // Playwright locator로도 재시도
      await safeClick(page, [
        'text=아이디 로그인',
        'a:has-text("아이디 로그인")',
        '[class*="tab"]:has-text("아이디")',
      ], '아이디 로그인 탭 재시도', { timeout: 5000 });
      await page.waitForTimeout(3000);
    }

    // 디버그: 아이디 로그인 탭 클릭 후 스크린샷
    const idTabSS = `/tmp/login-3-idtab-${Date.now()}.png`;
    await page.screenshot({ path: idTabSS, fullPage: false }).catch(() => {});
    // 버튼 관련 요소만 추출 (디버그)
    const btnHtml = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const doc = (globalThis as any).document;
      const buttons = Array.from(doc.querySelectorAll('a, button, input[type="submit"], input[type="button"], input[type="password"], input[type="text"]') as any[])
        .filter((el: any) => {
          const text = el.textContent?.trim() || '';
          const cls = el.className || '';
          const id = el.id || '';
          return text.includes('로그인') || cls.includes('login') || cls.includes('Login') || cls.includes('logingbtn') || id.includes('UserId') || id.includes('UserPw');
        })
        .map((el: any) => `<${el.tagName} id="${el.id}" class="${el.className}" type="${el.type || ''}">${el.textContent?.trim().substring(0, 30)}</${el.tagName}>`)
        .join('\n');
      return buttons;
    }).catch(() => '');
    log.info({ screenshot: idTabSS, idFieldAppeared, loginButtons: btnHtml }, '3) 아이디 로그인 탭 후 스크린샷');

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
      } else {
        log.info('주민등록번호 입력 필드 없음 - 현재 홈택스에서 불필요, 스킵');
      }
    }

    // 6. 로그인 버튼 클릭
    log.info('로그인 시도');
    // 홈택스 아이디 로그인 폼 제출 버튼은 두 가지 화면에 따라 다름:
    // [팝업 방식] input.btn_idlogin, input.btn_login (loginboxFrame 내부)
    // [전체 페이지 방식] a#mf_txppWframe_anchor25.logingbtn (로그인 타입 선택 후 아이디 탭)
    const submitClicked = await safeClick(page, [
      'input[class*="btn_idlogin"]',              // 팝업 방식 아이디 로그인 제출 버튼
      'input[class*="btn_login"]',                // 팝업 방식 로그인 버튼
      '#mf_txppWframe_loginboxFrame_wq_uuid_923', // 팝업 방식 직접 ID
      '#mf_txppWframe_loginboxFrame_trigger2',    // 팝업 방식 직접 ID
      '#mf_txppWframe_anchor25',                  // 전체 페이지 방식 아이디 로그인 버튼
      'a.logingbtn',                              // 전체 페이지 방식 클래스 (아이디 탭 선택 후)
      '#mf_txppWframe_anchor48',                  // 전체 페이지 방식 대체 버튼
      'button:has-text("로그인")',                 // 표준 HTML 버튼 (폴백)
    ], '로그인 제출 버튼', { timeout: 10000 });

    if (!submitClicked) {
      return { success: false, errorMessage: '로그인 버튼을 찾을 수 없습니다', errorCode: 'UNKNOWN' };
    }

    // 디버그: 로그인 제출 직후 스크린샷
    const submitSS = `/tmp/login-4-submit-${Date.now()}.png`;
    await page.screenshot({ path: submitSS, fullPage: false }).catch(() => {});
    log.info({ screenshot: submitSS, submitClicked }, '4) 로그인 제출 직후 스크린샷');

    // 7. 서버 응답 대기
    await page.waitForTimeout(3000);

    // 디버그: 3초 대기 후 스크린샷
    const waitSS = `/tmp/login-5-wait-${Date.now()}.png`;
    await page.screenshot({ path: waitSS, fullPage: false }).catch(() => {});
    log.info({ screenshot: waitSS, url: page.url() }, '5) 3초 대기 후 스크린샷');

    // 8. 아이디 로그인 2차 인증 팝업 처리 (주민등록번호 필요)
    const has2FA = await page.locator('text=아이디 로그인 2차 인증').first()
      .waitFor({ state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (has2FA) {
      log.info('아이디 로그인 2차 인증 팝업 감지');
      if (!residentNumber) {
        const ss2fa = `/tmp/login-2fa-noresident-${Date.now()}.png`;
        await page.screenshot({ path: ss2fa }).catch(() => {});
        log.error({ screenshot: ss2fa }, '2차 인증 필요하지만 주민등록번호 미등록');
        return {
          success: false,
          errorMessage: '아이디 로그인 2차 인증이 필요합니다. 주민등록번호를 등록해 주세요.',
          errorCode: 'ADDITIONAL_AUTH',
        };
      }

      // 주민번호 앞 6자리(생년월일) + 성별 1자리
      const birth6 = residentNumber.substring(0, 6);
      const gender1 = residentNumber.substring(6, 7);
      log.info('2차 인증 주민번호 입력 시도');

      // 팝업 내 생년월일 6자리 입력
      await safeType(page, [
        'input[id*="birth"]:not([disabled])',
        '.w2window input[type="text"]',
        'input[placeholder*="생년월일"]',
      ], birth6, '2차 인증 생년월일');

      // 팝업 내 성별 1자리 입력
      await safeType(page, [
        'input[id*="gndr"]:not([disabled])',
        'input[id*="gender"]:not([disabled])',
        'input[placeholder*="뒷자리"]',
      ], gender1, '2차 인증 성별');

      // 확인 버튼 클릭
      await safeClick(page, [
        'button:has-text("확인")',
        'a:has-text("확인")',
        '.w2window button:has-text("확인")',
      ], '2차 인증 확인 버튼');

      await page.waitForTimeout(3000);
      log.info('2차 인증 완료, 로그인 결과 대기');
    }

    const result = await Promise.race([
      waitForLoginSuccess(page),
      waitForLoginError(page),
      page.waitForTimeout(25000).then(() => ({
        success: false,
        errorMessage: '로그인 응답 시간 초과',
        errorCode: 'TIMEOUT' as const,
      })),
    ]);

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, '로그인 수행 중 오류');
    return { success: false, errorMessage: message, errorCode: 'UNKNOWN' };
  }
}

/** 로그인 성공 감지 — 로그아웃 버튼 출현으로 판단 (가장 확실한 지표) */
async function waitForLoginSuccess(page: Page): Promise<{ success: boolean; errorMessage?: string; errorCode?: LoginResult['errorCode'] }> {
  try {
    // 로그아웃 버튼이 나타날 때까지 대기 — 로그인 성공의 가장 확실한 지표
    // 로그인 폼 URL(index_pp)과 로그인 후 메인(index_pp)이 같아서 URL 기반 판단 불가
    await page.locator('a:has-text("로그아웃"), button:has-text("로그아웃"), text=로그아웃').first()
      .waitFor({ state: 'visible', timeout: 25000 });

    const currentUrl = page.url();
    const ss = `/tmp/login-success-${Date.now()}.png`;
    await page.screenshot({ path: ss }).catch(() => {});
    log.info({ screenshot: ss, url: currentUrl }, '로그인 성공 감지 (로그아웃 버튼 확인)');
    return { success: true };
  } catch (err) {
    const currentUrl = page.url();
    const ss = `/tmp/login-fail-${Date.now()}.png`;
    await page.screenshot({ path: ss }).catch(() => {});
    log.warn({ currentUrl, screenshot: ss, err }, '로그인 성공 확인 실패 (로그아웃 버튼 미표시)');
    return { success: false, errorMessage: '로그인 후 로그아웃 버튼이 표시되지 않음', errorCode: 'UNKNOWN' };
  }
}

/** 로그인 에러 감지 — WebSquare alert 또는 visible 에러 메시지 감지 */
async function waitForLoginError(page: Page): Promise<{ success: boolean; errorMessage?: string; errorCode?: LoginResult['errorCode'] }> {
  try {
    // WebSquare는 alert() 다이얼로그를 사용할 수 있음 — dialog 이벤트 감지
    const dialogPromise = new Promise<string>((resolve) => {
      const handler = (dialog: { message: () => string; accept: () => Promise<void> }) => {
        const msg = dialog.message();
        dialog.accept().catch(() => {});
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
  } catch {
    return { success: false, errorMessage: '로그인 결과 확인 실패', errorCode: 'UNKNOWN' };
  }
}

/** 보안 프로그램 설치 팝업 닫기 */
async function dismissSecurityPopups(page: Page): Promise<void> {
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
            page.evaluate((sel: string) => {
              const el = ((globalThis as any).document).querySelector(sel); // eslint-disable-line @typescript-eslint/no-explicit-any
              if (el) (el as any).click(); // eslint-disable-line @typescript-eslint/no-explicit-any
            }, selector).catch(() => {});
          });
          await page.waitForTimeout(500);
          log.debug({ selector }, '보안 팝업 닫기');
        }
      } catch {
        // 개별 셀렉터 실패 무시
      }
    }
  } catch {
    // 팝업이 없으면 무시
  }
}

/** 홈택스 로그인 (세션 재사용 포함) */
export async function loginToHometax(clinicId: string): Promise<LoginResult> {
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
    await withRetry(
      async () => {
        const loginResult = await performLogin(page, credentials.login_id, credentials.login_pw, credentials.resident_number);
        if (!loginResult.success) {
          // CAPTCHA나 추가인증은 재시도 불가
          if (loginResult.errorCode === 'CAPTCHA_REQUIRED' || loginResult.errorCode === 'ADDITIONAL_AUTH') {
            throw Object.assign(new Error(loginResult.errorMessage), { noRetry: true });
          }
          throw new Error(loginResult.errorMessage);
        }
        return loginResult;
      },
      'hometax-login',
      { maxRetries: 2, delays: [3000, 5000] },
    );

    // 로그인 성공
    log.info({ clinicId }, '홈택스 로그인 성공');
    await saveSession(clinicId, context);
    await recordLoginResult(clinicId, true);
    await page.close();

    return { success: true, context };
  } catch (err) {
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
export async function logoutFromHometax(context: BrowserContext): Promise<void> {
  try {
    const page = await createPage(context);
    try {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const logoutBtn = await page.$('text=로그아웃');
      if (logoutBtn) {
        await logoutBtn.click();
        await page.waitForTimeout(2000);
      }
    } finally {
      await page.close();
    }
  } catch (err) {
    log.warn({ err }, '로그아웃 실패 (무시)');
  } finally {
    await context.close();
  }
}
