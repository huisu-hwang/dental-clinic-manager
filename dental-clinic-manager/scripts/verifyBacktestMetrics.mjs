/**
 * Backtest 수익률 / 메트릭 수학적 정합성 검증
 *
 * verifyBacktests.mjs 는 "신호대로 매매했는가" 를 trade 시퀀스 재실행으로 검증.
 * 본 스크립트는 그 다음 단계 — "신호대로 매매한 결과의 수익률이 수학적으로 정확한가" 를 검증.
 *
 * 가격 fetch 없이 저장된 trades + equity_curve + full_metrics 만으로 다음을 검증:
 *
 *   A) trade.pnl 공식 정합성:
 *      pnl == (exit_price - entry_price) × quantity - sellFee - buyFee
 *      sellFee = exit_price × quantity × (sellCommission + sellTax)
 *      buyFee  = entry_price × quantity × buyCommission
 *
 *   B) final_equity 정합성:
 *      equity_curve[-1] ≈ initial_capital + sum(trades.pnl)   (Math.round 누적 오차 허용)
 *
 *   C) total_return 정합성:
 *      total_return == round4((final - initial) / initial × 100)
 *
 *   D) annualizedReturn (CAGR) 정합성:
 *      years = equity_curve.length / 252
 *      annualizedReturn == round4((Math.pow(final/initial, 1/years) - 1) × 100)
 *
 *   E) maxDrawdown 정합성:
 *      peak-to-trough 공식 직접 재계산해서 비교
 *
 *   F) winRate 정합성:
 *      winRate == round4(trades.filter(pnl>0).length / trades.length × 100)
 *
 *   G) profitFactor 정합성:
 *      profitFactor == round4(grossProfit / grossLoss)
 *      grossProfit = sum(positive pnl), grossLoss = abs(sum(negative pnl))
 *
 *   H) sharpeRatio: 일별 수익률 기반 — equity_curve 로 직접 재계산
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')
const REPORT_PATH = path.join(REPO_ROOT, 'scripts', 'backtest-metrics-report.md')
const TARGET_USER_ID = process.env.BACKTEST_VERIFY_USER_ID || 'eb46c51d-95a1-4be9-9b30-edcdbd9eb8be' // whitedc0902@gmail.com
const TARGET_TICKERS = ['005930', 'AAPL']
const MIN_DAYS = 3650

dotenv.config({ path: path.join(REPO_ROOT, '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const COMMISSION_RATES = {
  KR: { buyCommission: 0.00015, sellCommission: 0.00015, sellTax: 0.0023 },
  US: { buyCommission: 0, sellCommission: 0, sellTax: 0.0000278 },
}

const TOL_ABS = 1.0      // 절대 오차 ≤ 1원
const TOL_REL = 0.0001   // 상대 오차 ≤ 0.01%

function round4(n) {
  if (!Number.isFinite(n)) return n
  return Math.round(n * 10000) / 10000
}

function approxEqual(a, b, tolAbs = TOL_ABS, tolRel = TOL_REL) {
  if (a === b) return true
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b
  const diff = Math.abs(a - b)
  if (diff <= tolAbs) return true
  const rel = diff / Math.max(Math.abs(a), Math.abs(b), 1)
  return rel <= tolRel
}

function calcMaxDrawdown(equityCurve) {
  if (!equityCurve || equityCurve.length === 0) return 0
  let peak = equityCurve[0].value
  let maxDD = 0
  for (const p of equityCurve) {
    if (p.value > peak) peak = p.value
    const dd = ((peak - p.value) / peak) * 100
    if (dd > maxDD) maxDD = dd
  }
  return maxDD
}

function calcSharpeRatio(equityCurve) {
  if (!equityCurve || equityCurve.length < 2) return 0
  const daily = []
  for (let i = 1; i < equityCurve.length; i++) {
    if (equityCurve[i - 1].value <= 0) continue
    daily.push((equityCurve[i].value - equityCurve[i - 1].value) / equityCurve[i - 1].value)
  }
  if (daily.length === 0) return 0
  const avg = daily.reduce((s, r) => s + r, 0) / daily.length
  const variance = daily.reduce((s, r) => s + (r - avg) ** 2, 0) / daily.length
  const std = Math.sqrt(variance)
  if (std === 0) return 0
  const dailyRf = 0.035 / 252
  return ((avg - dailyRf) / std) * Math.sqrt(252)
}

function verifyRun(run) {
  const issues = []
  const market = run.market
  const rates = COMMISSION_RATES[market] || COMMISSION_RATES.KR
  const trades = Array.isArray(run.trades) ? run.trades : []
  const equity = Array.isArray(run.equity_curve) ? run.equity_curve : []
  const metrics = run.full_metrics || {}
  const initial = Number(run.initial_capital)
  const finalEquity = equity.length > 0 ? Number(equity[equity.length - 1].value) : initial

  // A) trade.pnl 수식 정합성
  let badPnlCount = 0
  let firstBadPnl = null
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    const ep = Number(t.entryPrice)
    const xp = Number(t.exitPrice)
    const q = Number(t.quantity)
    const sellAmount = xp * q
    const sellFee = sellAmount * (rates.sellCommission + rates.sellTax)
    const buyFee = ep * q * rates.buyCommission
    const expectedPnl = (xp - ep) * q - sellFee - buyFee
    if (!approxEqual(Number(t.pnl), expectedPnl, 0.5, 0.001)) {
      badPnlCount++
      if (firstBadPnl === null) firstBadPnl = { i, stored: t.pnl, expected: expectedPnl, diff: t.pnl - expectedPnl }
    }
  }
  if (badPnlCount > 0) {
    issues.push({
      check: 'A_pnl_formula',
      detail: `${badPnlCount}/${trades.length} trades pnl 공식 불일치. 첫 케이스 idx ${firstBadPnl.i}: 저장=${firstBadPnl.stored.toFixed(2)}, 수식=${firstBadPnl.expected.toFixed(2)}, 차이=${firstBadPnl.diff.toFixed(2)}`,
    })
  }

  // B) sum(trades.pnl) + initial ≈ final_equity
  const sumPnl = trades.reduce((s, t) => s + Number(t.pnl), 0)
  const expectedFinal = initial + sumPnl
  if (!approxEqual(finalEquity, expectedFinal, Math.max(10, trades.length), 0.001)) {
    issues.push({
      check: 'B_equity_pnl_sum',
      detail: `final_equity=${finalEquity}, initial+sum(pnl)=${expectedFinal.toFixed(0)}, 차이=${(finalEquity - expectedFinal).toFixed(0)}`,
    })
  }

  // C) total_return 정합성
  const expectedTotalReturn = initial > 0 ? round4(((finalEquity - initial) / initial) * 100) : 0
  const storedTotalReturn = Number(metrics.totalReturn ?? run.total_return)
  if (!approxEqual(storedTotalReturn, expectedTotalReturn, 0.01, 0.0001)) {
    issues.push({
      check: 'C_total_return',
      detail: `저장 total_return=${storedTotalReturn}%, 수식=${expectedTotalReturn}%`,
    })
  }

  // D) annualizedReturn (CAGR) 정합성
  const tradingDays = equity.length
  const years = tradingDays / 252
  const expectedAnnualized = years > 0 && initial > 0
    ? round4((Math.pow(finalEquity / initial, 1 / years) - 1) * 100)
    : 0
  const storedAnnualized = Number(metrics.annualizedReturn ?? run.annualized_return)
  if (Number.isFinite(storedAnnualized) && !approxEqual(storedAnnualized, expectedAnnualized, 0.05, 0.001)) {
    issues.push({
      check: 'D_annualized_return',
      detail: `저장 annualizedReturn=${storedAnnualized}%, 수식(CAGR)=${expectedAnnualized}% (${tradingDays}일 / ${years.toFixed(2)}년)`,
    })
  }

  // E) maxDrawdown 정합성 — equity_curve 가 있어야 검증 가능
  if (equity.length > 0) {
    const expectedMDD = round4(calcMaxDrawdown(equity))
    const storedMDD = Number(metrics.maxDrawdown ?? run.max_drawdown)
    if (Number.isFinite(storedMDD) && !approxEqual(storedMDD, expectedMDD, 0.01, 0.001)) {
      issues.push({
        check: 'E_max_drawdown',
        detail: `저장 maxDrawdown=${storedMDD}%, 수식 재계산=${expectedMDD}%`,
      })
    }
  }

  // F) winRate 정합성
  if (trades.length > 0) {
    const wins = trades.filter(t => Number(t.pnl) > 0).length
    const expectedWinRate = round4((wins / trades.length) * 100)
    const storedWinRate = Number(metrics.winRate ?? run.win_rate)
    if (Number.isFinite(storedWinRate) && !approxEqual(storedWinRate, expectedWinRate, 0.01, 0.001)) {
      issues.push({
        check: 'F_win_rate',
        detail: `저장 winRate=${storedWinRate}%, 수식=${expectedWinRate}% (wins ${wins}/${trades.length})`,
      })
    }
  }

  // G) profitFactor 정합성
  if (trades.length > 0) {
    const wins = trades.filter(t => Number(t.pnl) > 0)
    const losses = trades.filter(t => Number(t.pnl) < 0)
    const grossProfit = wins.reduce((s, t) => s + Number(t.pnl), 0)
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.pnl), 0))
    const expectedPF = grossLoss > 0
      ? round4(grossProfit / grossLoss)
      : grossProfit > 0 ? Infinity : 0
    const storedPF = Number(metrics.profitFactor ?? run.profit_factor)
    if (Number.isFinite(storedPF) && Number.isFinite(expectedPF) && !approxEqual(storedPF, expectedPF, 0.01, 0.005)) {
      issues.push({
        check: 'G_profit_factor',
        detail: `저장 profitFactor=${storedPF}, 수식=${expectedPF} (gross+${grossProfit.toFixed(0)} / -${grossLoss.toFixed(0)})`,
      })
    }
  }

  // H) sharpeRatio 정합성 (equity_curve 있어야 검증)
  if (equity.length >= 2) {
    const expectedSharpe = round4(calcSharpeRatio(equity))
    const storedSharpe = Number(metrics.sharpeRatio ?? run.sharpe_ratio)
    if (Number.isFinite(storedSharpe) && Number.isFinite(expectedSharpe) && !approxEqual(storedSharpe, expectedSharpe, 0.01, 0.01)) {
      issues.push({
        check: 'H_sharpe_ratio',
        detail: `저장 sharpeRatio=${storedSharpe}, 수식 재계산=${expectedSharpe}`,
      })
    }
  }

  return { runId: run.id, presetName: run.preset_name, strategyName: run.strategy_name, ticker: run.ticker, issues }
}

async function main() {
  const { data: runs, error } = await supabase
    .from('backtest_runs')
    .select('id, ticker, market, start_date, end_date, initial_capital, status, total_return, annualized_return, max_drawdown, sharpe_ratio, win_rate, profit_factor, total_trades, equity_curve, trades, full_metrics, preset_id, preset_name, strategy_id')
    .eq('user_id', TARGET_USER_ID)
    .in('ticker', TARGET_TICKERS)
    .eq('status', 'completed')
    .order('executed_at', { ascending: false })

  if (error) throw error
  const filtered = (runs || []).filter(r => {
    const days = (new Date(r.end_date) - new Date(r.start_date)) / 86400000
    return days >= MIN_DAYS
  })

  console.log(`Total target runs: ${filtered.length}`)

  const allResults = filtered.map(verifyRun)
  const clean = allResults.filter(r => r.issues.length === 0)
  const flagged = allResults.filter(r => r.issues.length > 0)

  // 체크별 집계
  const byCheck = {}
  for (const r of flagged) {
    for (const issue of r.issues) {
      byCheck[issue.check] = (byCheck[issue.check] || 0) + 1
    }
  }

  // 리포트 작성
  const lines = []
  lines.push('## Backtest Metrics Verification Report — 2026-05-15')
  lines.push('')
  lines.push('### Summary')
  lines.push(`- Total runs checked: ${filtered.length}`)
  lines.push(`- ✅ Clean (모든 수식 정합): ${clean.length}`)
  lines.push(`- ⚠️ Flagged (1개 이상 수식 차이): ${flagged.length}`)
  lines.push('')
  lines.push('### Checks performed')
  lines.push('- A) trade.pnl == (exit-entry)×qty - sellFee - buyFee')
  lines.push('- B) sum(trades.pnl) + initial ≈ final_equity')
  lines.push('- C) total_return == ((final-initial)/initial) × 100')
  lines.push('- D) annualizedReturn (CAGR) == (final/initial)^(1/years) - 1')
  lines.push('- E) maxDrawdown peak-to-trough 재계산')
  lines.push('- F) winRate == wins/total × 100')
  lines.push('- G) profitFactor == grossProfit / grossLoss')
  lines.push('- H) sharpeRatio (일별 수익률 기반) 재계산')
  lines.push('')
  lines.push('### Issue counts by check')
  if (Object.keys(byCheck).length === 0) {
    lines.push('- (아무 이슈 없음)')
  } else {
    for (const [k, v] of Object.entries(byCheck).sort((a, b) => b[1] - a[1])) {
      lines.push(`- ${k}: ${v}건`)
    }
  }
  lines.push('')

  if (flagged.length > 0) {
    lines.push('### ⚠️ Flagged runs (상세)')
    for (const r of flagged) {
      lines.push(`- Run ID: ${r.runId}, ${r.presetName || r.strategyName || '(unknown)'} (${r.ticker})`)
      for (const issue of r.issues) {
        lines.push(`  - [${issue.check}] ${issue.detail}`)
      }
    }
    lines.push('')
  }

  lines.push('### ✅ Clean runs')
  for (const r of clean) {
    lines.push(`- [${r.runId}] ${r.presetName || r.strategyName || '(unknown)'} (${r.ticker})`)
  }

  await fs.writeFile(REPORT_PATH, lines.join('\n'), 'utf-8')
  console.log(`Report written to ${REPORT_PATH}`)
  console.log(`Clean: ${clean.length}, Flagged: ${flagged.length}`)
}

main().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
