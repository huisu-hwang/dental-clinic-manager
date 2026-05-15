// 상세 스크래퍼.
//
// 사이트 SPA 개편 이후 목록 검색 API(searchControllerMain.on)가 면적/주소/좌표 등
// 핵심 상세 필드를 함께 반환하기 때문에 별도 상세 페이지 호출이 불필요해졌다.
// 이 모듈은 list item 을 ScrapedDetail 로 pass-through 변환하며 누락 필드는 null 로 채운다.
//
// PDF(매각물건명세서/감정평가서)는 사이트 개편으로 접근 방식이 바뀌어 별도 후속 작업.
// 현재는 noticePdfUrl/appraisalPdfUrl 을 null 로 두어 PDF 파싱이 자동으로 스킵된다.

import { log } from '../lib/logger.js'
import type { ScrapedDetail, ScrapedListItem } from '../lib/types.js'

export async function scrapeDetails(items: ScrapedListItem[]): Promise<ScrapedDetail[]> {
  const out: ScrapedDetail[] = items.map((it) => ({
    ...it,
    addressRoad: null,
    addressJibun: it.addressJibun ?? null,
    pnu: null,
    landAreaM2: it.landAreaM2 ?? null,
    buildingAreaM2: it.buildingAreaM2 ?? null,
    floor: null,
    totalFloors: null,
    buildingYear: null,
    bidDeposit: null,
    noticePdfUrl: null,
    appraisalPdfUrl: null,
    photos: [],
    status: 'active',
    soldPrice: null,
    soldAt: null,
  }))
  log.info('detail_pass_through', { count: out.length })
  return out
}
