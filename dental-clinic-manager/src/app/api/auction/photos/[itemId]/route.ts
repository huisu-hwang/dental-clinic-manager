// 매물 사진 lazy 수집 + 캐싱.
//   GET /api/auction/photos/[itemId]
//
// 흐름:
//   1) DB photos 컬럼 조회 — 채워져 있으면 즉시 응답
//   2) source_url 에서 saNo/maemulSer/mokmulSer 파싱
//   3) Fixie 경유로 courtauction 검색 결과 API 호출 (saNo 단건 조회와 동일 페이로드)
//      → 응답 안에 detail 정보 + 이미지 키 가 있을 가능성. 후보 endpoint 들을 순차 시도.
//   4) 발견된 photo URL 들을 photos 컬럼에 UPDATE → 응답
//
// 차단 방지:
//   - 같은 매물 이미 사진 있으면 외부 호출 안 함
//   - 실패는 graceful: 빈 배열 반환 + photos 컬럼 갱신 안 함 (다음 진입 시 재시도)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerSupabase } from '@/lib/auction/auctionService'
import { createCourtAuctionSession } from '@/lib/auction/courtAuctionFetch'
import { DETAIL_API_CANDIDATES, extractPhotoUrls } from '@/lib/auction/extractPhotoUrls'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30  // 외부 사이트 응답 대기

interface RouteCtx { params: Promise<{ itemId: string }> }

export async function GET(req: NextRequest, ctx: RouteCtx) {
  const auth = await createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { itemId } = await ctx.params
  const sb = getServerSupabase()

  // 1) DB 조회 — 캐시 hit 시 즉시 응답
  const { data: row, error } = await sb
    .from('auction_items')
    .select('id, photos, source_url, court_code')
    .eq('id', itemId)
    .single()
  if (error || !row) return NextResponse.json({ photos: [] }, { status: 404 })

  if (Array.isArray(row.photos) && row.photos.length > 0) {
    return NextResponse.json({ photos: row.photos, cached: true })
  }

  // photo URL 추출용 detail endpoint 가 아직 정확히 확정되지 않은 상태라
  // 잘못된 endpoint 추측 호출이 IP reputation 에 영향 줄 위험이 있다.
  // 환경변수로 명시적 opt-in 한 환경에서만 외부 호출 (기본 false).
  if (process.env.AUCTION_PHOTO_FETCH_ENABLED !== 'true') {
    return NextResponse.json({ photos: [], reason: 'fetch_disabled' })
  }

  // 2) source_url 파싱
  const u = parseSourceUrl(row.source_url)
  if (!u) return NextResponse.json({ photos: [] })

  // 3) courtauction 세션 발급 → 후보 endpoint 들 순차 호출
  let photos: string[] = []
  try {
    const session = await createCourtAuctionSession()
    for (const cand of DETAIL_API_CANDIDATES) {
      try {
        const { status, body } = await session.fetchApi(
          cand.path,
          { saNo: u.saNo, maemulSer: u.maemulSer, mokmulSer: u.mokmulSer, boCd: row.court_code },
          cand.submissionId,
        )
        if (status !== 200) continue
        const json = JSON.parse(body)
        const found = extractPhotoUrls(json)
        if (found.length > 0) {
          photos = found
          break
        }
      } catch {
        // 한 후보 실패해도 다음 시도
      }
    }
  } catch (e) {
    // 외부 호출 자체 실패(차단 등) — 캐싱 안 하고 빈 배열 응답
    return NextResponse.json({ photos: [], error: 'fetch_failed' })
  }

  // 4) 발견된 사진 캐싱
  if (photos.length > 0) {
    await sb.from('auction_items').update({ photos }).eq('id', itemId)
  }

  return NextResponse.json({ photos })
}

function parseSourceUrl(sourceUrl: string | null): { saNo: string; maemulSer: string; mokmulSer: string } | null {
  if (!sourceUrl) return null
  try {
    const url = new URL(sourceUrl)
    const saNo = url.searchParams.get('saNo')
    const maemulSer = url.searchParams.get('maemulSer')
    const mokmulSer = url.searchParams.get('mokmulSer')
    if (!saNo || !maemulSer || !mokmulSer) return null
    return { saNo, maemulSer, mokmulSer }
  } catch {
    return null
  }
}
