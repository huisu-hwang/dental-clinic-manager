import { getSupabaseClient } from '../db/supabaseClient.js';
import { createChildLogger } from '../utils/logger.js';
const log = createChildLogger('sessionManager');
/** 현재 컨텍스트 쿠키를 DB에 저장 */
export async function saveSession(clinicId, context) {
    const cookies = await context.cookies();
    const hometaxCookies = cookies.filter(c => c.domain.includes('hometax.go.kr') || c.domain.includes('nts.go.kr'));
    if (hometaxCookies.length === 0) {
        log.warn({ clinicId }, '저장할 홈택스 쿠키 없음');
        return;
    }
    const session = {
        cookies: hometaxCookies,
        savedAt: new Date().toISOString(),
    };
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from('hometax_credentials')
        .update({ session_data: session })
        .eq('clinic_id', clinicId);
    if (error) {
        log.error({ error, clinicId }, '세션 저장 실패');
    }
    else {
        log.info({ clinicId, cookieCount: hometaxCookies.length }, '세션 저장 완료');
    }
}
/** DB에서 저장된 세션 쿠키 로드 */
export async function loadSession(clinicId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('hometax_credentials')
        .select('session_data')
        .eq('clinic_id', clinicId)
        .single();
    if (error || !data?.session_data) {
        return null;
    }
    const session = data.session_data;
    // 세션 만료 체크 (1시간 이상 경과 시 무효)
    const savedAt = new Date(session.savedAt).getTime();
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;
    if (now - savedAt > ONE_HOUR) {
        log.info({ clinicId }, '저장된 세션 만료 (1시간 초과)');
        return null;
    }
    log.info({ clinicId, cookieCount: session.cookies.length }, '저장된 세션 로드');
    return session;
}
/** 세션 유효성 확인 (홈택스 마이페이지 접근 가능 여부) */
export async function isSessionValid(context) {
    try {
        const page = await context.newPage();
        try {
            // 홈택스 메인 페이지에서 로그인 상태 확인
            await page.goto('https://www.hometax.go.kr/websquare/websquare.wq?w2xPath=/ui/pp/index_pp.xml', {
                waitUntil: 'domcontentloaded',
                timeout: 15000,
            });
            // 로그아웃 버튼이 있으면 로그인된 상태
            const logoutBtn = await page.$('text=로그아웃');
            return logoutBtn !== null;
        }
        finally {
            await page.close();
        }
    }
    catch (err) {
        log.debug({ err }, '세션 유효성 확인 실패');
        return false;
    }
}
//# sourceMappingURL=sessionManager.js.map