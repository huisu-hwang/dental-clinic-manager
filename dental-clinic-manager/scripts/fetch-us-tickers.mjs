/**
 * 미국 전체 상장 종목 카탈로그를 받아 src/data/us-tickers.json 생성.
 *
 * 데이터 소스: GitHub `rreichel3/US-Stock-Symbols` (NASDAQ/NYSE/AMEX 매일 갱신)
 *   https://github.com/rreichel3/US-Stock-Symbols
 *
 * 갱신이 필요할 때 수동 실행:
 *   node scripts/fetch-us-tickers.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCES = [
  { url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json', exchange: 'NASDAQ' },
  { url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json', exchange: 'NYSE' },
  { url: 'https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.json', exchange: 'AMEX' },
]

const OUT_PATH = resolve(process.cwd(), 'src/data/us-tickers.json')

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} → ${res.status}`)
  return res.json()
}

async function main() {
  const all = []
  for (const src of SOURCES) {
    console.log(`[fetch] ${src.exchange}...`)
    const rows = await fetchJson(src.url)
    if (!Array.isArray(rows)) {
      console.warn(`[skip] ${src.exchange}: non-array response`)
      continue
    }
    for (const r of rows) {
      // 스키마: { symbol, name, lastsale, netchange, pctchange, marketCap, country, ipoyear, volume, sector, industry, url }
      const ticker = r.symbol
      const name = r.name
      if (!ticker || !name) continue
      // ETF 표시 가능한 필드 없음 → name으로 휴리스틱 (선택사항)
      const isETF = /\bETF\b/i.test(name) || / FUND$/i.test(name)
      const mc = typeof r.marketCap === 'number' ? r.marketCap
        : typeof r.marketCap === 'string' && r.marketCap ? parseFloat(r.marketCap) : 0
      const sector = r.sector ?? null
      all.push({
        ticker: String(ticker).trim().toUpperCase(),
        name: String(name).trim(),
        exchange: src.exchange,
        isETF,
        marketCap: Number.isFinite(mc) && mc > 0 ? mc : 0,
        sector: typeof sector === 'string' && sector ? sector : null,
      })
    }
  }

  // 정렬 + 중복 제거
  all.sort((a, b) => a.ticker.localeCompare(b.ticker))
  const seen = new Set()
  const dedup = []
  for (const it of all) {
    if (seen.has(it.ticker)) continue
    seen.add(it.ticker)
    dedup.push(it)
  }

  mkdirSync(resolve(process.cwd(), 'src/data'), { recursive: true })
  writeFileSync(OUT_PATH, JSON.stringify(dedup), 'utf-8')
  const sizeKB = (JSON.stringify(dedup).length / 1024).toFixed(0)
  console.log(`[done] ${dedup.length} tickers → ${OUT_PATH} (${sizeKB} KB)`)
}

main().catch((err) => {
  console.error('[fetch-us-tickers] failed:', err)
  process.exit(1)
})
