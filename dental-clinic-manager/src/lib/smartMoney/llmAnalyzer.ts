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
const PROMPT_VERSION = 'v3-plain'

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

const SYSTEM_PROMPT = `당신은 일반 개인 투자자에게 주식시장의 큰손(기관·외국인) 움직임을 쉽게 풀어 설명해주는 친절한 가이드입니다. 다양한 분석 데이터를 받지만, 답변에는 전문용어를 가급적 쓰지 말고 **일반인이 처음 들어도 이해할 수 있는 평범한 한국어**로 설명하세요.

반드시 아래 두 섹션을 모두 포함해야 합니다:

[큰손의 의도]
- 2~3문장. 기관·외국인 같은 "큰손"이 지금 이 종목을 사 모으는 중인지, 팔아 치우는 중인지, 아니면 관망 중인지를 일반인 눈높이에서 설명. 그렇게 판단한 이유를 비유나 쉬운 풀이로.

[일반 투자자 행동 가이드]
- 2~3문장. 위 분석을 토대로 평범한 개인이 지금 어떻게 행동하는 게 안전한지(추격 매수를 자제할지, 천천히 나눠서 살지, 일단 지켜볼지). 위험한 함정 신호가 있으면 분명히 경고.

전문용어 사용 규칙 (매우 중요):
- 다음 단어들은 **사용하지 말고** 쉬운 표현으로 바꿔 쓰세요:
  · "VWAP 위/아래" → "오늘 평균 거래가격보다 비싸게/싸게"
  · "BOS / CHoCH / Break of Structure" → "추세가 위로/아래로 꺾이는 신호" 또는 "상승 흐름이 새로 만들어졌다"
  · "유동성 풀 / 유동성 사냥 / sweep" → "많은 손절가가 몰린 가격대를 큰손이 일부러 건드린 흔적"
  · "오더블록 / FVG" → "큰손이 매수/매도 의사를 남긴 가격대" 또는 "되돌아올 가능성이 있는 가격구간"
  · "Wyckoff Spring" → "공포로 잠깐 떨어뜨려 매물을 흔들어낸 뒤 다시 끌어올린 흔적"
  · "Wyckoff Upthrust" → "환호로 잠깐 끌어올려 매수세를 끌어들인 뒤 다시 내린 흔적"
  · "Iceberg" → "큰 주문을 잘게 쪼개 티 안 나게 사 모으는 방식"
  · "TWAP / VWAP 알고" → "기관이 시간을 두고 일정하게 분할 매매하는 방식"
  · "Sniper" → "조용하다가 한순간에 빠르게 들어오는 매매 방식"
  · "MOO / MOC" → "장 시작 동시호가 / 장 마감 동시호가에 큰 거래량이 몰린 흔적"
  · "Bull/Bear Trap" → "사라고/팔라고 유혹하는 함정"
  · "VSA / Effort vs Result / No-Demand" → "거래량은 많은데 가격이 안 움직임 → 지친 기색" / "사려는 사람이 거의 없음 → 약한 신호"
  · "PO3 / Judas Swing" → "장 초반 일부러 반대로 움직여 개미를 흔드는 패턴"
- 영어 약자는 절대 그대로 쓰지 말 것. 꼭 필요하면 풀어 쓴 뒤 괄호로 한 번만 표기.
- 비유 적극 사용 (예: "도매상이 물건을 조용히 들이는 모습", "큰 식당이 평일에 손님 적은 시간을 노려 재고를 채우는 느낌").

기타 규칙:
- 섹션 헤더([큰손의 의도] / [일반 투자자 행동 가이드])는 그대로 출력.
- 단정 표현 대신 "~인 듯 합니다", "~로 보입니다" 같은 부드러운 톤 사용.
- 특정 가격대의 매수/매도 추천, 목표가/손절가 명시 절대 금지.
- 점수나 숫자를 그대로 나열하지 말고 한국어 풀이로(예: "100점 만점에 80점" 대신 "꽤 강한 신호").
- 조작 위험도가 50 이상이면 반드시 "함정일 수 있으니 추격 자제" 식 경고를 포함.`

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
    const userMessage = `다음은 오늘 (${analysis.asOfDate}) ${analysis.name}(${analysis.ticker}) 종목에 대한 큰손(기관·외국인) 움직임 분석 결과입니다.\n\n${JSON.stringify(summary, null, 2)}\n\n위 데이터를 바탕으로 [큰손의 의도]와 [일반 투자자 행동 가이드]를 작성해주세요. 전문용어는 절대 그대로 쓰지 말고 평범한 한국어로 풀어 설명해주세요.`

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
