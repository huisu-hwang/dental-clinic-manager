/**
 * 타임아웃 상수 정의
 *
 * 모든 타임아웃 값은 이 파일에서 중앙 집중 관리합니다.
 * 환경 변수로 오버라이드 가능합니다.
 *
 * 참고:
 * - Supabase 공식 문서: JWT 기본 만료 시간 1시간
 * - Supabase 공식 문서: 리프레시 토큰 재사용 간격 10초 (기본, 변경 비권장)
 * - sessionUtils.ts: SESSION_REFRESH_TIMEOUT = 10000ms (10초)
 *
 * @see https://supabase.com/docs/guides/auth/sessions
 */

/**
 * 타임아웃 상수 (밀리초 단위)
 */
export const TIMEOUTS = {
  /**
   * 세션 갱신 타임아웃
   * Supabase 리프레시 토큰 재사용 간격(10초)에 맞춤
   */
  SESSION_REFRESH: 10000, // 10초

  /**
   * 세션 체크 타임아웃
   * getSession() 호출 시 최대 대기 시간
   */
  SESSION_CHECK: 10000, // 10초

  /**
   * 전체 세션 체크 타임아웃
   * AuthContext에서 사용 (세션 체크 + 사용자 프로필 로드)
   */
  SESSION_TOTAL: 15000, // 15초

  /**
   * 로그아웃 타임아웃
   * Supabase signOut() 호출 시 최대 대기 시간
   */
  LOGOUT: 5000, // 5초

  /**
   * 기본 데이터베이스 쿼리 타임아웃
   * 단순 SELECT 쿼리용
   */
  QUERY_DEFAULT: 30000, // 30초

  /**
   * 긴 데이터베이스 쿼리 타임아웃
   * 복잡한 JOIN, 집계 등의 쿼리용
   */
  QUERY_LONG: 60000, // 60초

  /**
   * 유저 비활동 타임아웃
   * 마지막 활동 후 자동 로그아웃까지의 시간
   */
  INACTIVITY: 4 * 60 * 60 * 1000, // 4시간

  /**
   * 데이터베이스 연결 타임아웃
   * Connection pool 연결 시도 최대 시간
   */
  DB_CONNECTION: 10000, // 10초
} as const

/**
 * 타임아웃 키 타입
 */
export type TimeoutKey = keyof typeof TIMEOUTS

/**
 * 환경 변수로 오버라이드 가능한 타임아웃 값 가져오기
 *
 * @param key - 타임아웃 키
 * @returns 타임아웃 값 (밀리초)
 *
 * @example
 * // 기본값 사용
 * const timeout = getTimeout('SESSION_REFRESH') // 10000
 *
 * // 환경 변수 NEXT_PUBLIC_TIMEOUT_SESSION_REFRESH=15000 설정 시
 * const timeout = getTimeout('SESSION_REFRESH') // 15000
 */
export function getTimeout(key: TimeoutKey): number {
  // 환경 변수 키 생성 (예: NEXT_PUBLIC_TIMEOUT_SESSION_REFRESH)
  const envKey = `NEXT_PUBLIC_TIMEOUT_${key}`.toUpperCase()
  const envValue = process.env[envKey]

  // 환경 변수가 있으면 파싱하여 반환
  if (envValue) {
    const parsed = parseInt(envValue, 10)
    if (!isNaN(parsed) && parsed > 0) {
      return parsed
    }
  }

  // 기본값 반환
  return TIMEOUTS[key]
}

/**
 * 초 단위를 밀리초 단위로 변환
 *
 * @param seconds - 초
 * @returns 밀리초
 *
 * @example
 * secondsToMs(10) // 10000
 */
export function secondsToMs(seconds: number): number {
  return seconds * 1000
}

/**
 * 밀리초 단위를 초 단위로 변환
 *
 * @param ms - 밀리초
 * @returns 초
 *
 * @example
 * msToSeconds(10000) // 10
 */
export function msToSeconds(ms: number): number {
  return ms / 1000
}
