import { chromium, Browser, Page } from 'playwright'
import { log } from '../lib/logger.js'
import type { ScrapedListItem, PropertyType } from '../lib/types.js'

const BASE_URL = 'https://www.courtauction.go.kr'
const LIST_PATH = '/RetrieveRealEstMulDetailList.laf'
const THROTTLE_MS = Number(process.env.SCRAPE_THROTTLE_MS ?? 500)
const MAX_PAGES = Number(process.env.SCRAPE_MAX_LIST_PAGES ?? 20)

const PROPERTY_CODE_MAP: Record<PropertyType, string> = {
  apt:        '00031',
  officetel:  '00032',
  villa:      '00033',
  house:      '00034',
  commercial: '00041',
  land:       '00050',
  factory:    '00060',
  forest:     '00080',
  other:      '00090',
}

const SIDO_LIST = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시',
  '대전광역시', '울산광역시', '세종특별자치시', '경기도', '강원특별자치도',
  '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도',
]

export async function scrapeAllLists(): Promise<ScrapedListItem[]> {
  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' })
  const all: ScrapedListItem[] = []
  try {
    for (const sido of SIDO_LIST) {
      for (const propType of Object.keys(PROPERTY_CODE_MAP) as PropertyType[]) {
        try {
          const items = await scrapeOneCategory(browser, sido, propType)
          all.push(...items)
          log.info('list_category_done', { sido, propType, count: items.length })
        } catch (e) {
          log.error('list_category_failed', { sido, propType, error: String(e) })
        }
        await sleep(THROTTLE_MS)
      }
    }
  } finally {
    await browser.close()
  }
  log.info('list_scrape_total', { count: all.length })
  return all
}

async function scrapeOneCategory(browser: Browser, sido: string, propType: PropertyType): Promise<ScrapedListItem[]> {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; AuctionAggregator/1.0; +contact)',
    locale: 'ko-KR',
  })
  const page = await ctx.newPage()
  const results: ScrapedListItem[] = []
  try {
    await page.goto(`${BASE_URL}${LIST_PATH}`, { waitUntil: 'networkidle' })
    await selectSido(page, sido)
    await selectPropertyType(page, PROPERTY_CODE_MAP[propType])
    await page.click('button.btn-search, input[type=submit][value=검색]')
    await page.waitForLoadState('networkidle')

    for (let pageNo = 1; pageNo <= MAX_PAGES; pageNo++) {
      const rows = await extractRowsFromCurrentPage(page, sido, propType)
      if (rows.length === 0) break
      results.push(...rows)

      const hasNext = await goToNextPage(page, pageNo + 1)
      if (!hasNext) break
      await sleep(THROTTLE_MS)
    }
  } finally {
    await ctx.close()
  }
  return results
}

async function selectSido(page: Page, sido: string) {
  await page.selectOption('select[name=sido], #idSido', { label: sido }).catch(async () => {
    await page.click('#sidoBtn, .sido-btn')
    await page.click(`text="${sido}"`)
  })
}

async function selectPropertyType(page: Page, code: string) {
  await page.selectOption('select[name=mulCateLcd], #idJpKindLcd', { value: code }).catch(() => {
    /* fallback */
  })
}

async function extractRowsFromCurrentPage(page: Page, sido: string, propType: PropertyType): Promise<ScrapedListItem[]> {
  return await page.$$eval('table.Ltbl_list tbody tr, table.tbl_list tbody tr', (rows, ctx) => {
    const out: ScrapedListItem[] = []
    for (const tr of rows) {
      const tds = tr.querySelectorAll('td')
      if (tds.length < 5) continue
      const link = tr.querySelector('a[href*=Detail]')
      if (!link) continue
      const href = (link as HTMLAnchorElement).getAttribute('href') ?? ''
      const text = tr.textContent ?? ''
      const caseNumber = (text.match(/\d{4}타경\d+/) ?? [''])[0]
      const itemNumberMatch = text.match(/물건\s*(\d+)/)
      const itemNumber = itemNumberMatch ? Number(itemNumberMatch[1]) : 1
      const appraisal = Number((text.match(/감정가[^\d]*([\d,]+)/) ?? ['', '0'])[1].replace(/,/g, ''))
      const minBid = Number((text.match(/최저가[^\d]*([\d,]+)/) ?? ['', '0'])[1].replace(/,/g, ''))
      const failure = Number((text.match(/유찰\s*(\d+)/) ?? ['', '0'])[1])
      const date = (text.match(/\d{4}[.\-/]\d{2}[.\-/]\d{2}/) ?? [''])[0].replace(/[./]/g, '-')
      out.push({
        caseNumber,
        itemNumber,
        courtName: (text.match(/[가-힣]+법원/) ?? [''])[0],
        courtCode: '',
        propertyType: ctx.propType,
        sido: ctx.sido,
        sigungu: null,
        eupmyeondong: null,
        appraisalPrice: appraisal,
        minBidPrice: minBid,
        failureCount: failure,
        nextAuctionDate: date || null,
        sourceUrl: `${ctx.base}${href.startsWith('/') ? '' : '/'}${href}`,
      })
    }
    return out
  }, { sido, propType, base: BASE_URL } as { sido: string; propType: PropertyType; base: string })
}

async function goToNextPage(page: Page, nextNo: number): Promise<boolean> {
  const link = await page.$(`a[onclick*="goPage(${nextNo})"], a[href*="page=${nextNo}"]`)
  if (!link) return false
  await link.click()
  await page.waitForLoadState('networkidle')
  return true
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}
