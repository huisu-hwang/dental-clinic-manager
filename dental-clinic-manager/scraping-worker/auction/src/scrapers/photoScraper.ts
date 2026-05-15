// 매물 사진 수집 — courtauction.go.kr 상세 페이지에서 호출되는 photo API.
//
// 실제 API endpoint 와 응답 스키마는 IP 차단 해제 후 probe 로 확정한 뒤
// 이 파일의 PHOTO_ENDPOINT / parsePhotoUrls 를 채운다.
// 그 전까지는 빈 배열 반환하여 safe-no-op.

import type { Page } from 'playwright'

interface PhotoFetchParams {
  saNo: string         // 사건접수번호 (예: 20240130117822)
  maemulSer: string    // 매물 시리얼
  mokmulSer: string    // 목적물 시리얼
  boCd: string         // 법원코드
}

// TODO: probe 로 발견한 endpoint 와 submissionid 로 채울 것
// 예시 후보:
//   - /pgj/pgj100/selectMulDtlImg.on
//   - /pgj/pgj101/selectImgFileLst.on
const PHOTO_ENDPOINT = ''  // 빈 값이면 fetch skip
const SUBMISSION_ID_PHOTO = ''

export async function fetchPhotoUrls(page: Page, p: PhotoFetchParams): Promise<string[]> {
  if (!PHOTO_ENDPOINT) return []  // 아직 endpoint 미확정 — no-op

  try {
    const result = await page.evaluate(
      async ({ ep, body, sid }) => {
        const res = await fetch(ep, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json;charset=UTF-8',
            'Accept': 'application/json',
            'submissionid': sid,
            'sc-userid': 'SYSTEM',
          },
          body: JSON.stringify(body),
          credentials: 'include',
        })
        const text = await res.text()
        return { status: res.status, body: text }
      },
      {
        ep: PHOTO_ENDPOINT,
        sid: SUBMISSION_ID_PHOTO,
        body: { saNo: p.saNo, maemulSer: p.maemulSer, mokmulSer: p.mokmulSer, boCd: p.boCd },
      },
    )
    if (result.status !== 200) return []
    return parsePhotoUrls(JSON.parse(result.body))
  } catch {
    return []
  }
}

// 응답 파싱 — probe 결과 보고 채울 것. 흔한 패턴:
//   data.dlt_imgLst[].atchmnflPath, .atchmnflNm
//   data.imgLst[].imgUrl
function parsePhotoUrls(json: any): string[] {
  const candidates: any[] =
    json?.data?.dlt_imgLst ??
    json?.data?.imgLst ??
    json?.data?.dlt_atchmnflLst ??
    []
  const urls: string[] = []
  const BASE = 'https://www.courtauction.go.kr'
  for (const c of candidates) {
    // 흔한 키 순회
    const path = c?.atchmnflPath ?? c?.imgUrl ?? c?.imgPath ?? c?.filePath
    const name = c?.atchmnflNm ?? c?.imgNm ?? c?.fileName
    if (path && name) {
      urls.push(`${BASE}${path}/${name}`.replace(/\/+/g, '/').replace(':/', '://'))
    } else if (typeof path === 'string' && /\.(jpg|jpeg|png)$/i.test(path)) {
      urls.push(path.startsWith('http') ? path : `${BASE}${path}`)
    }
  }
  return urls
}
