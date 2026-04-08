/**
 * 간단한 In-Memory Rate Limiter
 * Vercel Serverless 환경에서 기본적인 rate limiting을 제공합니다.
 *
 * 주의: 서버리스 환경에서는 인스턴스별 메모리이므로 완벽하지 않습니다.
 * 프로덕션에서는 Upstash Redis 기반 @upstash/ratelimit 사용을 권장합니다.
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

const store = new Map<string, RateLimitEntry>()

// 주기적으로 만료된 엔트리 정리 (메모리 누수 방지)
const CLEANUP_INTERVAL = 60 * 1000 // 1분
let lastCleanup = Date.now()

function cleanup() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, entry] of store) {
    if (now > entry.resetTime) {
      store.delete(key)
    }
  }
}

interface RateLimitOptions {
  /** 시간 윈도우 (밀리초) */
  windowMs: number
  /** 윈도우 내 최대 요청 수 */
  max: number
}

interface RateLimitResult {
  success: boolean
  remaining: number
  resetTime: number
}

export function rateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
  cleanup()

  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + options.windowMs })
    return { success: true, remaining: options.max - 1, resetTime: now + options.windowMs }
  }

  entry.count++

  if (entry.count > options.max) {
    return { success: false, remaining: 0, resetTime: entry.resetTime }
  }

  return { success: true, remaining: options.max - entry.count, resetTime: entry.resetTime }
}

/**
 * NextRequest에서 클라이언트 IP 추출
 */
export function getClientIp(request: Request): string {
  const headers = new Headers(request.headers)
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}
