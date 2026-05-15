/**
 * Strategy Matrix 사전계산 배치 워커
 *
 * 모든 (전략 × 시장 × 종목 × 기간) 조합을 백테스트하여 strategy_matrix_runs 에 저장한다.
 * Mac mini M4 launchd 로 매일 19:00 KST 실행 (incremental, engine_version 변경 시 자동 재계산).
 *
 * CLI:
 *   node scripts/buildStrategyMatrix.mjs                          # 전체 풀배치 (1,230종목 × 31+전략 × 4기간)
 *   node scripts/buildStrategyMatrix.mjs --limit 100               # 최대 100건만 (시범)
 *   node scripts/buildStrategyMatrix.mjs --markets KR              # KR 만
 *   node scripts/buildStrategyMatrix.mjs --tickers 005930,AAPL     # 특정 종목 (콤마 구분)
 *   node scripts/buildStrategyMatrix.mjs --presets rsi-oversold,golden-cross
 *   node scripts/buildStrategyMatrix.mjs --windows 1Y,3Y           # 일부 윈도우만
 *   node scripts/buildStrategyMatrix.mjs --concurrency 4           # 동시 백테스트 수 (기본 4)
 *   node scripts/buildStrategyMatrix.mjs --skip-shared             # 공유 사용자 전략 건너뛰기
 *   node scripts/buildStrategyMatrix.mjs --requeue-failed          # 이전 failed 잡 재시도
 *
 * 환경변수 (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import dotenv from 'dotenv'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

dotenv.config({ path: path.join(REPO_ROOT, '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing in .env.local')
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// CLI 파싱
const args = parseArgs(process.argv.slice(2))

const INITIAL_CAPITAL = 10_000_000
const WINDOWS = ['1Y', '3Y', '5Y', '10Y']
const WINDOW_YEARS = { '1Y': 1, '3Y': 3, '5Y': 5, '10Y': 10 }

async function main() {
  console.log('=== Strategy Matrix Builder ===')
  console.log('args:', args)

  const modules = await loadCanonicalModules()
  const { fetchPrices, runBacktest, ENGINE_VERSION, PRESET_STRATEGIES, UNIVERSES } = modules

  console.log(`engine_version=${ENGINE_VERSION}`)

  // 1. 전략 목록 구성
  const entries = await buildEntryList(PRESET_STRATEGIES, args)
  console.log(`entries: ${entries.length} (presets=${entries.filter(e => e.type === 'preset').length}, shared=${entries.filter(e => e.type === 'shared').length})`)

  // 2. universe 구성
  const universe = buildUniverse(UNIVERSES, args)
  console.log(`universe: ${universe.length} tickers (KR=${universe.filter(u => u.market === 'KR').length}, US=${universe.filter(u => u.market === 'US').length})`)

  // 3. 윈도우 구성
  const windows = (args.windows ?? WINDOWS).filter(w => WINDOWS.includes(w))
  console.log(`windows: ${windows.join(', ')}`)

  // 4. 작업 큐 큐잉 (engine_version 일치하는 기존 done 행은 skip)
  const queued = await queueJobs({
    entries,
    universe,
    windows,
    engineVersion: ENGINE_VERSION,
    requeueFailed: args.requeueFailed === true,
  })
  console.log(`queued: ${queued} new jobs`)

  // 5. 워커 처리
  const limit = args.limit ?? Infinity
  const concurrency = Number(args.concurrency ?? 4)
  const stats = await processJobs({
    fetchPrices,
    runBacktest,
    engineVersion: ENGINE_VERSION,
    limit,
    concurrency,
  })
  console.log(`processed: done=${stats.done}, failed=${stats.failed}, skipped=${stats.skipped}`)

  // 6. 머티리얼라이즈드 뷰 새로고침
  if (stats.done > 0) {
    console.log('refreshing strategy_matrix_market_stats ...')
    try {
      const { error } = await supabase.rpc('refresh_strategy_matrix_market_stats')
      if (error) {
        console.log(`(note: ${error.message}) — REFRESH 는 별도 RPC 함수 필요. 본 배치는 데이터 적재만 완료.`)
      } else {
        console.log('materialized view refreshed')
      }
    } catch (err) {
      console.log(`(note: REFRESH RPC 호출 실패 ${err?.message ?? err}) — 데이터 적재만 완료`)
    }
  }

  console.log('=== done ===')
  process.exit(0)
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        if (['markets', 'tickers', 'presets', 'windows'].includes(key)) {
          out[key] = next.split(',').map(s => s.trim()).filter(Boolean)
        } else if (['limit', 'concurrency'].includes(key)) {
          out[key] = Number(next)
        } else {
          out[key] = next
        }
        i++
      } else {
        out[key] = true
      }
    }
  }
  return out
}

async function buildEntryList(PRESET_STRATEGIES, args) {
  const entries = []
  const presetFilter = args.presets ? new Set(args.presets) : null

  for (const preset of PRESET_STRATEGIES) {
    if (presetFilter && !presetFilter.has(preset.id)) continue
    entries.push({
      type: 'preset',
      id: preset.id,
      name: preset.name,
      indicators: preset.indicators,
      buyConditions: preset.buyConditions,
      sellConditions: preset.sellConditions,
      riskSettings: preset.riskSettings,
    })
  }

  if (args.skipShared !== true) {
    const { data: shared, error } = await supabase
      .from('investment_strategies')
      .select('id, name, indicators, buy_conditions, sell_conditions, risk_settings')
      .eq('is_shared', true)
    if (error) {
      console.warn('shared strategies fetch failed (계속 진행):', error.message)
    } else if (shared) {
      for (const s of shared) {
        entries.push({
          type: 'shared',
          id: s.id,
          name: s.name,
          indicators: s.indicators ?? [],
          buyConditions: s.buy_conditions,
          sellConditions: s.sell_conditions,
          riskSettings: s.risk_settings ?? {},
        })
      }
    }
  }

  return entries
}

function buildUniverse(UNIVERSES, args) {
  const marketFilter = args.markets ? new Set(args.markets) : null
  const tickerFilter = args.tickers ? new Set(args.tickers) : null

  const all = []
  for (const u of UNIVERSES.KR_ALL.entries) all.push(u)
  for (const u of UNIVERSES.US_ALL.entries) all.push(u)

  return all.filter(e => {
    if (marketFilter && !marketFilter.has(e.market)) return false
    if (tickerFilter && !tickerFilter.has(e.ticker)) return false
    return true
  })
}

async function queueJobs({ entries, universe, windows, engineVersion, requeueFailed }) {
  // 기존 done 행 미리 조회
  const { data: existing } = await supabase
    .from('strategy_matrix_runs')
    .select('entry_type, entry_id, market, ticker, period_window')
    .eq('engine_version', engineVersion)
  const doneSet = new Set(
    (existing ?? []).map(r => `${r.entry_type}|${r.entry_id}|${r.market}|${r.ticker}|${r.period_window}`)
  )

  if (requeueFailed) {
    await supabase
      .from('strategy_matrix_jobs')
      .update({ status: 'queued', attempts: 0, error: null })
      .eq('status', 'failed')
  }

  const toInsert = []
  for (const entry of entries) {
    for (const tick of universe) {
      for (const win of windows) {
        const key = `${entry.type}|${entry.id}|${tick.market}|${tick.ticker}|${win}`
        if (doneSet.has(key)) continue
        toInsert.push({
          entry_type: entry.type,
          entry_id: entry.id,
          market: tick.market,
          ticker: tick.ticker,
          period_window: win,
        })
      }
    }
  }

  // 청크 단위로 upsert
  const CHUNK = 500
  let queued = 0
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK)
    const { error } = await supabase
      .from('strategy_matrix_jobs')
      .upsert(chunk, {
        onConflict: 'entry_type,entry_id,market,ticker,period_window',
        ignoreDuplicates: true,
      })
    if (error) {
      console.warn(`upsert chunk failed: ${error.message}`)
    } else {
      queued += chunk.length
    }
  }
  return queued
}

async function processJobs({ fetchPrices, runBacktest, engineVersion, limit, concurrency }) {
  const stats = { done: 0, failed: 0, skipped: 0 }

  // 전략 데이터 캐시 (preset_id / strategy_id → 정의)
  const entryCache = new Map()
  // 가격 데이터 캐시 (ticker → 10Y OHLCV)
  const priceCache = new Map()

  while (stats.done + stats.failed < limit) {
    // 다음 처리할 잡 N개 fetch
    const batchSize = Math.min(concurrency * 5, limit - stats.done - stats.failed)
    if (batchSize <= 0) break

    const { data: jobs, error } = await supabase
      .from('strategy_matrix_jobs')
      .select('*')
      .eq('status', 'queued')
      .lt('attempts', 3)
      .order('id', { ascending: true })
      .limit(batchSize)

    if (error) {
      console.error('jobs fetch error:', error.message)
      break
    }
    if (!jobs || jobs.length === 0) {
      console.log('no more queued jobs')
      break
    }

    // 동시 처리 (Promise pool)
    const queue = [...jobs]
    const workers = Array.from({ length: concurrency }, () => worker())

    async function worker() {
      while (queue.length > 0) {
        const job = queue.shift()
        if (!job) break
        try {
          const result = await processOne(job)
          if (result === 'done') stats.done++
          else if (result === 'skipped') stats.skipped++
        } catch (err) {
          stats.failed++
          console.warn(`job ${job.id} failed: ${err?.message ?? err}`)
          await supabase
            .from('strategy_matrix_jobs')
            .update({
              status: 'failed',
              attempts: (job.attempts ?? 0) + 1,
              error: String(err?.message ?? err).slice(0, 500),
              finished_at: new Date().toISOString(),
            })
            .eq('id', job.id)
        }
        if (stats.done % 50 === 0 && stats.done > 0) {
          console.log(`  progress: done=${stats.done} failed=${stats.failed} skipped=${stats.skipped}`)
        }
      }
    }

    await Promise.all(workers)
  }

  async function processOne(job) {
    // running 으로 마킹
    await supabase
      .from('strategy_matrix_jobs')
      .update({ status: 'running', started_at: new Date().toISOString(), attempts: (job.attempts ?? 0) + 1 })
      .eq('id', job.id)

    // 전략 정의 로드 (캐시)
    const entryKey = `${job.entry_type}|${job.entry_id}`
    let entry = entryCache.get(entryKey)
    if (!entry) {
      entry = await loadEntry(job.entry_type, job.entry_id)
      entryCache.set(entryKey, entry)
    }
    if (!entry) {
      throw new Error(`entry not found: ${entryKey}`)
    }

    // 가격 데이터 로드 (캐시, 10Y 한 번만)
    const priceKey = `${job.ticker}|${job.market}`
    let prices10Y = priceCache.get(priceKey)
    if (!prices10Y) {
      const end = new Date()
      const start = new Date(end.getTime())
      start.setFullYear(start.getFullYear() - 10)
      prices10Y = await fetchPrices(job.ticker, job.market, isoDate(start), isoDate(end))
      // 캐시 크기 제한: 100 티커 LRU
      if (priceCache.size > 100) priceCache.delete(priceCache.keys().next().value)
      priceCache.set(priceKey, prices10Y)
    }

    if (!prices10Y || prices10Y.length === 0) {
      throw new Error(`no price data for ${job.ticker}`)
    }

    // 윈도우 슬라이싱
    const years = WINDOW_YEARS[job.period_window]
    const totalDays = years * 365
    const sliced = prices10Y.slice(-Math.max(years * 252, Math.floor(prices10Y.length * years / 10)))
    if (sliced.length < 20) {
      // 데이터 부족 (신규 상장 등) — failed 가 아니라 skipped 로 처리
      await supabase
        .from('strategy_matrix_jobs')
        .update({ status: 'done', finished_at: new Date().toISOString() })
        .eq('id', job.id)
      return 'skipped'
    }

    const result = runBacktest({
      prices: sliced,
      indicators: entry.indicators,
      buyConditions: entry.buyConditions,
      sellConditions: entry.sellConditions,
      riskSettings: entry.riskSettings ?? {},
      initialCapital: INITIAL_CAPITAL,
      market: job.market,
      ticker: job.ticker,
      useFullCapital: true,
    })

    const startDate = sliced[0]?.date
    const endDate = sliced[sliced.length - 1]?.date
    const equityCurveCompact = downsampleEquityCurve(result.equityCurve)

    const { error: insertError } = await supabase
      .from('strategy_matrix_runs')
      .upsert({
        entry_type: job.entry_type,
        entry_id: job.entry_id,
        market: job.market,
        ticker: job.ticker,
        sector: null,
        period_window: job.period_window,
        start_date: startDate,
        end_date: endDate,
        initial_capital: INITIAL_CAPITAL,
        use_full_capital: true,
        total_return: result.metrics?.totalReturn ?? null,
        annualized_return: result.metrics?.annualizedReturn ?? null,
        max_drawdown: result.metrics?.maxDrawdown ?? null,
        sharpe_ratio: result.metrics?.sharpeRatio ?? null,
        win_rate: result.metrics?.winRate ?? null,
        profit_factor: result.metrics?.profitFactor ?? null,
        total_trades: result.metrics?.totalTrades ?? null,
        buy_hold_return: result.buyHold?.buyHoldReturn ?? null,
        equity_curve_compact: equityCurveCompact,
        engine_version: engineVersion,
        computed_at: new Date().toISOString(),
      }, {
        onConflict: 'entry_type,entry_id,market,ticker,period_window,engine_version',
      })

    if (insertError) {
      throw new Error(`insert failed: ${insertError.message}`)
    }

    await supabase
      .from('strategy_matrix_jobs')
      .update({ status: 'done', finished_at: new Date().toISOString(), error: null })
      .eq('id', job.id)

    return 'done'
  }

  async function loadEntry(type, id) {
    if (type === 'preset') {
      return globalPresetCache.get(id) ?? null
    }
    if (type === 'shared') {
      const { data, error } = await supabase
        .from('investment_strategies')
        .select('id, name, indicators, buy_conditions, sell_conditions, risk_settings')
        .eq('id', id)
        .single()
      if (error || !data) return null
      return {
        type: 'shared',
        id: data.id,
        name: data.name,
        indicators: data.indicators ?? [],
        buyConditions: data.buy_conditions,
        sellConditions: data.sell_conditions,
        riskSettings: data.risk_settings ?? {},
      }
    }
    return null
  }

  return stats
}

// 글로벌 프리셋 캐시
const globalPresetCache = new Map()

function downsampleEquityCurve(curve) {
  if (!curve || curve.length === 0) return []
  // 월말 기준 샘플링 → ~120 points/10Y
  const sampled = []
  let lastMonth = null
  for (const point of curve) {
    const month = point.date?.slice(0, 7)
    if (month !== lastMonth) {
      sampled.push({ d: point.date, e: Math.round(point.equity ?? point.totalEquity ?? 0) })
      lastMonth = month
    }
  }
  // 마지막 포인트 포함
  const last = curve[curve.length - 1]
  if (last && sampled[sampled.length - 1]?.d !== last.date) {
    sampled.push({ d: last.date, e: Math.round(last.equity ?? last.totalEquity ?? 0) })
  }
  return sampled
}

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

// ============================================
// TypeScript 모듈 transpile + load (verifyBacktests.mjs 패턴 재사용)
// ============================================
async function loadCanonicalModules() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-builder-'))
  try {
    await fs.symlink(path.join(REPO_ROOT, 'node_modules'), path.join(tmpRoot, 'node_modules'), 'dir')
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
  }

  const targets = [
    'src/lib/backtestEngine.ts',
    'src/lib/indicatorEngine.ts',
    'src/lib/signalEngine.ts',
    'src/lib/stockDataService.ts',
    'src/lib/supabase/admin.ts',
    'src/lib/krTickerDict.ts',
    'src/lib/usTickerDict.ts',
    'src/lib/usTickerCatalog.ts',
    'src/lib/screenerUniverses.ts',
    'src/components/Investment/StrategyBuilder/presets.ts',
  ]

  for (const relPath of targets) {
    await transpileModuleToTemp(relPath, tmpRoot)
  }

  // .json 데이터 파일을 .js ESM 모듈로 변환 (rewriteSpecifiers 가 .json → .js 로 변환하도록 매핑)
  const jsonAssets = ['src/data/us-tickers.json']
  for (const relPath of jsonAssets) {
    const src = path.join(REPO_ROOT, relPath)
    const dst = path.join(tmpRoot, relPath.replace(/\.json$/, '.js'))
    try {
      const content = await fs.readFile(src, 'utf8')
      const wrapped = `export default ${content}\n`
      await fs.mkdir(path.dirname(dst), { recursive: true })
      await fs.writeFile(dst, wrapped, 'utf8')
    } catch (err) {
      console.warn(`json asset prep skipped (${relPath}): ${err?.message}`)
    }
  }

  const backtestModule = await import(pathToFileURL(path.join(tmpRoot, 'src/lib/backtestEngine.js')).href)
  const stockDataModule = await import(pathToFileURL(path.join(tmpRoot, 'src/lib/stockDataService.js')).href)
  const presetModule = await import(pathToFileURL(path.join(tmpRoot, 'src/components/Investment/StrategyBuilder/presets.js')).href)
  const universeModule = await import(pathToFileURL(path.join(tmpRoot, 'src/lib/screenerUniverses.js')).href)

  // 글로벌 프리셋 캐시 채우기
  for (const preset of presetModule.PRESET_STRATEGIES) {
    globalPresetCache.set(preset.id, {
      type: 'preset',
      id: preset.id,
      name: preset.name,
      indicators: preset.indicators,
      buyConditions: preset.buyConditions,
      sellConditions: preset.sellConditions,
      riskSettings: preset.riskSettings,
    })
  }

  return {
    runBacktest: backtestModule.runBacktest,
    ENGINE_VERSION: backtestModule.ENGINE_VERSION,
    fetchPrices: stockDataModule.fetchPrices,
    PRESET_STRATEGIES: presetModule.PRESET_STRATEGIES,
    UNIVERSES: universeModule.UNIVERSES,
  }
}

async function transpileModuleToTemp(relPath, tmpRoot) {
  const sourcePath = path.join(REPO_ROOT, relPath)
  const outputPath = path.join(tmpRoot, relPath.replace(/\.tsx?$/, '.js'))
  const source = await fs.readFile(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      jsx: ts.JsxEmit.Preserve,
    },
    fileName: sourcePath,
  }).outputText
  const rewritten = rewriteSpecifiers(transpiled, outputPath, tmpRoot)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  await fs.writeFile(outputPath, rewritten, 'utf8')
}

function rewriteSpecifiers(code, outputPath, tmpRoot) {
  const replaceSpecifier = (specifier) => {
    if (!specifier.startsWith('@/') && !specifier.startsWith('./') && !specifier.startsWith('../')) {
      return specifier
    }
    // .json 은 .js 로 재매핑 (json 자산은 .js ESM 모듈로 변환되어 복사됨)
    let normalized = specifier.replace(/\.json$/, '.js')
    const hasExt = /\.(js|mjs|cjs)$/.test(normalized)
    let resolvedTarget
    if (normalized.startsWith('@/')) {
      const stripped = normalized.slice(2)
      resolvedTarget = path.join(tmpRoot, 'src', stripped) + (hasExt ? '' : '.js')
    } else {
      resolvedTarget = path.resolve(path.dirname(outputPath), normalized) + (hasExt ? '' : '.js')
    }
    let next = path.relative(path.dirname(outputPath), resolvedTarget).replace(/\\/g, '/')
    if (!next.startsWith('.')) next = `./${next}`
    return next
  }
  return code
    .replace(/from\s+['"]([^'"]+)['"]/g, (m, s) => `from "${replaceSpecifier(s)}"`)
    .replace(/import\(\s*['"]([^'"]+)['"]\s*\)/g, (m, s) => `import("${replaceSpecifier(s)}")`)
}

main().catch(err => {
  console.error('FATAL:', err)
  process.exit(1)
})
