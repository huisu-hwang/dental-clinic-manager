import 'dotenv/config'
// undici fetch 의 일시적 실패가 supabase-js 내부 마이크로태스크에서 unhandled rejection 으로
// 빠져나오는 케이스가 있어 메인 catch 까지 도달하지 못하고 process 가 죽는다. 전역 핸들러로 흡수.
process.on('unhandledRejection', (reason) => {
  // 라이브러리 내부 일시 rejection — 무시하고 진행
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', msg: 'unhandled_rejection', reason: String(reason) }))
})
process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), level: 'warn', msg: 'uncaught_exception', error: String(err) }))
})
import { scrapeAllLists } from '../scrapers/courtAuctionListScraper.js'
import { scrapeDetails } from '../scrapers/courtAuctionDetailScraper.js'
import { downloadPdf } from '../scrapers/pdfDownloader.js'
import { extractRightsFromPdf } from '../parsers/rightsExtractor.js'
import { fetchTrades, type MolitKind } from '../matchers/molitTradeClient.js'
import { matchMarketPrice } from '../matchers/marketPriceMatcher.js'
import { resolveLawdCdFromMap } from '../matchers/lawdCdMap.js'
import { createSupabaseClient } from '../lib/supabase.js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { log } from '../lib/logger.js'
import { runDdayAlerts } from './ddayAlerts.js'
import { runFilterMatchAlerts } from './filterMatchAlerts.js'

const KIND_MAP: Record<string, MolitKind | null> = {
  apt: 'apt', officetel: 'officetel', villa: 'villa',
  house: null, commercial: null, land: null, factory: null, forest: null, other: null,
}

// Supabase 호출이 일시적 네트워크 오류(fetch failed, 502 등)로 throw 하는 경우에 대비해
// 지수 backoff 재시도. 메인 루프가 1건 실패로 죽지 않도록 보호.
async function retry<T>(fn: () => Promise<T> | PromiseLike<T>, label: string, attempts = 4): Promise<T | { __failed: true; error: string }> {
  let lastErr: unknown = null
  for (let i = 0; i < attempts; i++) {
    try {
      // Promise.resolve 로 한번 더 wrap 하여 PostgrestBuilder thenable 의
      // 마이크로태스크 분기가 unhandled rejection 으로 빠지는 경로를 막는다.
      return await Promise.resolve(fn())
    } catch (e) {
      lastErr = e
      const wait = 500 * Math.pow(2, i)  // 500, 1000, 2000, 4000 ms
      log.warn('supabase_retry', { label, attempt: i + 1, wait, error: String(e) })
      await new Promise((r) => setTimeout(r, wait))
    }
  }
  return { __failed: true, error: String(lastErr) }
}

async function main() {
  const startedAt = new Date()
  log.info('daily_scrape_start', { startedAt: startedAt.toISOString() })

  let supabase: SupabaseClient = createSupabaseClient()

  const listItems = await scrapeAllLists()
  if (listItems.length === 0) {
    log.error('daily_scrape_zero_items')
    await notifyOps('경매 데이터 0건 — 사이트 차단/구조변경 의심')
    process.exit(1)
  }

  const detailsRaw = await scrapeDetails(listItems)
  // 동일 (court_code, case_number, item_number) 가 같은 배치에 두 번 등장하면
  // Postgres 의 ON CONFLICT 가 두 번째 행을 거부한다. 같은 키는 마지막 값 한 번만 처리.
  const dedupeMap = new Map<string, typeof detailsRaw[number]>()
  for (const d of detailsRaw) {
    const key = `${d.courtCode || '00'}|${d.caseNumber}|${d.itemNumber}`
    dedupeMap.set(key, d)
  }
  const details = Array.from(dedupeMap.values())
  log.info('dedupe_done', { before: detailsRaw.length, after: details.length })

  // 8 분간 idle 한 HTTP keep-alive 가 죽어 첫 upsert 가 fetch failed 로 throw 되는 문제 해결:
  // list/dedupe 직후에 클라이언트를 새로 생성하여 fresh connection pool 로 적재 시작.
  supabase = createSupabaseClient()
  log.info('supabase_client_refreshed')

  let okCount = 0
  let failCount = 0
  for (const d of details) {
    const discount = (d.appraisalPrice - d.minBidPrice) / d.appraisalPrice * 100
    const upsertResult = await retry(async () => {
      return await supabase
        .from('auction_items')
        .upsert({
          case_number: d.caseNumber,
          item_number: d.itemNumber,
          court_name: d.courtName,
          court_code: d.courtCode || '00',
          property_type: d.propertyType,
          address_road: d.addressRoad,
          address_jibun: d.addressJibun,
          sido: d.sido,
          sigungu: d.sigungu,
          eupmyeondong: d.eupmyeondong,
          pnu: d.pnu,
          land_area_m2: d.landAreaM2,
          building_area_m2: d.buildingAreaM2,
          floor: d.floor,
          total_floors: d.totalFloors,
          building_year: d.buildingYear,
          appraisal_price: d.appraisalPrice,
          min_bid_price: d.minBidPrice,
          bid_deposit: d.bidDeposit,
          failure_count: d.failureCount,
          discount_rate: Math.round(discount * 100) / 100,
          next_auction_date: d.nextAuctionDate,
          status: d.status,
          sold_price: d.soldPrice,
          sold_at: d.soldAt,
          source_url: d.sourceUrl,
          notice_pdf_url: d.noticePdfUrl,
          appraisal_pdf_url: d.appraisalPdfUrl,
          photos: d.photos,
          last_synced_at: new Date().toISOString(),
        }, { onConflict: 'court_code,case_number,item_number' })
        .select('id')
        .single()
    }, `upsert_auction_items:${d.caseNumber}-${d.itemNumber}`)

    if ('__failed' in upsertResult) {
      failCount++
      log.warn('upsert_failed', {
        caseNumber: d.caseNumber, itemNumber: d.itemNumber, error: upsertResult.error,
      })
      continue
    }
    const { data: itemRow, error } = upsertResult
    if (error || !itemRow) {
      failCount++
      log.warn('upsert_failed', {
        caseNumber: d.caseNumber,
        itemNumber: d.itemNumber,
        message: error?.message ?? 'no_row_returned',
        code: (error as any)?.code,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
      })
      continue
    }
    okCount++
    if (okCount % 1000 === 0) log.info('upsert_progress', { okCount, failCount, totalSeen: okCount + failCount })
    const itemId = itemRow.id

    if (d.noticePdfUrl) {
      const pdfPath = await downloadPdf(d.noticePdfUrl, `${d.courtCode || '00'}-${d.caseNumber}-${d.itemNumber}-notice`)
      if (pdfPath) {
        const rights = await extractRightsFromPdf(pdfPath)
        await supabase.from('auction_rights_analysis').upsert({
          item_id: itemId,
          base_right_type: rights.baseRightType,
          base_right_date: rights.baseRightDate,
          has_senior_tenant: rights.hasSeniorTenant,
          tenant_count: rights.tenantCount,
          total_deposit: rights.totalDeposit,
          unsettled_taxes: rights.unsettledTaxes,
          risk_flags: rights.riskFlags,
          parser_version: rights.parserVersion,
          parse_status: rights.parseStatus,
          raw_text: rights.rawText,
          parsed_at: new Date().toISOString(),
        }, { onConflict: 'item_id' })
      }
    }

    const kind = KIND_MAP[d.propertyType]
    if (kind && d.sigungu && d.buildingAreaM2) {
      const lawdCd = await resolveLawdCd(d.sido, d.sigungu)
      if (lawdCd) {
        const ym1 = ymOffset(0)
        const ym2 = ymOffset(-1)
        const ym3 = ymOffset(-2)
        const trades = [
          ...await fetchTrades(kind, lawdCd, ym1),
          ...await fetchTrades(kind, lawdCd, ym2),
          ...await fetchTrades(kind, lawdCd, ym3),
        ]
        const result = matchMarketPrice(
          { complexName: d.addressJibun?.split(' ').slice(-1)[0] ?? null, areaM2: d.buildingAreaM2 },
          trades,
          new Date().toISOString().slice(0, 10)
        )
        await supabase.from('auction_market_prices').upsert({
          item_id: itemId,
          source: `molit_${kind}_trade`,
          matched_complex: result.matched_complex,
          median_price_3m: result.median_price_3m,
          trade_count_3m: result.trade_count_3m,
          median_price_12m: result.median_price_12m,
          last_trade_date: result.last_trade_date,
          match_confidence: result.match_confidence,
          fetched_at: new Date().toISOString(),
        }, { onConflict: 'item_id,source' })
      }
    }
  }

  await runDdayAlerts()
  await runFilterMatchAlerts()

  const elapsed = Date.now() - startedAt.getTime()
  log.info('daily_scrape_done', { elapsedMs: elapsed, itemsProcessed: details.length, okCount, failCount })
}

function ymOffset(months: number): string {
  const d = new Date(); d.setMonth(d.getMonth() + months)
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 정적 매핑 테이블(matchers/lawdCdMap.ts) 기반 — 행정구역 개편 시 그 파일만 갱신한다.
// 매핑 실패(스크래퍼 파싱 이상치 등) 시 null → 시세 매칭 자동 스킵.
async function resolveLawdCd(sido: string | null, sigungu: string | null): Promise<string | null> {
  return resolveLawdCdFromMap(sido, sigungu)
}

async function notifyOps(message: string) {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return
  await fetch(url, { method: 'POST', body: JSON.stringify({ text: `[auction-worker] ${message}` }), headers: { 'Content-Type': 'application/json' } }).catch(() => {})
}

main().catch(e => {
  log.error('daily_scrape_uncaught', { error: String(e) })
  notifyOps(`치명적 오류: ${e}`)
  process.exit(1)
})
