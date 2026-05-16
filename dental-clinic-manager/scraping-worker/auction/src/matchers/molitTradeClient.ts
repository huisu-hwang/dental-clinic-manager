import 'dotenv/config'
import { log } from '../lib/logger.js'

const KEY = process.env.DATA_GO_KR_API_KEY
if (!KEY) log.warn('DATA_GO_KR_API_KEY missing')

export interface MolitTrade {
  dealAmount: number       // 만원 단위 (API 응답)
  dealYear: number
  dealMonth: number
  dealDay: number
  apartmentName: string | null
  area: number             // ㎡
  jibun: string | null
  floor: number | null
}

// 2024년 9월 데이터포털 API 이전 — 옛 openapi.molit.go.kr 호스트는 DNS SERVFAIL.
// 신 endpoint(apis.data.go.kr) 는 WAF가 비표준 UA 를 차단하므로 User-Agent 헤더가 필수.
const ENDPOINTS = {
  apt:       'https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev',
  officetel: 'https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade',
  villa:     'https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade',
}

export type MolitKind = keyof typeof ENDPOINTS

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export async function fetchTrades(kind: MolitKind, lawdCd: string, dealYearMonth: string): Promise<MolitTrade[]> {
  const url = `${ENDPOINTS[kind]}?serviceKey=${encodeURIComponent(KEY ?? '')}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYearMonth}&numOfRows=1000`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) {
    log.warn('molit_api_failed', { kind, lawdCd, dealYearMonth, status: res.status })
    return []
  }
  const xml = await res.text()
  return parseXmlTrades(xml)
}

// 신 응답 포맷: <aptNm>(apt) / <offiNm>(officetel) / <mhouseNm>(연립다세대),
// <dealAmount>, <excluUseAr>, <dealYear>/<dealMonth>/<dealDay>, <jibun>, <floor>.
// 옛 한글 태그(<아파트>, <거래금액>, <전용면적>) 도 함께 시도하여 구포맷 호환 유지.
function parseXmlTrades(xml: string): MolitTrade[] {
  const items: MolitTrade[] = []
  const itemBlocks = xml.split('<item>').slice(1)
  for (const block of itemBlocks) {
    const end = block.indexOf('</item>')
    if (end < 0) continue
    const body = block.slice(0, end)
    const get = (tag: string) => {
      const m = body.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))
      return m ? m[1].trim() : null
    }
    const dealAmountStr = (get('dealAmount') ?? get('거래금액') ?? '').replace(/,/g, '')
    const yyyy = Number(get('dealYear') ?? get('년'))
    const mm   = Number(get('dealMonth') ?? get('월'))
    const dd   = Number(get('dealDay') ?? get('일'))
    const area = Number(get('excluUseAr') ?? get('전용면적'))
    if (!yyyy || !mm || !area) continue
    items.push({
      dealAmount: Number(dealAmountStr),
      dealYear: yyyy,
      dealMonth: mm,
      dealDay: dd,
      apartmentName: get('aptNm') ?? get('offiNm') ?? get('mhouseNm') ?? get('아파트') ?? get('연립다세대') ?? get('오피스텔'),
      area,
      jibun: get('jibun') ?? get('지번'),
      floor: Number(get('floor') ?? get('층') ?? '0') || null,
    })
  }
  return items
}
