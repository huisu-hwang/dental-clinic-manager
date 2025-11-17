/**
 * 민감한 정보 접근을 위한 보안 세션 관리
 *
 * 근로계약서, 계정 정보 등 민감한 정보에 접근할 때
 * 비밀번호를 재확인하고 일정 시간 동안 유효한 세션을 생성합니다.
 */

export type SecuritySessionType = 'contract' | 'profile';

const SESSION_DURATION = 10 * 60 * 1000; // 10분
const STORAGE_PREFIX = 'security_session_';

interface SecuritySession {
  timestamp: number;
  expiresAt: number;
}

/**
 * 보안 세션 생성
 * @param type 세션 타입 ('contract' | 'profile')
 */
export function setSecuritySession(type: SecuritySessionType): void {
  const now = Date.now();
  const session: SecuritySession = {
    timestamp: now,
    expiresAt: now + SESSION_DURATION,
  };

  localStorage.setItem(
    `${STORAGE_PREFIX}${type}`,
    JSON.stringify(session)
  );

  console.log(`[SecuritySession] Created ${type} session, valid for ${SESSION_DURATION / 1000 / 60} minutes`);
}

/**
 * 보안 세션 확인
 * @param type 세션 타입
 * @returns 유효한 세션이 있으면 true
 */
export function checkSecuritySession(type: SecuritySessionType): boolean {
  try {
    const sessionData = localStorage.getItem(`${STORAGE_PREFIX}${type}`);

    if (!sessionData) {
      console.log(`[SecuritySession] No ${type} session found`);
      return false;
    }

    const session: SecuritySession = JSON.parse(sessionData);
    const now = Date.now();

    if (now > session.expiresAt) {
      console.log(`[SecuritySession] ${type} session expired`);
      clearSecuritySession(type);
      return false;
    }

    const remainingMinutes = Math.floor((session.expiresAt - now) / 1000 / 60);
    console.log(`[SecuritySession] ${type} session valid, ${remainingMinutes} minutes remaining`);
    return true;
  } catch (error) {
    console.error('[SecuritySession] Error checking session:', error);
    clearSecuritySession(type);
    return false;
  }
}

/**
 * 보안 세션 삭제
 * @param type 세션 타입
 */
export function clearSecuritySession(type: SecuritySessionType): void {
  localStorage.removeItem(`${STORAGE_PREFIX}${type}`);
  console.log(`[SecuritySession] Cleared ${type} session`);
}

/**
 * 모든 보안 세션 삭제
 */
export function clearAllSecuritySessions(): void {
  const types: SecuritySessionType[] = ['contract', 'profile'];
  types.forEach(type => clearSecuritySession(type));
  console.log('[SecuritySession] Cleared all security sessions');
}

/**
 * 세션 남은 시간 조회 (분 단위)
 * @param type 세션 타입
 * @returns 남은 시간 (분), 세션 없으면 0
 */
export function getRemainingTime(type: SecuritySessionType): number {
  try {
    const sessionData = localStorage.getItem(`${STORAGE_PREFIX}${type}`);
    if (!sessionData) return 0;

    const session: SecuritySession = JSON.parse(sessionData);
    const now = Date.now();

    if (now > session.expiresAt) return 0;

    return Math.floor((session.expiresAt - now) / 1000 / 60);
  } catch {
    return 0;
  }
}
