/**
 * 분봉 fetcher 검증 스크립트
 *
 * 실행: npx tsx scripts/test-intraday-fetcher.ts
 *
 * 검증 항목:
 * 1) AAPL 5분봉 — yahoo-finance2 응답
 * 2) Samsung(005930) 5분봉 — KOSPI .KS, 한국 분봉이 yahoo에 있을 경우 응답
 * 3) AAPL 1분봉 — 7일 제한
 */

import { fetchIntradayPrices } from '../src/lib/intradayDataService'

async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  Intraday Fetcher Test')
  console.log('═══════════════════════════════════════════\n')

  // ── 1) AAPL 5분봉
  console.log('▶ Test 1: AAPL 5m (US)')
  try {
    const aapl5m = await fetchIntradayPrices({ ticker: 'AAPL', market: 'US', timeframe: '5m' })
    console.log(`  bars=${aapl5m.length}`)
    if (aapl5m.length > 0) {
      const first = aapl5m[0]
      const last = aapl5m[aapl5m.length - 1]
      console.log(`  first: ${first.date}  O=${first.open}  H=${first.high}  L=${first.low}  C=${first.close}  V=${first.volume}`)
      console.log(`  last:  ${last.date}  C=${last.close}  V=${last.volume}`)
    } else {
      console.log('  ⚠ 빈 배열 반환')
    }
  } catch (e) {
    console.error('  ❌ 오류:', e instanceof Error ? e.message : e)
  }
  console.log()

  // ── 2) Samsung 5분봉 (KOSPI)
  console.log('▶ Test 2: Samsung 005930 5m (KR)')
  try {
    const samsung5m = await fetchIntradayPrices({ ticker: '005930', market: 'KR', timeframe: '5m' })
    console.log(`  bars=${samsung5m.length}`)
    if (samsung5m.length > 0) {
      const first = samsung5m[0]
      const last = samsung5m[samsung5m.length - 1]
      console.log(`  first: ${first.date}  C=${first.close}  V=${first.volume}`)
      console.log(`  last:  ${last.date}  C=${last.close}  V=${last.volume}`)
    } else {
      console.log('  ⚠ 한국 분봉 미지원 가능성 — yahoo가 빈 응답')
    }
  } catch (e) {
    console.error('  ❌ 오류:', e instanceof Error ? e.message : e)
  }
  console.log()

  // ── 3) AAPL 1분봉 (7일 제한)
  console.log('▶ Test 3: AAPL 1m (US, 7-day limit)')
  try {
    const aapl1m = await fetchIntradayPrices({ ticker: 'AAPL', market: 'US', timeframe: '1m' })
    console.log(`  bars=${aapl1m.length}`)
    if (aapl1m.length > 0) {
      const first = aapl1m[0]
      const last = aapl1m[aapl1m.length - 1]
      console.log(`  first: ${first.date}`)
      console.log(`  last:  ${last.date}`)
    } else {
      console.log('  ⚠ 빈 배열 반환')
    }
  } catch (e) {
    console.error('  ❌ 오류:', e instanceof Error ? e.message : e)
  }
  console.log()

  // ── 4) AAPL 15분봉
  console.log('▶ Test 4: AAPL 15m (US)')
  try {
    const aapl15m = await fetchIntradayPrices({ ticker: 'AAPL', market: 'US', timeframe: '15m' })
    console.log(`  bars=${aapl15m.length}`)
    if (aapl15m.length > 0) {
      console.log(`  first: ${aapl15m[0].date}`)
      console.log(`  last:  ${aapl15m[aapl15m.length - 1].date}`)
    }
  } catch (e) {
    console.error('  ❌ 오류:', e instanceof Error ? e.message : e)
  }

  console.log('\n═══════════════════════════════════════════')
  console.log('  Test Complete')
  console.log('═══════════════════════════════════════════')
}

main().catch(e => {
  console.error('Unhandled error:', e)
  process.exit(1)
})
