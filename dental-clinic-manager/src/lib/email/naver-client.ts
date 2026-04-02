/**
 * 네이버 메일 클라이언트
 *
 * Vercel Serverless에서 raw TCP 소켓(IMAP)은 사용 불가.
 * - 서버: 설정 저장/조회 + 암호화된 자격증명 관리만 담당
 * - 워커(Electron): 직접 IMAP 접속하여 메일 조회 수행
 *
 * 이 파일은 연결 테스트 타입/인터페이스 정의 역할만 함.
 * 실제 IMAP 연결은 워커(scraping-worker)에서 수행.
 */

export interface NaverMailCredentials {
  email: string;
  password: string;
}

export interface NaverConnectionTestResult {
  success: boolean;
  error?: string;
}

/**
 * 네이버 메일 연결 테스트
 *
 * 주의: Vercel Serverless에서 IMAP 소켓 사용이 제한적이므로
 * 실제 연결 테스트는 워커에서 수행하는 것을 권장.
 * 서버에서는 자격증명 형식 유효성 검사만 수행.
 */
export function validateNaverCredentials(
  email: string,
  password: string
): NaverConnectionTestResult {
  if (!email || !email.includes('@')) {
    return { success: false, error: '유효한 이메일 주소를 입력해 주세요.' };
  }
  if (!password || password.length < 1) {
    return { success: false, error: '비밀번호를 입력해 주세요.' };
  }
  if (!email.endsWith('@naver.com') && !email.endsWith('@naver.net')) {
    return { success: false, error: '네이버 이메일 주소(@naver.com)를 입력해 주세요.' };
  }
  return { success: true };
}
