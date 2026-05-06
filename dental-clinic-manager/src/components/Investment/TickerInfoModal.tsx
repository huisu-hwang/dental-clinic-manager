'use client'

/**
 * 종목 상세 모달 — 펀더멘털 + 시총 순위 + 가격 차트 + 즐겨찾기 토글.
 * 호출자: ScreenerContent (행 클릭), 추후 다른 페이지에서도 재사용 가능.
 */

import { useEffect, useState } from 'react'
import { Star, X, BarChart3, ExternalLink, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { useFavorites } from '@/hooks/useFavorites'
import type { Market } from '@/types/investment'

type Range = '1mo' | '3mo' | '1y'

interface ApiResponse {
  ticker: string
  market: Market
  name: string
  price: {
    current: number | null
    change: number | null
    changePercent: number | null
    volume: number | null
    currency: string
  }
  range52w: { high: number | null; low: number | null }
  marketCap: number | null
  marketCapRank: number | null
  fundamentals: {
    per: number | null
    pbr: number | null
    roe: number | null
    eps: number | null
    dividendYield: number | null
    revenue: number | null
    operatingIncome: number | null
    netIncome: number | null
    operatingMargin: number | null
    profitMargin: number | null
    debtToEquity: number | null
  }
  chart: { range: Range; points: Array<{ date: string; close: number }> }
  asOf: string
}

interface Props {
  ticker: string
  market: Market
  tickerName?: string
  onClose: () => void
  onAnalyze?: (ticker: string, market: Market) => void
  extra?: React.ReactNode
}

export default function TickerInfoModal({ ticker, market, tickerName, onClose, onAnalyze, extra }: Props) {
  const [range, setRange] = useState<Range>('1mo')
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isFavorite, add, remove } = useFavorites()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const url = `/api/investment/ticker-info?ticker=${encodeURIComponent(ticker)}&market=${market}&range=${range}`
    fetch(url)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}))
          throw new Error(j?.error ?? `HTTP ${r.status}`)
        }
        return r.json() as Promise<ApiResponse>
      })
      .then((d) => { if (!cancelled) setData(d) })
      .catch((e: unknown) => {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : '오류'
          setError(msg)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [ticker, market, range])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const fav = isFavorite(ticker, market)
  const displayName = data?.name ?? tickerName ?? ticker

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl bg-at-surface rounded-2xl shadow-2xl border border-at-border my-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-at-border">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono font-bold text-at-text">{ticker}</span>
            <span className="text-at-text-secondary truncate">{displayName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {market === 'KR' ? '국내' : '미국'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fav ? remove(ticker, market) : add(ticker, market, displayName)}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border ${fav ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-at-border text-at-text-secondary hover:text-amber-600'}`}
              title={fav ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'}
            >
              <Star className={`w-3.5 h-3.5 ${fav ? 'fill-amber-400 text-amber-500' : ''}`} />
              {fav ? '즐겨찾기됨' : '즐겨찾기'}
            </button>
            <button onClick={onClose} className="text-at-text-weak hover:text-at-text">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-at-text-secondary text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              종목 정보를 불러오는 중...
            </div>
          )}
          {error && !loading && (
            <div className="text-rose-600 text-sm bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {data && !loading && (
            <>
              <PriceCard data={data} />
              <FundamentalGrid data={data} />
              <ChartBlock data={data} range={range} setRange={setRange} />
            </>
          )}

          {extra}
        </div>

        <div className="px-5 py-3 border-t border-at-border flex items-center justify-end gap-2">
          {onAnalyze && (
            <button
              type="button"
              onClick={() => onAnalyze(ticker, market)}
              className="text-xs px-3 py-1.5 rounded border border-at-border text-at-text hover:bg-at-surface-alt inline-flex items-center gap-1"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              스마트머니 분석
            </button>
          )}
          <a
            href={market === 'KR'
              ? `https://finance.yahoo.com/quote/${ticker}.KS`
              : `https://finance.yahoo.com/quote/${ticker}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded border border-at-border text-at-text-secondary hover:bg-at-surface-alt inline-flex items-center gap-1"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            yahoo
          </a>
          <button
            type="button"
            onClick={onClose}
            className="text-xs px-3 py-1.5 rounded bg-at-accent text-white hover:opacity-90"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

function PriceCard({ data }: { data: ApiResponse }) {
  const c = data.price.current
  const chg = data.price.change ?? 0
  const chgPct = data.price.changePercent ?? 0
  const positive = chg >= 0
  const color = positive ? 'text-rose-600' : 'text-blue-600'
  return (
    <div className="bg-at-surface-alt/40 rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <p className="text-[11px] text-at-text-weak">현재가</p>
        <p className="text-2xl font-bold text-at-text font-mono">
          {c == null ? '—' : data.market === 'KR'
            ? `${Math.round(c).toLocaleString()}원`
            : `$${c.toFixed(2)}`}
        </p>
        <p className={`text-xs ${color} font-mono`}>
          {chg == null ? '' : `${positive ? '+' : ''}${chg.toFixed(2)} (${positive ? '+' : ''}${(chgPct).toFixed(2)}%)`}
        </p>
      </div>
      <div className="text-xs space-y-1">
        <Row k="52주 최고" v={fmtPrice(data.range52w.high, data.market)} />
        <Row k="52주 최저" v={fmtPrice(data.range52w.low, data.market)} />
        <Row k="거래량" v={data.price.volume == null ? '—' : data.price.volume.toLocaleString()} />
      </div>
      <div className="text-xs space-y-1">
        <Row k="시가총액" v={fmtMarketCap(data.marketCap, data.market)} />
        <Row k="시총 순위" v={data.marketCapRank == null ? '—' : `${data.market === 'KR' ? 'KR' : 'US'} #${data.marketCapRank}`} />
      </div>
    </div>
  )
}

// 지표 의미 — 호버 툴팁
const INDICATOR_HINTS: Record<string, string> = {
  PER: '주가수익비율 (Price-to-Earnings) — 주가가 EPS의 몇 배인지. 낮을수록 저평가, 업종별 평균과 비교.',
  PBR: '주가순자산비율 (Price-to-Book) — 주가가 순자산의 몇 배인지. 1 미만이면 청산가치보다 싼 상태.',
  ROE: '자기자본이익률 (Return on Equity) — 주주 자본 대비 1년간 번 순이익 비율. 15% 이상이면 우수.',
  영업이익률: '영업이익 ÷ 매출 — 본업 수익성. 산업 평균 대비로 비교.',
  순이익률: '순이익 ÷ 매출 — 모든 비용·세금 차감 후 최종 마진.',
  EPS: '주당순이익 (Earnings Per Share) — 1주당 순이익. 추세 상승 = 이익 성장.',
  배당수익률: '주당 배당금 ÷ 주가 — 배당 투자 수익률. 한국 평균 ~2%.',
  부채비율: '부채 ÷ 자기자본 (Debt-to-Equity, %로 표기되기도). 200% 이상이면 부채 위험.',
  매출: '연간 매출액 (Revenue) — 회사 외형 규모.',
  영업이익: '매출에서 매출원가·판관비를 뺀 본업 이익. 매출 × 영업이익률로 추정될 수 있음.',
  순이익: '모든 비용·이자·세금 차감 후 남은 최종 이익.',
  기준일: '데이터 기준 시각 (yahoo 응답 시각).',
}

function FundamentalGrid({ data }: { data: ApiResponse }) {
  const f = data.fundamentals
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <Cell k="PER" v={fmtNum(f.per, 1)} />
      <Cell k="PBR" v={fmtNum(f.pbr, 2)} />
      <Cell k="ROE" v={fmtPct(f.roe, 1)} />
      <Cell k="영업이익률" v={fmtPct(f.operatingMargin, 1)} />
      <Cell k="순이익률" v={fmtPct(f.profitMargin, 1)} />
      <Cell k="EPS" v={fmtNum(f.eps, 2)} />
      <Cell k="배당수익률" v={fmtPct(f.dividendYield, 2)} />
      <Cell k="부채비율" v={fmtNum(f.debtToEquity, 2)} />
      <Cell k="매출" v={fmtBigMoney(f.revenue, data.market)} />
      <Cell k="영업이익" v={fmtBigMoney(f.operatingIncome, data.market)} />
      <Cell k="순이익" v={fmtBigMoney(f.netIncome, data.market)} />
      <Cell k="기준일" v={data.asOf.slice(0, 10)} />
    </div>
  )
}

function ChartBlock({ data, range, setRange }: { data: ApiResponse; range: Range; setRange: (r: Range) => void }) {
  const points = data.chart.points
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-at-text">최근 주가 흐름</p>
        <div className="inline-flex rounded border border-at-border overflow-hidden text-[11px]">
          {(['1mo', '3mo', '1y'] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 ${range === r ? 'bg-at-accent text-white' : 'bg-white text-at-text-secondary hover:bg-at-surface-alt'}`}
            >
              {r === '1mo' ? '1개월' : r === '3mo' ? '3개월' : '1년'}
            </button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <div className="text-xs text-at-text-weak bg-at-surface-alt/40 rounded-lg px-3 py-6 text-center">
          차트 데이터가 없습니다.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points}>
              <XAxis dataKey="date" hide />
              <YAxis domain={['dataMin', 'dataMax']} hide />
              <Tooltip
                formatter={(v: unknown) => [
                  data.market === 'KR'
                    ? `${Math.round(v as number).toLocaleString()}원`
                    : `$${(v as number).toFixed(2)}`,
                  '종가',
                ]}
                labelFormatter={(l: unknown) => String(l)}
              />
              <Line type="monotone" dataKey="close" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2"><span className="text-at-text-weak">{k}</span><span className="font-mono">{v}</span></div>
  )
}
function Cell({ k, v }: { k: string; v: string }) {
  const hint = INDICATOR_HINTS[k]
  return (
    <div
      className={`bg-white border border-at-border rounded px-2 py-1.5 ${hint ? 'cursor-help' : ''}`}
      title={hint}
    >
      <p className="text-[10px] text-at-text-weak inline-flex items-center gap-1">
        {k}
        {hint && <span className="text-at-text-weak/60 text-[9px]">ⓘ</span>}
      </p>
      <p className="text-sm font-semibold font-mono text-at-text">{v}</p>
    </div>
  )
}
function fmtNum(v: number | null, digits = 2): string {
  if (v == null) return '—'
  return v.toFixed(digits)
}
function fmtPct(v: number | null, digits = 2): string {
  if (v == null) return '—'
  return `${(v * 100).toFixed(digits)}%`
}
function fmtPrice(v: number | null, market: Market): string {
  if (v == null) return '—'
  return market === 'KR' ? `${Math.round(v).toLocaleString()}원` : `$${v.toFixed(2)}`
}
function fmtMarketCap(v: number | null, market: Market): string {
  if (v == null) return '—'
  if (market === 'KR') {
    if (v >= 1e12) return `${(v / 1e12).toFixed(2)}조원`
    if (v >= 1e8) return `${(v / 1e8).toFixed(0)}억원`
    return v.toLocaleString()
  }
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  return `$${v.toLocaleString()}`
}
function fmtBigMoney(v: number | null, market: Market): string {
  return fmtMarketCap(v, market)
}
