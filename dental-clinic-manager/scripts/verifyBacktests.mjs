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
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'backtest-verification-report.md')
const TARGET_EMAIL = 'whitedc0902@gmail.com'
const TARGET_TICKERS = ['005930', 'AAPL']
const MIN_DAYS = 3650
const PRICE_TOLERANCE = 0.01
const RETURN_TOLERANCE = 0.01
const PNL_TOLERANCE = 0.01
const EQUITY_TOLERANCE = 1
const REPORT_TIMEZONE = 'Asia/Seoul'

dotenv.config({ path: path.join(REPO_ROOT, '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env.local')
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

async function main() {
  const modules = await loadCanonicalModules()
  const { fetchPrices, runBacktest, PRESET_STRATEGIES } = modules

  const user = await resolveUser(TARGET_EMAIL)
  if (!user?.id) {
    throw new Error(`Could not resolve user id for ${TARGET_EMAIL}`)
  }

  const runs = await fetchTargetRuns(user.id)
  const presetMap = new Map(PRESET_STRATEGIES.map((preset) => [preset.id, preset]))
  const strategyCache = new Map()
  const results = {
    passed: [],
    mismatched: [],
    errors: [],
  }

  for (const run of runs) {
    try {
      const strategyContext = await reconstructStrategyInputs(run, presetMap, strategyCache)
      const prices = await fetchPrices(run.ticker, run.market, run.start_date, run.end_date)
      const rerun = runBacktest({
        prices,
        indicators: strategyContext.indicators,
        buyConditions: strategyContext.buyConditions,
        sellConditions: strategyContext.sellConditions,
        riskSettings: strategyContext.riskSettings,
        initialCapital: run.initial_capital,
        market: run.market,
        ticker: run.ticker,
        // backtest_runs 에 use_full_capital 컬럼이 없으므로 환경변수 override 또는 기본 true 가정.
        // (UI 가 자본 100% 사용으로 백테스트하는 게 일반적이라 5배 차이를 만들고 있었음)
        useFullCapital: process.env.BACKTEST_VERIFY_FULL_CAPITAL === '0' ? false : true,
      })

      const comparison = compareRun(run, rerun, strategyContext)
      if (comparison.status === 'passed') {
        results.passed.push(comparison)
      } else {
        results.mismatched.push(comparison)
      }
    } catch (error) {
      results.errors.push(buildErrorEntry(run, error))
    }
  }

  const report = buildReport(runs, results)
  await fs.writeFile(REPORT_PATH, report, 'utf8')
  process.stdout.write(report)
}

async function writeFailureReport(error) {
  const message = error instanceof Error ? error.message : String(error)
  const stackTop = error instanceof Error && error.stack
    ? error.stack.split('\n').slice(0, 2).join(' | ')
    : ''

  const report = [
    `## Backtest Verification Report — ${formatReportDate()}`,
    '',
    '### Summary',
    '- Total runs checked: 0',
    '- Passed: 0',
    '- Mismatched: 0',
    '- Errors: 1',
    '',
    '### ✅ Passed',
    '- None',
    '',
    '### ⚠️ Mismatched',
    '- None',
    '',
    '### 🐛 Errors',
    `- Infrastructure failure — ${message}${stackTop ? ` | ${stackTop}` : ''}`,
    '',
  ].join('\n')

  await fs.writeFile(REPORT_PATH, report, 'utf8')
  process.stdout.write(report)
}

async function loadCanonicalModules() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'verify-backtests-'))
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
    'src/components/Investment/StrategyBuilder/presets.ts',
  ]

  for (const relPath of targets) {
    await transpileModuleToTemp(relPath, tmpRoot)
  }

  const backtestModule = await import(pathToFileURL(path.join(tmpRoot, 'src/lib/backtestEngine.js')).href)
  const stockDataModule = await import(pathToFileURL(path.join(tmpRoot, 'src/lib/stockDataService.js')).href)
  const presetModule = await import(pathToFileURL(path.join(tmpRoot, 'src/components/Investment/StrategyBuilder/presets.js')).href)

  return {
    runBacktest: backtestModule.runBacktest,
    fetchPrices: stockDataModule.fetchPrices,
    PRESET_STRATEGIES: presetModule.PRESET_STRATEGIES,
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

    let resolvedTarget
    if (specifier.startsWith('@/')) {
      resolvedTarget = path.join(tmpRoot, 'src', specifier.slice(2)) + '.js'
    } else {
      resolvedTarget = path.resolve(path.dirname(outputPath), specifier) + '.js'
    }

    let next = path.relative(path.dirname(outputPath), resolvedTarget).replace(/\\/g, '/')
    if (!next.startsWith('.')) next = `./${next}`
    return next
  }

  return code
    .replace(/from\s+['"]([^'"]+)['"]/g, (match, specifier) => `from "${replaceSpecifier(specifier)}"`)
    .replace(/import\(\s*['"]([^'"]+)['"]\s*\)/g, (match, specifier) => `import("${replaceSpecifier(specifier)}")`)
}

async function resolveUser(email) {
  // 환경변수 또는 하드코딩된 user_id 우선 사용 (Supabase admin API 호출 회피)
  const overrideId = process.env.BACKTEST_VERIFY_USER_ID
  if (overrideId) {
    return { id: overrideId, email }
  }
  if (email === 'whitedc0902@gmail.com') {
    return { id: 'eb46c51d-95a1-4be9-9b30-edcdbd9eb8be', email }
  }

  const usersResult = await supabase
    .from('users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()

  if (!usersResult.error && usersResult.data?.id) {
    return usersResult.data
  }

  const profilesResult = await supabase
    .from('profiles')
    .select('id, email')
    .eq('email', email)
    .maybeSingle()

  if (!profilesResult.error && profilesResult.data?.id) {
    return profilesResult.data
  }

  let page = 1
  try {
    while (page <= 10) {
      const { data, error } = await supabase.auth.admin.listUsers({
        page,
        perPage: 200,
      })
      if (error) break
      const found = data.users.find((user) => user.email === email)
      if (found) {
        return { id: found.id, email: found.email }
      }
      if (!data.users.length || data.users.length < 200) break
      page += 1
    }
  } catch {
    return null
  }

  return null
}

async function fetchTargetRuns(userId) {
  const { data, error } = await supabase
    .from('backtest_runs')
    .select('id, strategy_id, preset_id, preset_name, start_date, end_date, initial_capital, full_metrics, trades, equity_curve, ticker, market, status, executed_at')
    .eq('user_id', userId)
    .in('ticker', TARGET_TICKERS)
    .eq('status', 'completed')
    .order('executed_at', { ascending: true })

  if (error) {
    throw new Error(`Failed to fetch backtest runs: ${error.message}`)
  }

  return (data || []).filter((run) => dateDiffDays(run.start_date, run.end_date) >= MIN_DAYS)
}

function dateDiffDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00.000Z`)
  const end = new Date(`${endDate}T00:00:00.000Z`)
  return Math.floor((end.getTime() - start.getTime()) / 86400000)
}

async function reconstructStrategyInputs(run, presetMap, strategyCache) {
  const defaultRisk = {
    maxDailyLossPercent: 2,
    maxPositions: 5,
    maxPositionSizePercent: 20,
    stopLossPercent: 7,
    takeProfitPercent: 15,
    maxHoldingDays: 30,
  }

  if (run.preset_id) {
    const preset = presetMap.get(run.preset_id)
    if (!preset) {
      throw new Error(`Preset not found for preset_id=${run.preset_id}`)
    }

    return {
      sourceType: 'preset',
      name: preset.name || run.preset_name || run.preset_id,
      indicators: preset.indicators,
      buyConditions: preset.buyConditions,
      sellConditions: preset.sellConditions,
      riskSettings: { ...defaultRisk, ...(preset.riskSettings || {}) },
      updatedAt: null,
    }
  }

  if (!run.strategy_id) {
    throw new Error('Neither preset_id nor strategy_id is set')
  }

  if (!strategyCache.has(run.strategy_id)) {
    const { data, error } = await supabase
      .from('investment_strategies')
      .select('id, name, buy_conditions, sell_conditions, indicators, risk_settings, updated_at')
      .eq('id', run.strategy_id)
      .single()

    if (error || !data) {
      throw new Error(`Strategy not found for strategy_id=${run.strategy_id}: ${error?.message || 'unknown error'}`)
    }
    strategyCache.set(run.strategy_id, data)
  }

  const strategy = strategyCache.get(run.strategy_id)
  return {
    sourceType: 'strategy',
    name: strategy.name || run.strategy_id,
    indicators: strategy.indicators,
    buyConditions: strategy.buy_conditions,
    sellConditions: strategy.sell_conditions,
    riskSettings: strategy.risk_settings,
    updatedAt: strategy.updated_at || null,
  }
}

function compareRun(run, rerun, strategyContext) {
  const storedTrades = normalizeTrades(run.trades)
  const rerunTrades = normalizeTrades(rerun.trades)
  const tradeComparison = compareTrades(storedTrades, rerunTrades)

  const storedFinalEquity = getFinalEquity(run.equity_curve)
  const rerunFinalEquity = getFinalEquity(rerun.equityCurve)
  const storedExpectedFinalEquity = round2(run.initial_capital + sumPnL(storedTrades))
  const rerunExpectedFinalEquity = round2(run.initial_capital + sumPnL(rerunTrades))
  const storedEquityConsistent = storedFinalEquity != null
    ? Math.abs(Math.round(storedExpectedFinalEquity) - storedFinalEquity) <= EQUITY_TOLERANCE
    : false
  const rerunEquityConsistent = rerunFinalEquity != null
    ? Math.abs(Math.round(rerunExpectedFinalEquity) - rerunFinalEquity) <= EQUITY_TOLERANCE
    : false

  const storedMetricReturn = extractStoredTotalReturn(run.full_metrics)
  const rerunMetricReturn = Number(rerun.metrics?.totalReturn ?? 0)
  const storedDerivedReturn = storedFinalEquity != null
    ? ((storedFinalEquity - run.initial_capital) / run.initial_capital) * 100
    : null
  const rerunDerivedReturn = rerunFinalEquity != null
    ? ((rerunFinalEquity - run.initial_capital) / run.initial_capital) * 100
    : null

  const storedReturnConsistent = storedMetricReturn != null && storedDerivedReturn != null
    ? nearlyEqual(storedMetricReturn, storedDerivedReturn, RETURN_TOLERANCE)
    : false
  const rerunReturnConsistent = rerunDerivedReturn != null
    ? nearlyEqual(rerunMetricReturn, rerunDerivedReturn, RETURN_TOLERANCE)
    : false
  const totalReturnMatches = storedMetricReturn != null
    ? nearlyEqual(storedMetricReturn, rerunMetricReturn, RETURN_TOLERANCE)
    : nearlyEqual(rerunMetricReturn, rerunDerivedReturn ?? rerunMetricReturn, RETURN_TOLERANCE)

  const storedBuyHold = extractStoredBuyHoldReturn(run.full_metrics)
  const rerunBuyHold = Number(rerun.buyHold?.totalReturn ?? 0)
  const buyHoldConsistent = storedBuyHold == null ? null : nearlyEqual(storedBuyHold, rerunBuyHold, RETURN_TOLERANCE)

  const checks = {
    tradeCount: storedTrades.length === rerunTrades.length,
    tradeDetails: tradeComparison.firstDivergenceIndex == null,
    storedEquityConsistent,
    rerunEquityConsistent,
    finalEquityMatches: storedFinalEquity != null && rerunFinalEquity != null
      ? Math.abs(storedFinalEquity - rerunFinalEquity) <= EQUITY_TOLERANCE
      : false,
    storedReturnConsistent,
    rerunReturnConsistent,
    totalReturnMatches,
    buyHoldConsistent,
  }

  const passed = checks.tradeCount
    && checks.tradeDetails
    && checks.storedEquityConsistent
    && checks.rerunEquityConsistent
    && checks.finalEquityMatches
    && checks.storedReturnConsistent
    && checks.rerunReturnConsistent
    && checks.totalReturnMatches
    && checks.buyHoldConsistent !== false

  const entry = {
    status: passed ? 'passed' : 'mismatched',
    runId: run.id,
    name: strategyContext.name,
    sourceType: strategyContext.sourceType,
    storedTradesCount: storedTrades.length,
    rerunTradesCount: rerunTrades.length,
    firstDivergenceIndex: tradeComparison.firstDivergenceIndex,
    storedTrade: tradeComparison.storedTrade,
    rerunTrade: tradeComparison.rerunTrade,
    checks,
    storedFinalEquity,
    rerunFinalEquity,
    storedMetricReturn,
    rerunMetricReturn,
    storedBuyHold,
    rerunBuyHold,
    estimatedCause: passed ? null : estimateCause(run, strategyContext, checks, tradeComparison),
    brief: passed
      ? `${storedTrades.length} trades matched; total return ${formatNumber(rerunMetricReturn)}%`
      : null,
  }

  return entry
}

function normalizeTrades(rawTrades) {
  if (!Array.isArray(rawTrades)) return []
  return rawTrades.map((trade) => ({
    entry_date: valueOrNull(trade.entryDate, trade.entry_date),
    exit_date: valueOrNull(trade.exitDate, trade.exit_date),
    entry_price: numericOrNull(trade.entryPrice, trade.entry_price),
    exit_price: numericOrNull(trade.exitPrice, trade.exit_price),
    quantity: numericOrNull(trade.quantity),
    pnl: numericOrNull(trade.pnl),
  }))
}

function compareTrades(storedTrades, rerunTrades) {
  const length = Math.min(storedTrades.length, rerunTrades.length)
  for (let index = 0; index < length; index += 1) {
    const storedTrade = storedTrades[index]
    const rerunTrade = rerunTrades[index]
    const same =
      storedTrade.entry_date === rerunTrade.entry_date
      && storedTrade.exit_date === rerunTrade.exit_date
      && nearlyEqual(storedTrade.entry_price, rerunTrade.entry_price, PRICE_TOLERANCE)
      && nearlyEqual(storedTrade.exit_price, rerunTrade.exit_price, PRICE_TOLERANCE)
      && Number(storedTrade.quantity) === Number(rerunTrade.quantity)
      && nearlyEqual(storedTrade.pnl, rerunTrade.pnl, PNL_TOLERANCE)

    if (!same) {
      return {
        firstDivergenceIndex: index,
        storedTrade,
        rerunTrade,
      }
    }
  }

  if (storedTrades.length !== rerunTrades.length) {
    return {
      firstDivergenceIndex: length,
      storedTrade: storedTrades[length] || null,
      rerunTrade: rerunTrades[length] || null,
    }
  }

  return {
    firstDivergenceIndex: null,
    storedTrade: null,
    rerunTrade: null,
  }
}

function estimateCause(run, strategyContext, checks, tradeComparison) {
  if (!checks.tradeCount || tradeComparison.firstDivergenceIndex != null) {
    if (strategyContext.sourceType === 'preset') {
      return 'strategy definition change'
    }
    if (strategyContext.updatedAt && run.executed_at && new Date(strategyContext.updatedAt) > new Date(run.executed_at)) {
      return 'strategy definition change'
    }
    if (tradeComparison.storedTrade && tradeComparison.rerunTrade) {
      const sameDates =
        tradeComparison.storedTrade.entry_date === tradeComparison.rerunTrade.entry_date
        && tradeComparison.storedTrade.exit_date === tradeComparison.rerunTrade.exit_date
      if (sameDates) return 'price data drift'
    }
    return 'price data drift'
  }

  if (!checks.totalReturnMatches || !checks.finalEquityMatches) {
    return 'rounding'
  }

  return 'engine bug'
}

function buildErrorEntry(run, error) {
  const message = error instanceof Error ? error.message : String(error)
  const stackTop = error instanceof Error && error.stack
    ? error.stack.split('\n').slice(0, 2).join(' | ')
    : ''
  const isNetworkRelated = /fetch failed|ECONN|ENOTFOUND|network|timeout|rate limit|주가 데이터를 가져올 수 없습니다/i.test(message)
  return {
    runId: run.id,
    name: run.preset_name || run.preset_id || run.strategy_id || 'unknown',
    message: isNetworkRelated
      ? `${message} (likely yahoo-finance2/network limitation)`
      : message,
    stackTop,
  }
}

function buildReport(runs, results) {
  const today = formatReportDate()
  const lines = [
    `## Backtest Verification Report — ${today}`,
    '',
    '### Summary',
    `- Total runs checked: ${runs.length}`,
    `- Passed: ${results.passed.length}`,
    `- Mismatched: ${results.mismatched.length}`,
    `- Errors: ${results.errors.length}`,
    '',
    '### ✅ Passed',
  ]

  if (results.passed.length === 0) {
    lines.push('- None')
  } else {
    for (const item of results.passed) {
      lines.push(`- [${item.runId}] ${item.name} — ${item.brief}`)
    }
  }

  lines.push('', '### ⚠️ Mismatched')
  if (results.mismatched.length === 0) {
    lines.push('- None')
  } else {
    for (const item of results.mismatched) {
      lines.push(`- Run ID: ${item.runId}, ${item.name}`)
      lines.push(`- Stored trades: ${item.storedTradesCount}, Rerun trades: ${item.rerunTradesCount}`)
      lines.push(`- First diverging trade index: ${item.firstDivergenceIndex == null ? 'None' : item.firstDivergenceIndex}`)
      lines.push(`- Stored: ${formatTrade(item.storedTrade)}`)
      lines.push(`- Rerun: ${formatTrade(item.rerunTrade)}`)
      lines.push(`- Stored final equity: ${item.storedFinalEquity ?? 'N/A'}, Rerun final equity: ${item.rerunFinalEquity ?? 'N/A'}`)
      lines.push(`- Stored total_return: ${formatMaybeNumber(item.storedMetricReturn)}%, Rerun total_return: ${formatMaybeNumber(item.rerunMetricReturn)}%`)
      if (item.storedBuyHold != null) {
        lines.push(`- Stored buy_and_hold: ${formatMaybeNumber(item.storedBuyHold)}%, Rerun buy_and_hold: ${formatMaybeNumber(item.rerunBuyHold)}%`)
      } else {
        lines.push(`- Stored buy_and_hold: unavailable in backtest_runs row, Rerun buy_and_hold: ${formatMaybeNumber(item.rerunBuyHold)}%`)
      }
      lines.push(`- Estimated cause: ${item.estimatedCause}`)
    }
  }

  lines.push('', '### 🐛 Errors')
  if (results.errors.length === 0) {
    lines.push('- None')
  } else {
    for (const item of results.errors) {
      lines.push(`- ${item.runId} — ${item.message}${item.stackTop ? ` | ${item.stackTop}` : ''}`)
    }
  }

  if (results.mismatched.length > 0) {
    lines.push('', '### Recommended Follow-up')
    lines.push('- P1: Re-run the mismatched run IDs through the API path in a controlled environment and snapshot the fetched OHLCV payload used by `fetchPrices`.')
    lines.push('- P2: Compare current preset/strategy definitions against the historical execution date to confirm whether the strategy inputs changed after the original run.')
    lines.push('- P3: If prices and strategy definitions both match, instrument `runBacktest` to dump the first diverging signal/trade and isolate an engine regression.')
  }

  lines.push('')
  return lines.join('\n')
}

function extractStoredTotalReturn(fullMetrics) {
  if (!fullMetrics || typeof fullMetrics !== 'object') return null
  return numericOrNull(fullMetrics.totalReturn, fullMetrics.total_return)
}

function extractStoredBuyHoldReturn(fullMetrics) {
  if (!fullMetrics || typeof fullMetrics !== 'object') return null
  return numericOrNull(
    fullMetrics.buy_hold_return,
    fullMetrics.buyHold?.totalReturn,
    fullMetrics.buy_hold?.total_return,
  )
}

function getFinalEquity(equityCurve) {
  if (!Array.isArray(equityCurve) || equityCurve.length === 0) return null
  const last = equityCurve[equityCurve.length - 1]
  return numericOrNull(last?.value)
}

function sumPnL(trades) {
  return round2(trades.reduce((sum, trade) => sum + Number(trade.pnl || 0), 0))
}

function nearlyEqual(a, b, tolerance) {
  if (a == null || b == null) return false
  return Math.abs(Number(a) - Number(b)) <= tolerance
}

function numericOrNull(...values) {
  for (const value of values) {
    if (value == null || value === '') continue
    const num = Number(value)
    if (!Number.isNaN(num) && Number.isFinite(num)) return num
  }
  return null
}

function valueOrNull(...values) {
  for (const value of values) {
    if (value != null && value !== '') return value
  }
  return null
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100
}

function formatNumber(value) {
  return Number(value).toFixed(2)
}

function formatMaybeNumber(value) {
  return value == null ? 'N/A' : formatNumber(value)
}

function formatTrade(trade) {
  if (!trade) return 'None'
  return `{entry_date: ${trade.entry_date ?? 'null'}, exit_date: ${trade.exit_date ?? 'null'}, entry_price: ${formatMaybeNumber(trade.entry_price)}, exit_price: ${formatMaybeNumber(trade.exit_price)}, quantity: ${trade.quantity ?? 'null'}, pnl: ${formatMaybeNumber(trade.pnl)}}`
}

function formatReportDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: REPORT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

try {
  await main()
} catch (error) {
  await writeFailureReport(error)
  process.exitCode = 0
}
