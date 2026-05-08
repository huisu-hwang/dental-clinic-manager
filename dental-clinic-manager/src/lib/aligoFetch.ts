// 알리고 API 호출용 fetch 래퍼.
// FIXIE_URL 이 설정돼 있으면 undici ProxyAgent 를 거쳐 Fixie 고정 IP 로 발신.
// 미설정이면 기본 fetch 동작과 동일.
//
// 알리고는 발송 IP 화이트리스트(IP 인증) 정책을 운영하지만 Vercel 서버리스는
// outbound IP 가 매 호출마다 달라져 화이트리스트를 유지할 수 없다. Fixie 가
// 발급하는 고정 IP 풀로 모든 알리고 호출을 우회시키면 화이트리스트가 안정화된다.

import { fetch as undiciFetch, ProxyAgent } from 'undici'

const FIXIE_URL = process.env.FIXIE_URL?.trim()
const dispatcher = FIXIE_URL ? new ProxyAgent(FIXIE_URL) : undefined

export const aligoFetch = ((input, init) => {
  if (!dispatcher) return globalThis.fetch(input, init)
  return undiciFetch(
    input as Parameters<typeof undiciFetch>[0],
    { ...(init as object | undefined ?? {}), dispatcher }
  ) as unknown as Promise<Response>
}) as typeof fetch
