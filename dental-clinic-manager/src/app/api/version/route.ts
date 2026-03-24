import { NextResponse } from 'next/server'

// 빌드 시점에 고정되는 버전 ID
// Next.js는 빌드마다 고유한 BUILD_ID를 생성함
const BUILD_TIMESTAMP = process.env.BUILD_TIMESTAMP || Date.now().toString()
const BUILD_ID = process.env.NEXT_BUILD_ID || BUILD_TIMESTAMP

export const dynamic = 'force-dynamic' // 항상 최신 값 반환
export const revalidate = 0

export async function GET() {
  return NextResponse.json(
    { buildId: BUILD_ID, timestamp: BUILD_TIMESTAMP },
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  )
}
