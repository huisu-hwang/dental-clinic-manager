'use client'

/**
 * SmartMoneyContent — 스마트머니 분석 메인 컴포넌트
 *
 * - 종목 검색 (TickerSearch, 시장 자동)
 * - 분석 실행 → POST /api/investment/smart-money/analyze (includeLLM=true)
 * - 결과: 헤더(종목명/현재가/종합점수/해석), LLM 코멘트, SignalPanel(4개), 시그널 디테일 상위 5개
 * - 알림 받기 → AlertSettingsModal
 * - 우측: AlertList (구독 중인 알림 목록)
 *
 * 결과 캐시: 같은 ticker+오늘 날짜는 메모리 보존
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Brain,
  Loader2,
  AlertCircle,
  BellRing,
  TrendingUp,
  TrendingDown,
  Activity,
  Sparkles,
  Link2,
  RefreshCw,
  Radio,
} from 'lucide-react'
import TickerSearch from '@/components/Investment/TickerSearch'
import RecentTickersButtons from '@/components/Investment/RecentTickersButtons'
import FavoritesButtons from '@/components/Investment/FavoritesButtons'
import { useRecentTickers } from '@/hooks/useRecentTickers'
import { SignalPanel } from './SignalPanel'
import { AlertSettingsModal } from './AlertSettingsModal'
import { AlertList } from './AlertList'
import type { Market } from '@/types/investment'
import type {
  Interpretation,
  SignalType,
  SmartMoneyAnalysis,
} from '@/types/smartMoney'

interface Selected {
  ticker: string
  market: Market
  name: string
}

const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  spring: 'Spring',
  upthrust: 'Upthrust',
  absorption: 'Absorption',
  'twap-distribution': 'TWAP 분배',
  'twap-accumulation': 'TWAP 매집',
  'vwap-distribution': 'VWAP 분배',
  'vwap-accumulation': 'VWAP 매집',
  'iceberg-buy': 'Iceberg 매수',
  'iceberg-sell': 'Iceberg 매도',
  'sniper-buy': 'Sniper 매수',
  'sniper-sell': 'Sniper 매도',
  'moo-accumulation': 'MOO 매집',
  'moo-distribution': 'MOO 분배',
  'moc-accumulation': 'MOC 매집',
  'moc-distribution': 'MOC 분배',
  'foreigner-accumulation': '외국인 매집',
  'foreigner-distribution': '외국인 분배',
  'institution-accumulation': '기관 매집',
  'institution-distribution': '기관 분배',
  // 정교화 시그널
  'liquidity-sweep-bullish': '강세 유동성 사냥',
  'liquidity-sweep-bearish': '약세 유동성 사냥',
  'choch-bullish': 'CHoCH 강세 전환',
  'choch-bearish': 'CHoCH 약세 전환',
  'bos-bullish': 'BOS 강세 지속',
  'bos-bearish': 'BOS 약세 지속',
  'order-block-bullish': '강세 오더블록',
  'order-block-bearish': '약세 오더블록',
  'fvg-bullish': '강세 FVG',
  'fvg-bearish': '약세 FVG',
  'bull-trap': '불 트랩',
  'bear-trap': '베어 트랩',
  'no-demand': '수요 부재',
  'no-supply': '공급 부재',
  'buying-climax': '매수 클라이맥스',
  'selling-climax': '매도 클라이맥스',
  'stopping-volume': '멈춤 거래량',
  'judas-swing': 'Judas Swing',
  'po3-accumulation': 'PO3 매집',
  'po3-distribution': 'PO3 분배',
  'news-fade': '뉴스 페이드',
  'sell-the-news': 'Sell-the-News',
  'bad-news-accumulation': '악재 매집',
  'wyckoff-phase-c': '와이코프 Phase C',
  'wyckoff-sos': '강세 신호 (SOS)',
  'wyckoff-lps': '마지막 지지점 (LPS)',
  'wyckoff-utad': 'UTAD',
  'wyckoff-sow': '약세 신호 (SOW)',
  'wyckoff-lpsy': '마지막 공급점 (LPSY)',
}

const INTERPRETATION_LABEL: Record<Interpretation, string> = {
  'strong-accumulation': '강한 매집',
  'mild-accumulation': '약한 매집',
  neutral: '중립',
  'mild-distribution': '약한 분배',
  'strong-distribution': '강한 분배',
}

const INTERPRETATION_COLOR: Record<Interpretation, string> = {
  'strong-accumulation': 'bg-emerald-500 text-white',
  'mild-accumulation': 'bg-emerald-100 text-emerald-700',
  neutral: 'bg-slate-100 text-slate-700',
  'mild-distribution': 'bg-rose-100 text-rose-700',
  'strong-distribution': 'bg-rose-500 text-white',
}

/** KST 기준 'YYYY-MM-DD' — Vercel UTC 또는 사용자 로컬 timezone에 영향 받지 않음 */
function todayKey() {
  const kst = new Date(Date.now() + 9 * 3600_000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(kst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 시장 timezone 기준 'YYYY-MM-DD' — '오늘' 라벨 기준일 */
function marketTodayKey(market: Market): string {
  const tz = market === 'US' ? 'America/New_York' : 'Asia/Seoul'
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    })
    return fmt.format(new Date())
  } catch {
    return todayKey()
  }
}

/** YYYY-MM-DD 또는 'YYYY-MM-DD (Pre)' → "MM/DD (요일)" — pre-market suffix는 분리 표기 */
function formatDayLabel(date: string): string {
  const isPre = / \(Pre\)$/.test(date)
  const dateOnly = date.replace(/ \(Pre\)$/, '')
  const [y, m, d] = dateOnly.split('-').map(Number)
  if (!y || !m || !d) return date
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = dt.getUTCDay()
  const dayLabel = ['일', '월', '화', '수', '목', '금', '토'][day]
  return `${m}/${d} (${dayLabel})${isPre ? ' Pre' : ''}`
}

/** YYYY-MM-DD 날짜 차이 (a - b, 일 단위) */
function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  if (!ay || !am || !ad || !by || !bm || !bd) return 0
  const ta = Date.UTC(ay, am - 1, ad)
  const tb = Date.UTC(by, bm - 1, bd)
  return Math.round((ta - tb) / 86400_000)
}

/** "오늘" / "어제" / "Pre-Market" 라벨 — 시장 timezone의 실제 오늘 기준으로 비교 */
function formatDayRelative(date: string, market: Market): string {
  if (/ \(Pre\)$/.test(date)) return 'Pre-Market'
  const today = marketTodayKey(market)
  const diff = dayDiff(today, date)
  if (diff === 0) return '오늘'
  if (diff === 1) return '전 거래일'
  if (diff === 2) return '2일 전'
  if (diff > 0) return `${diff}일 전`
  return ''
}

function findDefaultDayIndex(byDay: NonNullable<SmartMoneyAnalysis['byDay']>, asOfDate: string): number {
  const matchedIdx = byDay.findIndex((day) => day.asOfDate === asOfDate)
  return matchedIdx >= 0 ? matchedIdx : Math.max(0, byDay.length - 1)
}

/** 시장 timezone 기준 현재 분(0~1439). 실패 시 null */
function marketMinutesNow(market: Market): number | null {
  const tz = market === 'US' ? 'America/New_York' : 'Asia/Seoul'
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
    const hh = parseInt(parts.find((p) => p.type === 'hour')?.value ?? '00', 10)
    const mm = parseInt(parts.find((p) => p.type === 'minute')?.value ?? '00', 10)
    return hh * 60 + mm
  } catch {
    return null
  }
}

type SessionState = 'live' | 'pre' | 'closed'

/** 시장의 현재 세션 상태 — 'live'(정규장 진행 중), 'pre'(미국 프리마켓 진행 중), 'closed' */
function marketSessionState(market: Market, includePreMarket: boolean): SessionState {
  const m = marketMinutesNow(market)
  if (m === null) return 'closed'
  if (market === 'KR') {
    return m >= 9 * 60 && m < 15 * 60 + 30 ? 'live' : 'closed'
  }
  // US
  if (m >= 9 * 60 + 30 && m < 16 * 60) return 'live'
  if (includePreMarket && m >= 4 * 60 && m < 9 * 60 + 30) return 'pre'
  return 'closed'
}

const SESSION_BADGE: Record<SessionState, { label: string; cls: string }> = {
  live: { label: '장중', cls: 'bg-emerald-100 text-emerald-700' },
  pre: { label: 'Pre-Market', cls: 'bg-amber-100 text-amber-700' },
  closed: { label: '장외', cls: 'bg-slate-100 text-slate-600' },
}

/** 자동 갱신 폴링 간격 (초). KIS 분당 60req 한도 고려해 60초 (분봉 페이지네이션 ~43req). */
const REFRESH_INTERVAL_SEC = 60

export function SmartMoneyContent() {
  const [selected, setSelected] = useState<Selected | null>(null)
  const [analysis, setAnalysis] = useState<SmartMoneyAnalysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [llmLoading, setLlmLoading] = useState(false)
  const [includePreMarket, setIncludePreMarket] = useState(false)
  // 실시간 자동 갱신 — 장중/Pre-Market에서만 동작, 60초 간격
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  // 알림 모달
  const [alertModalOpen, setAlertModalOpen] = useState(false)
  const [editingAlert, setEditingAlert] = useState<{ ticker: string; market: Market; name: string | null } | null>(null)
  const [alertListRefresh, setAlertListRefresh] = useState(0)

  // 일자별 탭 — null이면 가장 최근 일자(byDay 마지막) 또는 메인 분석
  const [activeDayIdx, setActiveDayIdx] = useState<number | null>(null)

  // 메모리 캐시 (ticker:market:date → analysis)
  const cacheRef = useRef<Map<string, SmartMoneyAnalysis>>(new Map())

  const cacheKey = (s: Selected) => `${s.market}:${s.ticker}:${todayKey()}`

  const { add: rememberTicker } = useRecentTickers()

  const handleSelectTicker = useCallback((ticker: string, name?: string, market?: Market) => {
    if (!market) return
    const next: Selected = { ticker, market, name: name || ticker }
    setSelected(next)
    setError(null)
    setErrorCode(null)
    setActiveDayIdx(null)
    rememberTicker(ticker, name || ticker, market)
    // 캐시에 있으면 즉시 표시
    const cached = cacheRef.current.get(`${next.market}:${next.ticker}:${todayKey()}`)
    if (cached) setAnalysis(cached)
    else setAnalysis(null)
  }, [rememberTicker])

  const runAnalyze = useCallback(async () => {
    if (!selected) return
    setLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const res = await fetch('/api/investment/smart-money/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ticker: selected.ticker,
          market: selected.market,
          includeLLM: true,
          includePreMarket: includePreMarket && selected.market === 'US',
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json?.error || '분석 요청에 실패했습니다.')
        setErrorCode(typeof json?.code === 'string' ? json.code : null)
        setAnalysis(null)
        return
      }
      const data: SmartMoneyAnalysis | undefined = json?.data
      if (!data) {
        setError('분석 결과를 받지 못했습니다.')
        return
      }
      setAnalysis(data)
      setActiveDayIdx(null) // 가장 최근 일자 default
      cacheRef.current.set(cacheKey(selected), data)

      // LLM 코멘트가 비어 있으면 별도 호출
      if (!data.naturalLanguageComment) {
        fetchLlmComment(data)
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.')
      setAnalysis(null)
    } finally {
      setLoading(false)
    }
  }, [selected, includePreMarket])

  /** 백그라운드 재분석 — 자동 갱신 시 사용. LLM 스킵, 큰 로딩 UI 없이 조용히 갱신.
   *  실패는 silent (기존 분석 유지). 기존 LLM 코멘트는 보존. */
  const runAnalyzeBackground = useCallback(async () => {
    if (!selected) return
    setRefreshing(true)
    try {
      const res = await fetch('/api/investment/smart-money/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ticker: selected.ticker,
          market: selected.market,
          includeLLM: false,
          includePreMarket: includePreMarket && selected.market === 'US',
        }),
      })
      if (!res.ok) return
      const json = await res.json().catch(() => null)
      const data: SmartMoneyAnalysis | undefined = json?.data
      if (!data) return
      setAnalysis(prev => {
        if (!prev || prev.ticker !== data.ticker || prev.market !== data.market) return data
        // LLM 코멘트 보존 — 폴링은 includeLLM=false라서 새로 안 옴
        return {
          ...data,
          naturalLanguageComment: prev.naturalLanguageComment ?? data.naturalLanguageComment,
          perCardComments: prev.perCardComments ?? data.perCardComments,
          // byDay 각 일자의 LLM 코멘트도 보존
          byDay: data.byDay?.map(d => {
            const prevDay = prev.byDay?.find(p => p.asOfDate === d.asOfDate)
            return prevDay?.naturalLanguageComment
              ? { ...d, naturalLanguageComment: prevDay.naturalLanguageComment }
              : d
          }),
        }
      })
      cacheRef.current.set(cacheKey(selected), data)
    } catch {
      /* silent — 폴링 실패는 사용자 차단 안 함 */
    } finally {
      setRefreshing(false)
    }
  }, [selected, includePreMarket])

  const fetchLlmComment = useCallback(async (base: SmartMoneyAnalysis) => {
    setLlmLoading(true)
    try {
      const res = await fetch('/api/investment/smart-money/llm-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: base }),
      })
      const json = await res.json().catch(() => ({}))
      const comment: string | undefined = json?.data?.comment
      const perCard = json?.data?.perCard as SmartMoneyAnalysis['perCardComments']
      if (comment) {
        const updated: SmartMoneyAnalysis = { ...base, naturalLanguageComment: comment, perCardComments: perCard }
        setAnalysis(prev => (prev && prev.ticker === base.ticker ? updated : prev))
        if (selected) cacheRef.current.set(cacheKey(selected), updated)
      }
    } catch {
      /* ignore */
    } finally {
      setLlmLoading(false)
    }
  }, [selected])

  // 활성 일자 분석 객체 — byDay에서 선택된 일자가 있으면 그 항목으로 SmartMoneyAnalysis를 합성.
  // 일자별 탭이 클릭됐을 때 표시 데이터(점수/시그널/패널/LLM)가 모두 그 일자 기준으로 전환됨.
  const viewAnalysis = useMemo<SmartMoneyAnalysis | null>(() => {
    if (!analysis) return null
    const byDay = analysis.byDay ?? []
    if (byDay.length === 0) return analysis
    const defaultIdx = findDefaultDayIndex(byDay, analysis.asOfDate)
    const idx = activeDayIdx ?? defaultIdx
    const day = byDay[Math.max(0, Math.min(byDay.length - 1, idx))]
    if (!day) return analysis
    if (day.asOfDate === analysis.asOfDate) return analysis
    return {
      ...analysis,
      asOfDate: day.asOfDate,
      currentPrice: day.closePrice,
      vwap: day.vwap,
      wyckoff: day.wyckoff,
      wyckoffIntraday: day.wyckoffIntraday,
      algoFootprint: day.algoFootprint,
      wyckoffPhase: day.wyckoffPhase,
      liquidity: day.liquidity,
      marketStructure: day.marketStructure,
      orderBlocksFvg: day.orderBlocksFvg,
      traps: day.traps,
      vsa: day.vsa,
      session: day.session,
      newsContext: day.newsContext,
      manipulationRiskScore: day.manipulationRiskScore,
      overallScore: day.overallScore,
      interpretation: day.interpretation,
      signalDetails: day.signalDetails,
      naturalLanguageComment: day.naturalLanguageComment,
      // byDay 항목은 카드별 코멘트를 갖지 않음(메인 분석 일자만 보유)
      perCardComments: day.asOfDate === analysis.asOfDate ? analysis.perCardComments : undefined,
    }
  }, [analysis, activeDayIdx])

  const topSignals = useMemo(() => {
    if (!viewAnalysis) return []
    return [...viewAnalysis.signalDetails]
      .sort((a, b) => {
        const at = a.triggeredAt ? new Date(a.triggeredAt).getTime() : 0
        const bt = b.triggeredAt ? new Date(b.triggeredAt).getTime() : 0
        return bt - at || b.confidence - a.confidence
      })
      .slice(0, 5)
  }, [viewAnalysis])

  const overallScore = viewAnalysis?.overallScore ?? 0
  const scorePct = Math.max(0, Math.min(100, (overallScore + 100) / 2))
  const scoreColor =
    overallScore > 30 ? 'bg-emerald-500' : overallScore < -30 ? 'bg-rose-500' : 'bg-slate-400'

  const isKisError = errorCode === 'NO_CREDENTIAL' || (error || '').toLowerCase().includes('kis')

  // sessionState — secondsLeft 변경마다 재계산되지만 string enum이므로 동일 결과면 deps 안 흔들림.
  // analysis.generatedAt 변경 시(폴링 시) + secondsLeft 변경 시 자연스럽게 시간대 진행 반영.
  const sessionState: SessionState | null = analysis
    ? marketSessionState(analysis.market, includePreMarket && analysis.market === 'US')
    : null
  const sessionBadge = sessionState ? SESSION_BADGE[sessionState] : null
  const lastRefreshLabel = analysis ? new Date(analysis.generatedAt).toLocaleTimeString('ko-KR') : ''
  const isMarketActive = sessionState === 'live' || sessionState === 'pre'

  // 자동 폴링 — 장중/Pre-Market에서만 동작.
  // hasAnalysis(boolean)을 deps로 사용 → 폴링이 analysis 객체를 갱신해도 effect가 재시작되지 않아
  // 카운트다운이 매끄럽게 60→0→60 사이클로 진행됨.
  const hasAnalysis = !!analysis
  useEffect(() => {
    if (!autoRefresh || !isMarketActive || !selected || !hasAnalysis) {
      setSecondsLeft(0)
      return
    }
    setSecondsLeft(REFRESH_INTERVAL_SEC)
    const tick = setInterval(() => {
      setSecondsLeft(s => {
        if (s <= 1) {
          runAnalyzeBackground()
          return REFRESH_INTERVAL_SEC
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [autoRefresh, isMarketActive, selected, hasAnalysis, runAnalyzeBackground])

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* 헤더 */}
      <div>
        <div className="flex items-center gap-2">
          <Brain className="w-6 h-6 text-blue-600" />
          <h1 className="text-xl font-bold text-slate-900">스마트머니 분석</h1>
        </div>
        <p className="text-sm text-slate-600 mt-1">
          VWAP, Wyckoff 패턴, 알고리즘 풋프린트, 외국인·기관 수급을 종합해 종목의 매집/분배 의도를 분석합니다.
        </p>
      </div>

      {/* 종목 검색 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <label className="block text-xs font-semibold text-slate-700 mb-2">분석할 종목</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 min-w-0">
            <TickerSearch
              onSelect={handleSelectTicker}
              market="ALL"
              placeholder="국내·미국 종목 통합 검색 (예: 삼성전자, AAPL)"
              clearOnSelect={false}
            />
          </div>
          <button
            type="button"
            onClick={runAnalyze}
            disabled={!selected || loading}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                분석 중...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4" />
                분석 시작
              </>
            )}
          </button>
        </div>
        <div className="mt-2">
          <FavoritesButtons
            market="ALL"
            onSelect={(t, name, m) => handleSelectTicker(t, name, m)}
          />
          <RecentTickersButtons
            market="ALL"
            onSelect={(t, name, m) => handleSelectTicker(t, name, m)}
          />
        </div>
        {/* Pre-Market 옵션 — US 종목 선택 시만 활성 */}
        {selected?.market === 'US' && (
          <label className="mt-2 inline-flex items-center gap-2 text-[12px] text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includePreMarket}
              onChange={(e) => setIncludePreMarket(e.target.checked)}
              disabled={loading}
              className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              <span className="font-semibold">Pre-Market 포함</span>
              <span className="text-[11px] text-slate-500 ml-1">
                (ET 04:00~09:30 봉 + 별도 분석 탭 추가)
              </span>
            </span>
          </label>
        )}
        {selected && !loading && !analysis && !error && (
          <p className="mt-2 text-[11px] text-slate-500">
            선택됨: <span className="font-mono font-semibold text-blue-600">{selected.ticker}</span>{' '}
            <span className="text-slate-700">{selected.name}</span>{' '}
            <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100">
              {selected.market === 'KR' ? '국내' : '미국'}
            </span>
            {' · '}분석 시작 버튼을 누르세요
          </p>
        )}

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
                {isKisError && (
                  <a
                    href="/investment/connect"
                    className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-rose-900 hover:underline"
                  >
                    <Link2 className="w-3 h-3" />
                    KIS 계좌 연결하러 가기
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* KR 종목인데 KIS 미연결로 yahoo 폴백 동작 중일 때 안내 */}
        {analysis?.limitedDataMode && (
          <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">제한 모드 — 일반 시세 데이터 기반 분석</p>
                <p className="text-xs mt-1 leading-relaxed">
                  KIS 계좌 미연결 상태입니다. 한국 종목은 일반 시세(약 15분 지연)로 분봉을 받아 분석하며,
                  호가 10단계와 외국인·기관 매매 동향은 제외됩니다.
                  실시간/심층 분석은{' '}
                  <a href="/investment/connect" className="font-semibold underline">KIS 계좌 연결</a>{' '}
                  후 자동 활성화됩니다.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 분석 결과 */}
      {analysis && viewAnalysis && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* 일자별 탭 (byDay 2개 이상일 때만) */}
            {analysis.byDay && analysis.byDay.length > 1 && (
              <section className="bg-white rounded-2xl border border-slate-200 p-2 shadow-sm">
                <div role="tablist" className="flex gap-1">
                  {analysis.byDay.map((day, i) => {
                    const defaultIdx = findDefaultDayIndex(analysis.byDay!, analysis.asOfDate)
                    const isActive = (activeDayIdx ?? defaultIdx) === i
                    return (
                      <button
                        key={day.asOfDate}
                        role="tab"
                        type="button"
                        onClick={() => setActiveDayIdx(i)}
                        aria-selected={isActive}
                        className={`flex-1 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <span className="block text-[10px] opacity-75">
                          {formatDayRelative(day.asOfDate, analysis.market)}
                        </span>
                        <span>{formatDayLabel(day.asOfDate)}</span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {/* 결과 헤더 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-blue-600">{viewAnalysis.ticker}</span>
                    <span className="text-base font-bold text-slate-900">{viewAnalysis.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                        viewAnalysis.market === 'KR' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}
                    >
                      {viewAnalysis.market === 'KR' ? '국내' : '미국'}
                    </span>
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {viewAnalysis.market === 'KR'
                      ? `${Math.round(viewAnalysis.currentPrice).toLocaleString()}원`
                      : `$${viewAnalysis.currentPrice.toFixed(2)}`}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span>기준 거래일 {viewAnalysis.asOfDate}</span>
                    <span>·</span>
                    <span>마지막 갱신 {lastRefreshLabel}</span>
                    {sessionBadge && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-semibold ${sessionBadge.cls}`}>
                        {sessionBadge.label}
                      </span>
                    )}
                    {autoRefresh && isMarketActive && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-semibold bg-emerald-50 text-emerald-700">
                        <Radio className={`w-3 h-3 ${refreshing ? 'animate-pulse' : ''}`} />
                        실시간
                        {refreshing
                          ? <span className="font-mono">갱신 중</span>
                          : secondsLeft > 0
                            ? <span className="font-mono">{secondsLeft}s</span>
                            : null}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      if (autoRefresh) {
                        setAutoRefresh(false)
                        return
                      }
                      if (!isMarketActive) return
                      setAutoRefresh(true)
                    }}
                    disabled={!isMarketActive && !autoRefresh}
                    title={
                      autoRefresh
                        ? `자동 갱신 켜짐 — ${REFRESH_INTERVAL_SEC}초마다 재분석. 클릭하면 끄기`
                        : isMarketActive
                          ? `${REFRESH_INTERVAL_SEC}초마다 자동으로 최신 데이터로 재분석`
                          : '장외 시간 — 자동 갱신을 사용할 수 없습니다'
                    }
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed ${
                      autoRefresh
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    <Radio className={`w-4 h-4 ${autoRefresh && refreshing ? 'animate-pulse' : ''}`} />
                    {autoRefresh
                      ? refreshing
                        ? '갱신 중'
                        : isMarketActive
                          ? `실시간 ${secondsLeft}s`
                          : '장 마감 대기'
                      : '실시간 자동 갱신'}
                  </button>
                  <button
                    type="button"
                    onClick={runAnalyze}
                    disabled={loading}
                    title={
                      sessionState === 'live'
                        ? '장중 실시간 분석 — 최신 분봉으로 재분석'
                        : sessionState === 'pre'
                        ? 'Pre-Market 진행 중 — 최신 프리마켓 봉으로 재분석'
                        : '장외 시간 — 최신 일봉/마지막 세션으로 재분석'
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RefreshCw className="w-4 h-4" />
                    )}
                    새로고침
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingAlert({
                        ticker: analysis.ticker,
                        market: analysis.market,
                        name: analysis.name,
                      })
                      setAlertModalOpen(true)
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100"
                  >
                    <BellRing className="w-4 h-4" />
                    이 종목 알림 받기
                  </button>
                </div>
              </div>

              {/* 점수 게이지 + 해석 */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-slate-700">종합 점수</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-bold ${
                        overallScore > 0 ? 'text-emerald-600' : overallScore < 0 ? 'text-rose-600' : 'text-slate-600'
                      }`}
                    >
                      {overallScore > 0 ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : overallScore < 0 ? (
                        <TrendingDown className="w-3.5 h-3.5" />
                      ) : null}
                      {overallScore > 0 ? '+' : ''}
                      {overallScore.toFixed(0)}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                        INTERPRETATION_COLOR[viewAnalysis.interpretation]
                      }`}
                    >
                      {INTERPRETATION_LABEL[viewAnalysis.interpretation]}
                    </span>
                  </div>
                </div>
                <div className="relative w-full h-2.5 bg-gradient-to-r from-rose-100 via-slate-100 to-emerald-100 rounded-full overflow-hidden">
                  <div className="absolute top-0 left-1/2 w-px h-full bg-slate-300" />
                  <div
                    className={`absolute top-0 h-full w-1.5 rounded-full ${scoreColor}`}
                    style={{ left: `calc(${scorePct}% - 3px)` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 mt-0.5">
                  <span>분배 -100</span>
                  <span>중립 0</span>
                  <span>매집 +100</span>
                </div>
              </div>
            </section>

            {/* LLM 코멘트 */}
            <section className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border border-blue-100 p-4">
              <div className="flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-purple-900 mb-1">AI 분석 코멘트</p>
                  {viewAnalysis.naturalLanguageComment ? (
                    <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                      {viewAnalysis.naturalLanguageComment}
                    </p>
                  ) : llmLoading ? (
                    <p className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      분석 코멘트 생성 중...
                    </p>
                  ) : viewAnalysis.asOfDate === analysis.asOfDate ? (
                    <button
                      type="button"
                      onClick={() => analysis && fetchLlmComment(analysis)}
                      className="text-xs text-purple-700 hover:underline"
                    >
                      AI 코멘트 생성하기
                    </button>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      이 일자의 AI 코멘트가 아직 준비되지 않았습니다.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* 시그널 패널 (4개 카드) — 카드별 AI 해석 포함 */}
            <SignalPanel analysis={viewAnalysis} cardComments={viewAnalysis.perCardComments} />

            {/* VWAP 차트 placeholder */}
            <section className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center">
              <p className="text-xs text-slate-500">VWAP 차트 (추후 구현)</p>
            </section>

            {/* 시그널 디테일 */}
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-900 mb-3">최근 시그널 (상위 5개)</h2>
              {topSignals.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">감지된 시그널이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {topSignals.map((sig, i) => {
                    const isAccum =
                      sig.type.includes('accumulation') || sig.type === 'spring' || sig.type === 'iceberg-buy' || sig.type === 'sniper-buy'
                    const isDist =
                      sig.type.includes('distribution') || sig.type === 'upthrust' || sig.type === 'iceberg-sell' || sig.type === 'sniper-sell'
                    const tone = isAccum
                      ? 'bg-emerald-50 border-emerald-200'
                      : isDist
                        ? 'bg-rose-50 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    const labelTone = isAccum
                      ? 'bg-emerald-100 text-emerald-700'
                      : isDist
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-700'
                    return (
                      <li key={`${sig.type}-${i}`} className={`rounded-xl border p-3 ${tone}`}>
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${labelTone}`}>
                            {SIGNAL_TYPE_LABELS[sig.type]}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            <span>
                              신뢰도 <span className="font-mono font-bold text-slate-700">{sig.confidence.toFixed(0)}</span>
                            </span>
                            {sig.triggeredAt && (
                              <span className="font-mono">
                                {new Date(sig.triggeredAt).toLocaleString('ko-KR', {
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        {sig.description && (
                          <p className="text-xs text-slate-700 mt-1.5 leading-relaxed">{sig.description}</p>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>

          {/* 우측: 알림 목록 */}
          <aside className="lg:col-span-1">
            <div className="lg:sticky lg:top-20">
              <AlertList
                refreshKey={alertListRefresh}
                onEdit={a => {
                  setEditingAlert({ ticker: a.ticker, market: a.market, name: a.ticker_name })
                  setAlertModalOpen(true)
                }}
              />
            </div>
          </aside>
        </div>
      )}

      {/* 분석 결과가 없을 때도 알림 목록은 보여주기 (사용성) */}
      {!analysis && !loading && (
        <AlertList
          refreshKey={alertListRefresh}
          onEdit={a => {
            setEditingAlert({ ticker: a.ticker, market: a.market, name: a.ticker_name })
            setAlertModalOpen(true)
          }}
        />
      )}

      {/* 알림 설정 모달 */}
      {editingAlert && (
        <AlertSettingsModal
          open={alertModalOpen}
          onOpenChange={open => {
            setAlertModalOpen(open)
            if (!open) setEditingAlert(null)
          }}
          ticker={editingAlert.ticker}
          market={editingAlert.market}
          tickerName={editingAlert.name ?? editingAlert.ticker}
          onSaved={() => setAlertListRefresh(k => k + 1)}
        />
      )}
    </div>
  )
}
