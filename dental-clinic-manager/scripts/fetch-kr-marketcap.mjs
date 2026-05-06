/**
 * KR_TICKER_DICT 전체 종목에 대해 yahoo-finance2의 marketCap을 가져와
 * src/data/kr-tickers-marketcap.json에 저장.
 *
 * 갱신이 필요할 때 수동 실행:
 *   node scripts/fetch-kr-marketcap.mjs
 */

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YahooFinance from 'yahoo-finance2'

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const DICT_PATH = resolve(process.cwd(), 'src/lib/krTickerDict.ts')
const OUT_PATH = resolve(process.cwd(), 'src/data/kr-tickers-marketcap.json')
const CONCURRENCY = 5
const SPACING_MS = 200

function readDict() {
  const src = readFileSync(DICT_PATH, 'utf-8')
  // matchAll 로 모든 entry 추출 (RegExp.exec 루프 회피)
  const re = /\{\s*ticker:\s*'([0-9]{6})'\s*,\s*name:\s*'([^']+)'/g
  const entries = []
  for (const m of src.matchAll(re)) {
    entries.push({ ticker: m[1], name: m[2] })
  }
  return entries
}

async function fetchMarketCap(ticker) {
  for (const suffix of ['.KS', '.KQ']) {
    try {
      const sym = ticker + suffix
      const sum = await yahooFinance.quoteSummary(sym, { modules: ['price', 'summaryDetail'] })
      const mc = sum?.price?.marketCap ?? sum?.summaryDetail?.marketCap ?? null
      if (typeof mc === 'number' && mc > 0) return mc
    } catch {
      // 다음 suffix 시도
    }
  }
  return 0
}

async function runWithLimit(items, limit, fn) {
  const out = new Array(items.length)
  let idx = 0
  async function worker() {
    while (true) {
      const i = idx++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
      await new Promise((r) => setTimeout(r, SPACING_MS))
    }
  }
  await Promise.all(Array.from({ length: limit }, worker))
  return out
}

async function main() {
  const dict = readDict()
  console.log(`[fetch-kr] entries: ${dict.length}`)
  let completed = 0
  const rows = await runWithLimit(dict, CONCURRENCY, async (e) => {
    const mc = await fetchMarketCap(e.ticker)
    completed++
    if (completed % 25 === 0) console.log(`  ${completed}/${dict.length} done`)
    return { ticker: e.ticker, name: e.name, market: 'KR', marketCap: mc }
  })

  rows.sort((a, b) => b.marketCap - a.marketCap)
  mkdirSync(resolve(process.cwd(), 'src/data'), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(rows), 'utf-8')
  const sizeKB = (JSON.stringify(rows).length / 1024).toFixed(0)
  const withMc = rows.filter((r) => r.marketCap > 0).length
  console.log(`[done] ${rows.length} entries (${withMc} with marketCap) -> ${OUT_PATH} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error('[fetch-kr-marketcap] failed:', err)
  process.exit(1)
})
