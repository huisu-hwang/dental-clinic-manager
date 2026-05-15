// courtauction.go.kr 부동산 물건 검색 API 클라이언트
//
// 사이트가 SPA(W2/XPLATFORM)로 개편되면서 HTML 파싱은 불가. 또한 fetch 직접 호출은
// 봇 방어로 400 응답을 받기 때문에, Playwright 브라우저 컨텍스트 안에서 fetch 를
// 실행한다. 검색 페이지를 한 번 띄우고 그 안에서 fetch 를 반복 호출하면 세션이
// 유지되어 빠르고 안정적이다.
//
// 핵심 엔드포인트:
//   POST /pgj/pgjsearch/searchControllerMain.on       — 검색
//   POST /pgj/pgj002/selectCortOfcLst.on              — 법원 목록

import { chromium, Page } from 'playwright'
import { log } from '../lib/logger.js'
import type { ScrapedListItem, PropertyType } from '../lib/types.js'

const BASE = 'https://www.courtauction.go.kr'
const SEARCH_PAGE = `${BASE}/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ151F00.xml`
const SEARCH_API = '/pgj/pgjsearch/searchControllerMain.on'
const COURT_LIST_API = '/pgj/pgj002/selectCortOfcLst.on'

const THROTTLE_MS = Number(process.env.SCRAPE_THROTTLE_MS ?? 500)
const PAGE_SIZE = 10  // 서버가 더 큰 값은 거부함 (보안/성능 제한)
const MAX_PAGES = Number(process.env.SCRAPE_MAX_LIST_PAGES ?? 200)

interface CortOfc {
  code: string  // e.g. 'B000210'
  name: string  // e.g. '서울중앙지방법원'
}

interface ApiItem {
  srnSaNo: string
  saNo: string
  boCd: string
  jiwonNm: string
  maemulSer: string
  mokmulSer: string
  mulStatcd: string
  mulJinYn: string
  gamevalAmt: string
  minmaePrice: string
  yuchalCnt: string
  maeGiil: string
  hjguSido: string
  hjguSigu: string
  hjguDong: string
  daepyoLotno: string
  buldNm: string
  areaList: string
  jimokList: string
  dspslUsgNm: string
  lclsUtilCd: string
  mclsUtilCd: string
  sclsUtilCd: string
  xCordi: string
  yCordi: string
}

function classifyPropertyType(usg: string | null | undefined, jimok: string | null | undefined): PropertyType {
  const text = `${usg ?? ''} ${jimok ?? ''}`
  if (/아파트/.test(text)) return 'apt'
  if (/오피스텔/.test(text)) return 'officetel'
  if (/다세대|연립/.test(text)) return 'villa'
  if (/단독|다가구|주택/.test(text)) return 'house'
  if (/상가|근린|점포|업무|사무|숙박/.test(text)) return 'commercial'
  if (/공장|창고/.test(text)) return 'factory'
  if (/임야/.test(text)) return 'forest'
  if (/대지|전$|답$|과수원|목장|토지/.test(text)) return 'land'
  return 'other'
}

function ymd(s: string | null | undefined): string | null {
  if (!s || !/^\d{8}$/.test(s)) return null
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

function num(s: string | null | undefined): number {
  if (!s) return 0
  const n = Number(String(s).replace(/[^0-9.-]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function parseAreaM2(s: string | null | undefined): number | null {
  if (!s) return null
  const m = s.match(/([\d,.]+)\s*㎡/)
  if (!m) return null
  const v = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(v) && v > 0 ? v : null
}

function joinAddress(it: ApiItem): string | null {
  const parts = [it.hjguSido, it.hjguSigu, it.hjguDong, it.daepyoLotno, it.buldNm]
    .map((x) => (x ?? '').trim()).filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : null
}

function toScrapedListItem(it: ApiItem): ScrapedListItem | null {
  if (!it.srnSaNo || !/\d{4}타경\d+/.test(it.srnSaNo)) return null
  const appraisal = num(it.gamevalAmt)
  const minBid = num(it.minmaePrice)
  if (appraisal <= 0 || minBid <= 0) return null

  const propType = classifyPropertyType(it.dspslUsgNm, it.jimokList)
  const area = parseAreaM2(it.areaList)
  const isLandType = propType === 'land' || propType === 'forest'

  return {
    caseNumber: it.srnSaNo.trim(),
    itemNumber: Math.max(1, num(it.mokmulSer) || 1),
    courtName: it.jiwonNm?.trim() || '',
    courtCode: it.boCd || '',
    propertyType: propType,
    sido: it.hjguSido?.trim() || null,
    sigungu: it.hjguSigu?.trim() || null,
    eupmyeondong: it.hjguDong?.trim() || null,
    appraisalPrice: appraisal,
    minBidPrice: minBid,
    failureCount: num(it.yuchalCnt),
    nextAuctionDate: ymd(it.maeGiil),
    sourceUrl: `${BASE}/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ153F00.xml&saNo=${it.saNo}&maemulSer=${it.maemulSer}&mokmulSer=${it.mokmulSer}`,
    addressJibun: joinAddress(it),
    buildingAreaM2: isLandType ? null : area,
    landAreaM2: isLandType ? area : null,
    xCordi: it.xCordi || null,
    yCordi: it.yCordi || null,
    dspslUsgNm: it.dspslUsgNm?.trim() || null,
  }
}

function defaultBidRange(): { bgn: string; end: string } {
  const today = new Date()
  const end = new Date(today)
  end.setDate(today.getDate() + 60)
  const fmt = (d: Date) => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return { bgn: fmt(today), end: fmt(end) }
}

function buildSearchPayload(opts: { cortOfcCd: string; bidBgngYmd: string; bidEndYmd: string; pageNo: number; pageSize: number }) {
  return {
    dma_pageInfo: {
      pageNo: opts.pageNo, pageSize: opts.pageSize,
      bfPageNo: '', startRowNo: '', totalCnt: '', totalYn: 'Y', groupTotalCount: '',
    },
    dma_srchGdsDtlSrchInfo: {
      rletDspslSpcCondCd: '', bidDvsCd: '000331', mvprpRletDvsCd: '00031R', cortAuctnSrchCondCd: '0004601',
      rprsAdongSdCd: '', rprsAdongSggCd: '', rprsAdongEmdCd: '',
      rdnmSdCd: '', rdnmSggCd: '', rdnmNo: '',
      mvprpDspslPlcAdongSdCd: '', mvprpDspslPlcAdongSggCd: '', mvprpDspslPlcAdongEmdCd: '',
      rdDspslPlcAdongSdCd: '', rdDspslPlcAdongSggCd: '', rdDspslPlcAdongEmdCd: '',
      cortOfcCd: opts.cortOfcCd, jdbnCd: '', execrOfcDvsCd: '',
      lclDspslGdsLstUsgCd: '', mclDspslGdsLstUsgCd: '', sclDspslGdsLstUsgCd: '',
      cortAuctnMbrsId: '', aeeEvlAmtMin: '', aeeEvlAmtMax: '',
      lwsDspslPrcRateMin: '', lwsDspslPrcRateMax: '',
      flbdNcntMin: '', flbdNcntMax: '', objctArDtsMin: '', objctArDtsMax: '',
      mvprpArtclKndCd: '', mvprpArtclNm: '', mvprpAtchmPlcTypCd: '',
      notifyLoc: 'off', lafjOrderBy: '',
      pgmId: 'PGJ151F01', csNo: '', cortStDvs: '1', statNum: 1,
      bidBgngYmd: opts.bidBgngYmd, bidEndYmd: opts.bidEndYmd,
      dspslDxdyYmd: '', fstDspslHm: '', scndDspslHm: '', thrdDspslHm: '', fothDspslHm: '',
      dspslPlcNm: '', lwsDspslPrcMin: '', lwsDspslPrcMax: '',
      grbxTypCd: '', gdsVendNm: '', fuelKndCd: '', carMdyrMax: '', carMdyrMin: '', carMdlNm: '', sideDvsCd: '',
    },
  }
}

// Page 컨텍스트 안에서 fetch 실행 — 봇 방어 우회.
// 필수 헤더: submissionid (W2 SubmissionID), sc-userid — 둘 다 빠지면 400.
async function callApi<T>(page: Page, path: string, body: unknown, submissionId: string): Promise<T> {
  const result = await page.evaluate(
    async ({ path, body, submissionId }) => {
      const res = await fetch(path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Accept': 'application/json',
          'submissionid': submissionId,
          'sc-userid': 'SYSTEM',
        },
        body: JSON.stringify(body),
        credentials: 'include',
      })
      const text = await res.text()
      return { status: res.status, body: text }
    },
    { path, body, submissionId },
  )
  if (result.status !== 200) throw new Error(`POST ${path} -> ${result.status}: ${result.body.slice(0, 200)}`)
  return JSON.parse(result.body) as T
}

const SUBMISSION_ID_SEARCH = 'mf_wfm_mainFrame_sbm_selectGdsDtlSrch'
const SUBMISSION_ID_COURT_LIST = 'mf_wfm_mainFrame_sbm_selectCortOfcLst'

interface SearchResp {
  status?: number
  data?: {
    dma_pageInfo?: { totalCnt?: string; groupTotalCount?: number }
    dlt_srchResult?: ApiItem[]
    srchResult?: ApiItem[]
  }
}

function extractItems(j: SearchResp): ApiItem[] {
  return j?.data?.dlt_srchResult ?? j?.data?.srchResult ?? []
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)) }

export async function scrapeAllLists(): Promise<ScrapedListItem[]> {
  const range = defaultBidRange()
  log.info('list_scrape_begin', { bidBgngYmd: range.bgn, bidEndYmd: range.end })

  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  })
  const page = await ctx.newPage()
  const all: ScrapedListItem[] = []

  try {
    // 한 번만 검색 페이지를 띄우고 모든 API 호출은 이 페이지 컨텍스트에서 실행
    await page.goto(SEARCH_PAGE, { waitUntil: 'networkidle', timeout: 60_000 })

    // 법원 목록
    const cortResp: any = await callApi(page, COURT_LIST_API, { cortExecrOfcDvsCd: '00079B' }, SUBMISSION_ID_COURT_LIST)
    const courts: CortOfc[] = cortResp?.data?.cortOfcLst ?? cortResp?.data?.dlt_cortOfcLst ?? []
    log.info('court_list_fetched', { count: courts.length })

    for (const c of courts) {
      let pageNo = 1
      const beforeCount = all.length
      while (pageNo <= MAX_PAGES) {
        let resp: SearchResp
        try {
          resp = await callApi<SearchResp>(page, SEARCH_API, buildSearchPayload({
            cortOfcCd: c.code,
            bidBgngYmd: range.bgn,
            bidEndYmd: range.end,
            pageNo,
            pageSize: PAGE_SIZE,
          }), SUBMISSION_ID_SEARCH)
        } catch (e) {
          log.warn('court_page_failed', { court: c.name, pageNo, error: String(e) })
          break
        }

        const items = extractItems(resp)
        if (items.length === 0) break

        for (const it of items) {
          const m = toScrapedListItem(it)
          if (m) all.push(m)
        }

        const total = Number(resp?.data?.dma_pageInfo?.totalCnt ?? 0)
        if (items.length < PAGE_SIZE || (total > 0 && all.length - beforeCount >= total)) break

        pageNo++
        await sleep(THROTTLE_MS)
      }
      log.info('court_scraped', { court: c.name, count: all.length - beforeCount })
      await sleep(THROTTLE_MS)
    }
  } finally {
    await browser.close()
  }

  log.info('list_scrape_done', { totalItems: all.length })
  return all
}
