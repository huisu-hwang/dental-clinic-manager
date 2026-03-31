import { createHttpSession, initSession, httpPost, httpGet, closeHttpSession } from './httpClient.js';
import { HttpSession } from '../types/scrapingContext.js';
import { getApiClient } from '../db/supabaseClient.js';
import { decryptFromJson } from '../crypto/encryption.js';
import { createChildLogger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

const log = createChildLogger('loginProtocol');

export interface ProtocolLoginResult {
  success: boolean;
  session: HttpSession | null;
  errorMessage?: string;
  errorCode?: 'INVALID_CREDENTIALS' | 'CAPTCHA_REQUIRED' | 'ADDITIONAL_AUTH' | 'MAINTENANCE' | 'TIMEOUT' | 'UNKNOWN';
}

/** DB에서 클리닉의 홈택스 인증정보 복호화 조회 */
async function getCredentials(clinicId: string): Promise<{ login_id: string; login_pw: string; resident_number: string | null; business_number: string } | null> {
  const client = getApiClient();
  const credentialsList = await client.getHometaxCredentials(clinicId);
  const data = credentialsList?.[0];

  if (!data) {
    log.error({ clinicId }, '홈택스 인증정보 조회 실패');
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
  const client = getApiClient();
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

  try {
    await client.updateHometaxCredentials(clinicId, update);
  } catch (err) {
    log.error({ err, clinicId }, '로그인 결과 DB 기록 실패');
  }
}

/** HTTP 기반 홈택스 로그인 수행 */
async function performHttpLogin(session: HttpSession, loginId: string, loginPw: string, residentNumber?: string | null): Promise<{ success: boolean; errorMessage?: string; errorCode?: ProtocolLoginResult['errorCode'] }> {
  try {
    // 1. 초기 세션 획득 (WMONID 등 쿠키)
    await initSession(session);

    // 2. 로그인 POST 요청 (주민등록번호 포함)
    log.info('HTTP 로그인 시도');
    const loginParams: Record<string, string> = {
      userId: loginId,
      userPw: loginPw,
      loginType: 'ID',
      ssoLoginYN: 'N',
    };

    // 주민등록번호가 있으면 생년월일 + 성별코드 추가
    if (residentNumber) {
      loginParams.srnoBirth = residentNumber.substring(0, 6);
      loginParams.srnoGndr = residentNumber.substring(6, 7);
    }

    const loginRes = await httpPost(
      session,
      '/pubcLogin/Login.do',
      loginParams,
      'form',
    );

    // 3. 응답 분석
    const body = loginRes.body;

    // 에러 케이스 감지
    if (body.includes('보안문자') || body.includes('자동입력방지') || body.includes('captcha')) {
      return { success: false, errorMessage: 'CAPTCHA 입력이 필요합니다', errorCode: 'CAPTCHA_REQUIRED' };
    }

    if (body.includes('추가인증') || body.includes('본인확인')) {
      return { success: false, errorMessage: '추가 인증이 필요합니다', errorCode: 'ADDITIONAL_AUTH' };
    }

    if (body.includes('점검') || body.includes('maintenance')) {
      return { success: false, errorMessage: '홈택스 시스템 점검 중', errorCode: 'MAINTENANCE' };
    }

    if (body.includes('일치하지 않') || body.includes('올바르지 않') || body.includes('확인해 주세요')) {
      return { success: false, errorMessage: '아이디 또는 비밀번호가 올바르지 않습니다', errorCode: 'INVALID_CREDENTIALS' };
    }

    // 리다이렉트 또는 세션 쿠키 존재 여부로 성공 판단
    if (loginRes.status === 302 || loginRes.status === 200) {
      // 세션 유효성 검증: 마이홈택스 접근 시도
      const verifyRes = await httpGet(session, '/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml');
      if (verifyRes.body.includes('로그아웃') || verifyRes.body.includes('마이홈택스')) {
        session.valid = true;
        return { success: true };
      }
    }

    return { success: false, errorMessage: '로그인 결과 확인 실패', errorCode: 'UNKNOWN' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ err }, 'HTTP 로그인 중 오류');
    return { success: false, errorMessage: message, errorCode: 'UNKNOWN' };
  }
}

/** Protocol 모드 홈택스 로그인 (세션 재사용 포함) */
export async function loginViaProtocol(clinicId: string): Promise<ProtocolLoginResult> {
  log.info({ clinicId }, 'Protocol 모드 로그인 시작');

  // 1. 인증정보 조회
  const credentials = await getCredentials(clinicId);
  if (!credentials) {
    return {
      success: false,
      session: null,
      errorMessage: '홈택스 인증정보가 등록되지 않았습니다',
      errorCode: 'INVALID_CREDENTIALS',
    };
  }

  // 2. 저장된 세션 복원 시도 (API를 통해)
  const client = getApiClient();
  const credentialsList = await client.getHometaxCredentials(clinicId);
  const data = credentialsList?.[0];
  const savedSession = data?.protocol_session_data;

  if (savedSession?.cookies) {
    log.info({ clinicId }, '저장된 HTTP 세션으로 복원 시도');
    const session = createHttpSession();
    session.cookies = savedSession.cookies as Record<string, string>;

    // 세션 유효성 검증
    try {
      const verifyRes = await httpGet(session, '/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml');
      if (verifyRes.body.includes('로그아웃') || verifyRes.body.includes('마이홈택스')) {
        session.valid = true;
        log.info({ clinicId }, 'HTTP 세션 복원 성공');
        await recordLoginResult(clinicId, true);
        return { success: true, session };
      }
    } catch {
      log.info({ clinicId }, '저장된 HTTP 세션 만료');
    }
  }

  // 3. 새 로그인 수행
  const session = createHttpSession();

  try {
    await withRetry(
      async () => {
        const result = await performHttpLogin(session, credentials.login_id, credentials.login_pw, credentials.resident_number);
        if (!result.success) {
          if (result.errorCode === 'CAPTCHA_REQUIRED' || result.errorCode === 'ADDITIONAL_AUTH') {
            throw Object.assign(new Error(result.errorMessage), { noRetry: true });
          }
          throw new Error(result.errorMessage);
        }
        return result;
      },
      'protocol-login',
      { maxRetries: 2, delays: [3000, 5000] },
    );

    // 로그인 성공 → 세션 저장
    log.info({ clinicId }, 'Protocol 로그인 성공');
    await recordLoginResult(clinicId, true);

    // 세션 쿠키 DB 저장
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // 1시간 유효
    
    try {
      await client.updateHometaxCredentials(clinicId, {
        protocol_session_data: {
          cookies: session.cookies,
          expires_at: expiresAt.toISOString()
        }
      });
    } catch (err) {
      log.error({ err, clinicId }, 'Protocol 세션 저장 실패');
    }

    return { success: true, session };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ clinicId, err }, 'Protocol 로그인 최종 실패');
    await recordLoginResult(clinicId, false, message);

    return {
      success: false,
      session: null,
      errorMessage: message,
      errorCode: 'UNKNOWN',
    };
  }
}

/** Protocol 모드 로그아웃 */
export async function logoutViaProtocol(session: HttpSession): Promise<void> {
  await closeHttpSession(session);
}
