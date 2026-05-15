// courtauction.go.kr 호출용 fetch 래퍼.
// FIXIE_URL 이 있으면 undici ProxyAgent 로 고정 IP 발신, 없으면 기본 fetch.
// GET 검색 페이지 → 응답 Set-Cookie 추출 → POST API 호출 시 Cookie 헤더에 첨부.
//
// 차단 위험 관리:
//   - lazy on-demand 만 호출 (사용자 매물 상세 진입 시 1건)
//   - 같은 매물 photos 컬럼 캐싱 → 재호출 안 함
//   - 짧은 throttle (호출 간 200ms 이상 권장)

import { fetch as undiciFetch, ProxyAgent } from 'undici'

const FIXIE_URL = process.env.FIXIE_URL?.trim()
const dispatcher = FIXIE_URL ? new ProxyAgent(FIXIE_URL) : undefined

const BASE = 'https://www.courtauction.go.kr'
const INIT_PATH = '/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ151F00.xml'

const COMMON_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
}

export interface CourtAuctionSession {
  fetchApi: (path: string, body: unknown, submissionId: string) => Promise<{ status: number; body: string }>
}

function parseSetCookie(setCookieHeaders: string[]): string {
  // "name=value; Path=/; HttpOnly" 형태에서 name=value 만 추출
  return setCookieHeaders
    .map((h) => h.split(';')[0].trim())
    .filter(Boolean)
    .join('; ')
}

/** 세션 쿠키 발급 받고 API 호출 가능한 객체 반환 */
export async function createCourtAuctionSession(): Promise<CourtAuctionSession> {
  // 1) 검색 페이지 GET — Set-Cookie 받음
  const initRes = await undiciFetch(`${BASE}${INIT_PATH}`, {
    method: 'GET',
    headers: COMMON_HEADERS,
    dispatcher,
  })
  if (initRes.status !== 200) throw new Error(`courtauction init failed: ${initRes.status}`)

  // undici Headers.getSetCookie() — Node 20+ 지원
  const setCookies = (initRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  const cookieHeader = parseSetCookie(setCookies)

  return {
    fetchApi: async (path, body, submissionId) => {
      const res = await undiciFetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
          ...COMMON_HEADERS,
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json',
          'submissionid': submissionId,
          'sc-userid': 'SYSTEM',
          ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
        },
        body: JSON.stringify(body),
        dispatcher,
      })
      const text = await res.text()
      return { status: res.status, body: text }
    },
  }
}
