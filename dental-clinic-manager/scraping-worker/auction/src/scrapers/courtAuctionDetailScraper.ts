import { chromium, Page } from 'playwright'
import { log } from '../lib/logger.js'
import type { ScrapedDetail, ScrapedListItem } from '../lib/types.js'

const THROTTLE_MS = Number(process.env.SCRAPE_THROTTLE_MS ?? 500)

export async function scrapeDetails(items: ScrapedListItem[]): Promise<ScrapedDetail[]> {
  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' })
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; AuctionAggregator/1.0; +contact)',
    locale: 'ko-KR',
  })
  const out: ScrapedDetail[] = []
  try {
    for (const item of items) {
      try {
        const page = await ctx.newPage()
        await page.goto(item.sourceUrl, { waitUntil: 'networkidle' })
        const detail = await extractDetail(page, item)
        out.push(detail)
        await page.close()
      } catch (e) {
        log.warn('detail_failed', { caseNumber: item.caseNumber, error: String(e) })
      }
      await sleep(THROTTLE_MS)
    }
  } finally {
    await browser.close()
  }
  log.info('detail_scrape_total', { count: out.length })
  return out
}

async function extractDetail(page: Page, listItem: ScrapedListItem): Promise<ScrapedDetail> {
  const detail = await page.evaluate(() => {
    const text = document.body.innerText ?? ''
    const grab = (re: RegExp) => (text.match(re) ?? ['', null])[1]
    const num = (s: string | null) => s ? Number(s.replace(/[^0-9.\-]/g, '')) : null

    const photos = Array.from(document.querySelectorAll<HTMLImageElement>('img[src*=photo], img[src*=picture]'))
      .map(img => img.src)
      .filter(s => !!s)

    const noticePdf = (document.querySelector<HTMLAnchorElement>('a[href*=명세서], a[href*=noticeFile]') as HTMLAnchorElement | null)?.href ?? null
    const apprPdf   = (document.querySelector<HTMLAnchorElement>('a[href*=감정], a[href*=appraisalFile]') as HTMLAnchorElement | null)?.href ?? null

    return {
      addressRoad:     grab(/도로명\s*주소[:\s]*([^\n]+)/),
      addressJibun:    grab(/지번\s*주소[:\s]*([^\n]+)/),
      pnu:             grab(/(\d{19})/),
      landAreaM2:      num(grab(/대지면적[:\s]*([\d,.]+)/)),
      buildingAreaM2:  num(grab(/건물면적[:\s]*([\d,.]+)/)),
      floor:           num(grab(/(\d+)\s*층/)),
      totalFloors:     num(grab(/지상\s*(\d+)층/)),
      buildingYear:    num(grab(/(\d{4})\s*년\s*준공/)),
      bidDeposit:      num(grab(/입찰보증금[:\s]*([\d,]+)/)),
      noticePdfUrl:    noticePdf,
      appraisalPdfUrl: apprPdf,
      photos,
    }
  })

  return {
    ...listItem,
    addressRoad: detail.addressRoad,
    addressJibun: detail.addressJibun,
    pnu: detail.pnu,
    landAreaM2: detail.landAreaM2,
    buildingAreaM2: detail.buildingAreaM2,
    floor: detail.floor,
    totalFloors: detail.totalFloors,
    buildingYear: detail.buildingYear,
    bidDeposit: detail.bidDeposit,
    noticePdfUrl: detail.noticePdfUrl,
    appraisalPdfUrl: detail.appraisalPdfUrl,
    photos: detail.photos,
    status: 'active',
    soldPrice: null,
    soldAt: null,
  }
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }
