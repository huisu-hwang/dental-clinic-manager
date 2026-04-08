/**
 * 안전한 에러 메시지 반환
 * 프로덕션에서는 제네릭 메시지만 반환하고, 개발 환경에서는 상세 에러를 반환합니다.
 * DB 스키마/쿼리 구조 노출을 방지합니다.
 */
export function safeErrorMessage(error: unknown, context?: string): string {
  const detailedMessage = error instanceof Error ? error.message : 'Unknown error'

  // 개발 환경에서는 상세 에러 반환
  if (process.env.NODE_ENV === 'development') {
    return detailedMessage
  }

  // 프로덕션에서는 서버 로그에만 상세 기록
  if (context) {
    console.error(`[${context}]`, detailedMessage)
  }

  return 'Internal server error'
}
