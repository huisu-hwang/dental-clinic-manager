/**
 * Smart Money LLM Analyzer
 *
 * SmartMoneyAnalysis 결과를 받아 한국어 자연어 코멘트 생성
 * - Anthropic Claude Haiku 모델 사용 (저렴+빠름)
 * - 24시간 메모리 LRU 캐시 (ticker+asOfDate 조합)
 * - 매수/매도 추천 금지, 단정 표현 회피
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SmartMoneyAnalysis } from '@/types/smartMoney'

const MODEL_ID = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 600
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h
/** 캐시 키에 포함되는 프롬프트 버전 — 프롬프트 구조 변경 시 무효화 */
const PROMPT_VERSION = 'v2'

interface CacheEntry {
  comment: string
  expiresAt: number
}

const llmCache = new Map<string, CacheEntry>()
const MAX_CACHE_SIZE = 200

function cacheKey(analysis: SmartMoneyAnalysis): string {
  return `${PROMPT_VERSION}:${analysis.market}:${analysis.ticker}:${analysis.asOfDate}`
}

function getCached(key: string): string | null {
  const entry = llmCache.get(key)
  if (!entry) return null
  if (entry.expiresAt < Date.now()) {
    llmCache.delete(key)
    return null
  }
  return entry.comment
}

function setCached(key: string, comment: string): void {
  if (llmCache.size >= MAX_CACHE_SIZE) {
    // 가장 오래된 항목 제거 (Map은 삽입 순서 유지)
    const firstKey = llmCache.keys().next().value
    if (firstKey !== undefined) llmCache.delete(firstKey)
  }
  llmCache.set(key, { comment, expiresAt: Date.now() + CACHE_TTL_MS })
}

const SYSTEM_PROMPT = `당신은 한국 주식시장 전문 트레이더입니다. 주어진 다층 분석 데이터(VWAP, 단일봉 Wyckoff, 알고리즘 풋프린트, 외국인/기관 매매, 와이코프 페이즈 A~E, 시장구조 BOS/CHoCH, 유동성 풀과 sweep, 오더블록·FVG, Bull/Bear Trap, VSA effort-vs-result, 세션·PO3, 뉴스 컨텍스트, 조작 위험도)를 종합 해석하여 오늘 이 종목에서 스마트머니의 의도와 일반 투자자가 취할 수 있는 대응 전략을 작성하세요.

반드시 아래 두 섹션을 모두 포함해야 합니다:

[스마트머니 의도]
- 2~3문장. 매집/분배/중립 중 어느 단계로 보이는지, 어떤 시그널이 그 판단을 뒷받침하는지 구체적으로 언급(예: 와이코프 Phase C Spring, CHoCH 강세 전환, 유동성 사냥, 매수 클라이맥스 등).

[일반 투자자 대응 전략]
- 2~3문장. 위 의도 분석을 바탕으로 일반 개인 투자자가 어떻게 행동/관망/주의해야 하는지 구체적 가이드. 트랩이 감지되면 "추격 매수 자제", 매집 후기 페이즈면 "분할 진입 고려" 같이 행동 지침 제시. 조작 위험도가 50 이상이면 반드시 경고 문구 포함.

규칙:
- 위 두 섹션 헤더([스마트머니 의도] / [일반 투자자 대응 전략])는 반드시 그대로 출력.
- 단정적 표현 대신 "~로 보입니다", "~의심됩니다" 같은 톤 사용.
- 절대 특정 가격대의 매수/매도 추천이나 목표가/손절가 명시 금지.
- 단순한 데이터 나열 금지 — 반드시 종합 해석.`

let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.')
    }
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

/** Anthropic에 보낼 분석 요약 (토큰 절감용으로 일부 필드만) */
function summarizeAnalysis(analysis: SmartMoneyAnalysis): Record<string, unknown> {
  return {
    ticker: analysis.ticker,
    market: analysis.market,
    name: analysis.name,
    asOfDate: analysis.asOfDate,
    currentPrice: analysis.currentPrice,
    vwap: {
      vwap: analysis.vwap.vwap,
      distance: analysis.vwap.distance,
      zone: analysis.vwap.zone,
    },
    investorFlow: analysis.investorFlow
      ? {
          foreigner_net_today: analysis.investorFlow.foreigner_net_today,
          foreigner_net_5d: analysis.investorFlow.foreigner_net_5d,
          foreigner_net_20d: analysis.investorFlow.foreigner_net_20d,
          institution_net_today: analysis.investorFlow.institution_net_today,
          institution_net_5d: analysis.investorFlow.institution_net_5d,
          institution_net_20d: analysis.investorFlow.institution_net_20d,
          signal: analysis.investorFlow.signal,
          confidence: analysis.investorFlow.confidence,
        }
      : null,
    wyckoff: {
      springDetected: analysis.wyckoff.springDetected,
      upthrustDetected: analysis.wyckoff.upthrustDetected,
      absorptionScore: analysis.wyckoff.absorptionScore,
      description: analysis.wyckoff.description,
    },
    algoFootprint: {
      dominantAlgo: analysis.algoFootprint.dominantAlgo,
      direction: analysis.algoFootprint.direction,
      twapScore: analysis.algoFootprint.twapScore,
      vwapScore: analysis.algoFootprint.vwapScore,
      icebergScore: analysis.algoFootprint.icebergScore,
      sniperScore: analysis.algoFootprint.sniperScore,
    },
    overallScore: analysis.overallScore,
    interpretation: analysis.interpretation,
    manipulationRiskScore: analysis.manipulationRiskScore ?? 0,
    // ===== 정교화 엔진 요약 =====
    wyckoffPhase: analysis.wyckoffPhase
      ? {
          cycle: analysis.wyckoffPhase.cycle,
          phase: analysis.wyckoffPhase.phase,
          confidence: analysis.wyckoffPhase.confidence,
          eventTypes: analysis.wyckoffPhase.events.map((e) => e.type),
        }
      : null,
    marketStructure: analysis.marketStructure
      ? {
          trend: analysis.marketStructure.trend,
          lastEvent: analysis.marketStructure.lastEvent,
          lastEventDirection: analysis.marketStructure.lastEventDirection,
        }
      : null,
    liquidity: analysis.liquidity
      ? {
          activePoolCount: analysis.liquidity.pools.filter((p) => !p.swept).length,
          recentSweepDirections: analysis.liquidity.recentSweeps.slice(0, 3).map((s) => s.direction),
        }
      : null,
    orderBlocksFvg: analysis.orderBlocksFvg
      ? {
          unmitigatedBullishOB: analysis.orderBlocksFvg.orderBlocks.filter((o) => o.direction === 'bullish' && !o.mitigated).length,
          unmitigatedBearishOB: analysis.orderBlocksFvg.orderBlocks.filter((o) => o.direction === 'bearish' && !o.mitigated).length,
          unfilledBullishFVG: analysis.orderBlocksFvg.fvgs.filter((f) => f.direction === 'bullish' && !f.filled).length,
          unfilledBearishFVG: analysis.orderBlocksFvg.fvgs.filter((f) => f.direction === 'bearish' && !f.filled).length,
        }
      : null,
    traps: analysis.traps
      ? {
          bullTrapDetected: analysis.traps.bullTrapDetected,
          bearTrapDetected: analysis.traps.bearTrapDetected,
          detailCount: analysis.traps.details.length,
        }
      : null,
    vsa: analysis.vsa
      ? {
          effortVsResult: analysis.vsa.effortVsResult,
          recentSignalTypes: analysis.vsa.signals.slice(0, 3).map((s) => s.type),
        }
      : null,
    session: analysis.session
      ? {
          currentSession: analysis.session.currentSession,
          judasSwingDetected: analysis.session.judasSwingDetected,
          po3Pattern: analysis.session.po3Pattern,
        }
      : null,
    newsContext: analysis.newsContext
      ? {
          pattern: analysis.newsContext.pattern,
          affectedSignalCount: analysis.newsContext.affectedSignalIndices.length,
        }
      : null,
    signalDetails: analysis.signalDetails.map((s) => ({
      type: s.type,
      confidence: s.confidence,
    })),
  }
}

/**
 * SmartMoneyAnalysis로부터 한국어 LLM 코멘트 생성
 *
 * - 동일 ticker+asOfDate 24시간 캐시
 * - 실패 시 fallback 메시지 반환 (throw 하지 않음)
 */
export async function generateLLMComment(analysis: SmartMoneyAnalysis): Promise<string> {
  const key = cacheKey(analysis)
  const cached = getCached(key)
  if (cached) return cached

  try {
    const client = getAnthropic()
    const summary = summarizeAnalysis(analysis)
    const userMessage = `다음은 오늘 (${analysis.asOfDate}) ${analysis.name}(${analysis.ticker}) 종목의 스마트머니 분석 결과입니다.\n\n${JSON.stringify(summary, null, 2)}\n\n위 데이터를 바탕으로 스마트머니의 의도와 일반 투자자의 대응 전략을 2~3문장으로 작성해주세요.`

    const response = await client.messages.create({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    })

    // 첫 텍스트 블록 추출
    const textBlock = response.content.find(
      (block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text'
    )
    const comment = textBlock?.text?.trim() ?? ''
    if (!comment) {
      return '현재 데이터로는 명확한 코멘트를 생성하기 어렵습니다.'
    }

    setCached(key, comment)
    return comment
  } catch (err) {
    console.error('[smartMoney/llmAnalyzer] LLM 코멘트 생성 실패:', err)
    // 실패해도 분석 흐름을 막지 않도록 fallback
    return `${analysis.name}(${analysis.ticker}) — ${interpretationToKorean(analysis.interpretation)}로 해석됩니다. (LLM 코멘트 일시 사용 불가)`
  }
}

function interpretationToKorean(interp: SmartMoneyAnalysis['interpretation']): string {
  switch (interp) {
    case 'strong-accumulation':
      return '강한 매집 신호'
    case 'mild-accumulation':
      return '약한 매집 신호'
    case 'neutral':
      return '중립'
    case 'mild-distribution':
      return '약한 분배 신호'
    case 'strong-distribution':
      return '강한 분배 신호'
    default:
      return '중립'
  }
}
