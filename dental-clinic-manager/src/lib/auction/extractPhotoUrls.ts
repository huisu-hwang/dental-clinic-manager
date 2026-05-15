// courtauction.go.kr 응답에서 매물 사진 URL 을 추출.
//
// IP 차단으로 정확한 endpoint/스키마 probe 가 안 된 상태라 흔히 쓰이는 키들을 시도.
// 실제 응답 보고 좁힐 수 있음 — IP 풀린 뒤 _probe_photo3.mjs 로 정밀 확인 후 좁혀쓰기.

const BASE = 'https://www.courtauction.go.kr'

// 후보 endpoint — courtauction SPA detail 진입 시 호출 가능한 패턴들.
// 첫 번째로 200/JSON 응답 + 이미지 키워드를 주는 것 사용.
export const DETAIL_API_CANDIDATES: Array<{ path: string; submissionId: string }> = [
  { path: '/pgj/pgj100/selectAuctnCsSrchRslt.on',     submissionId: 'mf_wfm_mainFrame_sbm_selectAuctnCsSrchRslt' },
  { path: '/pgj/pgj101/selectMulDtl.on',              submissionId: 'mf_wfm_mainFrame_sbm_selectMulDtl' },
  { path: '/pgj/pgj100/selectMulDtl.on',              submissionId: 'mf_wfm_mainFrame_sbm_selectMulDtl' },
  { path: '/pgj/pgj101/selectAtchmnflLst.on',         submissionId: 'mf_wfm_mainFrame_sbm_selectAtchmnflLst' },
  { path: '/pgj/pgj100/selectAuctnAtchmnflLst.on',    submissionId: 'mf_wfm_mainFrame_sbm_selectAuctnAtchmnflLst' },
]

/** JSON 응답에서 이미지 URL 들을 추출. 흔한 키 들을 재귀 순회. */
export function extractPhotoUrls(json: unknown): string[] {
  if (!json || typeof json !== 'object') return []
  const urls = new Set<string>()
  const photoKeyPattern = /(img|image|photo|atchmnfl|atch|file)/i
  const imageExt = /\.(jpg|jpeg|png|gif|webp)(\?|$)/i

  function walk(node: unknown, parentKey = '') {
    if (!node) return
    if (typeof node === 'string') {
      if (imageExt.test(node) && photoKeyPattern.test(parentKey)) {
        urls.add(absolutize(node))
      }
      return
    }
    if (Array.isArray(node)) {
      for (const v of node) walk(v, parentKey)
      return
    }
    if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        // 경로 + 파일명 조합 패턴: atchmnflPath + atchmnflNm 등
        if (typeof v === 'string' && /path|dir/i.test(k)) {
          const sibling = (node as Record<string, unknown>)
          const nameKey = Object.keys(sibling).find((key) => /(name|nm|file)/i.test(key) && typeof sibling[key] === 'string')
          if (nameKey) {
            const path = v as string
            const name = sibling[nameKey] as string
            if (imageExt.test(name)) {
              urls.add(absolutize(joinPath(path, name)))
            }
          }
        }
        walk(v, k)
      }
    }
  }
  walk(json)
  return Array.from(urls).slice(0, 20)  // 최대 20장
}

function absolutize(url: string): string {
  if (/^https?:\/\//i.test(url)) return url
  return `${BASE}${url.startsWith('/') ? '' : '/'}${url}`
}

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name.replace(/^\/+/, '')}`
}
