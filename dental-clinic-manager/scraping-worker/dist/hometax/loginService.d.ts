import { BrowserContext } from 'playwright';
export interface LoginResult {
    success: boolean;
    context: BrowserContext | null;
    errorMessage?: string;
    errorCode?: 'INVALID_CREDENTIALS' | 'CAPTCHA_REQUIRED' | 'ADDITIONAL_AUTH' | 'MAINTENANCE' | 'TIMEOUT' | 'UNKNOWN';
}
/** 홈택스 로그인 (세션 재사용 포함) */
export declare function loginToHometax(clinicId: string): Promise<LoginResult>;
/** 홈택스 로그아웃 */
export declare function logoutFromHometax(context: BrowserContext): Promise<void>;
//# sourceMappingURL=loginService.d.ts.map