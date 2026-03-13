import { BrowserContext } from 'playwright';
export interface StoredSession {
    cookies: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        sameSite: 'Strict' | 'Lax' | 'None';
    }>;
    savedAt: string;
}
/** 현재 컨텍스트 쿠키를 DB에 저장 */
export declare function saveSession(clinicId: string, context: BrowserContext): Promise<void>;
/** DB에서 저장된 세션 쿠키 로드 */
export declare function loadSession(clinicId: string): Promise<StoredSession | null>;
/** 세션 유효성 확인 (홈택스 마이페이지 접근 가능 여부) */
export declare function isSessionValid(context: BrowserContext): Promise<boolean>;
//# sourceMappingURL=sessionManager.d.ts.map