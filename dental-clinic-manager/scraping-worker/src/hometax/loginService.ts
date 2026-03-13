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
}

/** DB에서 클리닉의 홈택스 인증정보 복호화 조회 */
async function getCredentials(clinicId: string): Promise<HometaxCredentials | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('hometax_credentials')
    .select('encrypted_login_id, encrypted_login_pw, business_number')
    .eq('clinic_id', clinicId)
    .single();

  if (error || !data) {
    log.error({ error, clinicId }, '홈택스 인증정보 조회 실패');
    return null;
  }

  try {
    return {
      login_id: decryptFromJson(data.encrypted_login_id),
      login_pw: decryptFromJson(data.encrypted_login_pw),
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
async function performLogin(page: Page, loginId: string, loginPw: string): Promise<{ success: boolean; errorMessage?: string; errorCode?: LoginResult['errorCode'] }> {
  try {
    // 1. 홈택스 메인 접속
    log.info('홈택스 메인 페이지 접속');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // 보안 프로그램 팝업 닫기 (있는 경우)
    await dismissSecurityPopups(page);

    // 2. 로그인 버튼 클릭하여 로그인 페이지 이동
    log.info('로그인 페이지 이동');
    const loginBtn = await page.$('a[href*="login"], button:has-text("로그인"), .login_btn, #login_btn');
    if (loginBtn) {
      await loginBtn.click();
      await page.waitForLoadState('domcontentloaded', { timeout: 15000 });
    }

    // 3. "아이디 로그인" 탭 선택
    log.info('아이디 로그인 탭 선택');
    const idLoginTab = await page.$('text=아이디 로그인');
    if (idLoginTab) {
      await idLoginTab.click();
      await page.waitForTimeout(1000);
    }

    // 4. ID 입력 (홈택스는 키보드 이벤트를 감지하므로 type 사용)
    log.info('ID/PW 입력');
    const idInput = await page.$('input[id*="iptUserId"], input[name*="userId"], input[id*="id"]');
    if (!idInput) {
      return { success: false, errorMessage: '아이디 입력 필드를 찾을 수 없습니다', errorCode: 'UNKNOWN' };
    }

    await idInput.click();
    await idInput.fill('');
    await page.keyboard.type(loginId, { delay: 50 });

    // 5. PW 입력
    const pwInput = await page.$('input[id*="iptUserPw"], input[name*="userPw"], input[type="password"]');
    if (!pwInput) {
      return { success: false, errorMessage: '비밀번호 입력 필드를 찾을 수 없습니다', errorCode: 'UNKNOWN' };
    }

    await pwInput.click();
    await pwInput.fill('');
    await page.keyboard.type(loginPw, { delay: 50 });

    // 6. 로그인 버튼 클릭
    log.info('로그인 시도');
    const submitBtn = await page.$('button:has-text("로그인"), input[type="submit"], .btn_login, #btn_login');
    if (!submitBtn) {
      return { success: false, errorMessage: '로그인 버튼을 찾을 수 없습니다', errorCode: 'UNKNOWN' };
    }

    await submitBtn.click();

    // 7. 로그인 결과 확인 (최대 15초 대기)
    const result = await Promise.race([
      waitForLoginSuccess(page),
      waitForLoginError(page),
      page.waitForTimeout(15000).then(() => ({
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

/** 로그인 성공 감지 */
async function waitForLoginSuccess(page: Page): Promise<{ success: boolean; errorMessage?: string; errorCode?: LoginResult['errorCode'] }> {
  try {
    // 로그아웃 버튼 또는 마이페이지 요소 출현 대기
    await page.waitForSelector('text=로그아웃, text=마이홈택스, .user_name, #logoutBtn', {
      timeout: 12000,
    });
    return { success: true };
  } catch {
    return { success: false, errorMessage: '로그인 성공 확인 실패', errorCode: 'UNKNOWN' };
  }
}

/** 로그인 에러 감지 */
async function waitForLoginError(page: Page): Promise<{ success: boolean; errorMessage?: string; errorCode?: LoginResult['errorCode'] }> {
  try {
    // 에러 메시지 팝업/알림 감지
    const errorEl = await page.waitForSelector(
      '.err_msg, .alert_msg, text=비밀번호가 일치하지 않습니다, text=아이디를 확인해 주세요, text=입력하신 정보가 올바르지 않습니다',
      { timeout: 12000 }
    );

    if (errorEl) {
      const errorText = await errorEl.textContent();

      // CAPTCHA 감지
      if (errorText?.includes('보안문자') || errorText?.includes('자동입력방지')) {
        return { success: false, errorMessage: 'CAPTCHA 입력이 필요합니다', errorCode: 'CAPTCHA_REQUIRED' };
      }

      // 추가 인증 감지
      if (errorText?.includes('추가인증') || errorText?.includes('본인확인')) {
        return { success: false, errorMessage: '추가 인증이 필요합니다', errorCode: 'ADDITIONAL_AUTH' };
      }

      // 잘못된 자격증명
      return { success: false, errorMessage: errorText?.trim() || '로그인 실패', errorCode: 'INVALID_CREDENTIALS' };
    }

    return { success: false, errorMessage: '알 수 없는 로그인 오류', errorCode: 'UNKNOWN' };
  } catch {
    // waitForSelector timeout → 에러 메시지가 없음 (성공 가능성)
    return { success: false, errorMessage: '로그인 결과 확인 실패', errorCode: 'UNKNOWN' };
  }
}

/** 보안 프로그램 설치 팝업 닫기 */
async function dismissSecurityPopups(page: Page): Promise<void> {
  try {
    // 일반적인 보안 프로그램 팝업 닫기 버튼들
    const closeSelectors = [
      'text=닫기',
      'text=나중에 설치',
      'text=설치 안 함',
      '.popup_close',
      '.btn_close',
    ];

    for (const selector of closeSelectors) {
      const btn = await page.$(selector);
      if (btn) {
        const isVisible = await btn.isVisible();
        if (isVisible) {
          await btn.click();
          await page.waitForTimeout(500);
          log.debug({ selector }, '보안 팝업 닫기');
        }
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
        const loginResult = await performLogin(page, credentials.login_id, credentials.login_pw);
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
