import { HttpSession } from '../types/scrapingContext.js';
export interface ProtocolLoginResult {
    success: boolean;
    session: HttpSession | null;
    errorMessage?: string;
    errorCode?: 'INVALID_CREDENTIALS' | 'CAPTCHA_REQUIRED' | 'ADDITIONAL_AUTH' | 'MAINTENANCE' | 'TIMEOUT' | 'UNKNOWN';
}
/** Protocol 모드 홈택스 로그인 (세션 재사용 포함) */
export declare function loginViaProtocol(clinicId: string): Promise<ProtocolLoginResult>;
/** Protocol 모드 로그아웃 */
export declare function logoutViaProtocol(session: HttpSession): Promise<void>;
//# sourceMappingURL=loginProtocol.d.ts.map