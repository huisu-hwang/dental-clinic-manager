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

const ENDPOINTS = {
  apt:       'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTradeDev',
  officetel: 'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcOffiTrade',
  villa:     'http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcRHTrade',
}

export type MolitKind = keyof typeof ENDPOINTS

export async function fetchTrades(kind: MolitKind, lawdCd: string, dealYearMonth: string): Promise<MolitTrade[]> {
  const url = `${ENDPOINTS[kind]}?serviceKey=${encodeURIComponent(KEY ?? '')}&LAWD_CD=${lawdCd}&DEAL_YMD=${dealYearMonth}&numOfRows=1000`
  const res = await fetch(url)
  if (!res.ok) {
    log.warn('molit_api_failed', { kind, lawdCd, dealYearMonth, status: res.status })
    return []
  }
  const xml = await res.text()
  return parseXmlTrades(xml)
}

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
    const dealAmountStr = (get('거래금액') ?? get('dealAmount') ?? '').replace(/,/g, '')
    const yyyy = Number(get('년') ?? get('dealYear'))
    const mm   = Number(get('월') ?? get('dealMonth'))
    const dd   = Number(get('일') ?? get('dealDay'))
    const area = Number(get('전용면적') ?? get('excluUseAr'))
    if (!yyyy || !mm || !area) continue
    items.push({
      dealAmount: Number(dealAmountStr),
      dealYear: yyyy,
      dealMonth: mm,
      dealDay: dd,
      apartmentName: get('아파트') ?? get('연립다세대') ?? get('오피스텔'),
      area,
      jibun: get('지번'),
      floor: Number(get('층') ?? '0') || null,
    })
  }
  return items
}
