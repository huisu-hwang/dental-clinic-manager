/**
 * 스크리너 결과 상위 3개 추천 (전략별).
 *
 *   POST /api/investment/screener-recommend
 *   body: { strategyKey, strategyName, market, matches: [{ticker, market, name, price, matchedConditions, indicators }] }
 *
 * 정량 1차 후보 선정 (시총 순위 + 매치 조건 수) → Claude haiku가 상위 3개 + 이유 작성.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { topByMarketCap as topUSByMarketCap } from '@/lib/usTickerCatalog'
import { getKRMarketCapRank } from '@/lib/krTickerCatalog'

export const runtime = 'nodejs'
export const maxDuration = 30

const MODEL_ID = 'claude-haiku-4-5-20251001'
const MAX_CANDIDATES = 10

interface MatchInput {
  ticker: string
  market: 'KR' | 'US'
  name: string
  price: number
  matchedConditions: string[]
  indicators: Record<string, unknown>
}

interface RecommendBody {
  strategyKey: string
  strategyName: string
  matches: MatchInput[]
}

interface Recommendation {
  ticker: string
  market: 'KR' | 'US'
  name: string
  score: number
  reasoning: string
}

interface RecommendResponse {
  strategyKey: string
  strategyName: string
  criteria: string  // 평가 기준 설명
  rankings: Recommendation[]
}

let _usRankIndex: Map<string, number> | null = null
function getMarketCapRank(ticker: string, market: 'KR' | 'US'): number | null {
  if (market === 'KR') return getKRMarketCapRank(ticker)
  if (!_usRankIndex) {
    const list = topUSByMarketCap(10000)
    _usRankIndex = new Map(list.map((e, i) => [e.ticker, i + 1]))
  }
  return _usRankIndex.get(ticker.toUpperCase()) ?? null
}

let anthropicClient: Anthropic | null = null
function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY 미설정')
    anthropicClient = new Anthropic({ apiKey })
  }
  return anthropicClient
}

export async function POST(req: NextRequest) {
  let body: RecommendBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '본문 파싱 실패' }, { status: 400 })
  }

  if (!body.strategyKey || !Array.isArray(body.matches) || body.matches.length === 0) {
    return NextResponse.json({ error: '유효한 매치 데이터가 필요합니다' }, { status: 400 })
  }

  // 1. 정량 후보 선정 — 시총 순위(낮음=대형주) + 매칭 조건 수 기준 점수
  const scored = body.matches.map((m) => {
    const rank = getMarketCapRank(m.ticker, m.market) ?? 9999
    // 시총 순위가 낮을수록(대형주일수록) 안정성 가산. 0~1 정규화: rank=1 → 1.0, rank=1000 → 0.0 근사.
    const sizeScore = Math.max(0, 1 - rank / 1000)
    // 매칭 조건이 많을수록 신호 강도 가산
    const conditionScore = Math.min(1, m.matchedConditions.length / 5)
    const score = sizeScore * 0.6 + conditionScore * 0.4
    return { ...m, _rank: rank, _score: score }
  })
  scored.sort((a, b) => b._score - a._score)
  const candidates = scored.slice(0, MAX_CANDIDATES)

  if (candidates.length === 0) {
    return NextResponse.json({ error: '추천 가능한 후보가 없습니다' }, { status: 400 })
  }

  // 2. Claude에게 상위 3개 + 이유 요청
  const anthropic = getAnthropic()
  const candidateLines = candidates.map((c, i) => {
    const conds = c.matchedConditions.slice(0, 3).join(', ') + (c.matchedConditions.length > 3 ? ` 외 ${c.matchedConditions.length - 3}` : '')
    const indKeys = Object.keys(c.indicators).slice(0, 5).map((k) => {
      const v = c.indicators[k]
      if (typeof v === 'number') return `${k}=${v.toFixed(2)}`
      return `${k}=${JSON.stringify(v).slice(0, 30)}`
    }).join(', ')
    const rankStr = c._rank < 9999 ? `${c.market} 시총 #${c._rank}` : '시총 미상'
    return `${i + 1}. ${c.ticker} (${c.name}, ${rankStr}) — 충족조건: ${conds}; 지표: ${indKeys}`
  }).join('\n')

  // 후보의 시장 분포 — 우세한 시장으로 표시
  const krCount = candidates.filter((c) => c.market === 'KR').length
  const dominantMarket = krCount > candidates.length / 2 ? '한국' : krCount === 0 ? '미국' : '한국+미국 혼합'

  const prompt = `다음은 "${body.strategyName}" 전략에 부합한 ${dominantMarket} 종목 후보 ${candidates.length}개입니다. 이 중 향후 6-12개월 동안 가장 큰 수익률이 기대되는 상위 3개를 골라주세요.

## 후보 종목
${candidateLines}

## 평가 기준 (반드시 출력에 명시)
- 시가총액 안정성 (대형주 우선)
- 충족된 매수 조건의 강도/개수
- 전략 의도와의 부합도 (전략명·매치 조건 기반 추론)
- 산업/섹터 환경 (종목명에서 추정 가능한 범위)

## 출력 형식 (JSON only, 코드 블록 없이, 쌍따옴표 사용)
{
  "criteria": "어떤 기준으로 골랐는지 1-2문장",
  "rankings": [
    { "ticker": "...", "name": "...", "score": 8.5, "reasoning": "이 종목을 선택한 이유 3-5문장. 매치 조건과 전략 의도를 연결지어 설명." },
    { "ticker": "...", "name": "...", "score": 7.8, "reasoning": "..." },
    { "ticker": "...", "name": "...", "score": 7.2, "reasoning": "..." }
  ]
}

규칙:
- 정확히 3개 선정 (후보가 3개 미만이면 그만큼만)
- score는 0-10점 (10이 가장 유망)
- reasoning은 단정 대신 "~로 보입니다" 톤
- 매수/매도 추천이나 목표가/손절가 명시 금지
- 영어 약자는 한국어 풀이로 (예: "주가수익비율(PER)")`

  let parsed: { criteria: string; rankings: Array<{ ticker: string; name?: string; score?: number; reasoning?: string }> }
  try {
    const res = await anthropic.messages.create({
      model: MODEL_ID,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = res.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('\n')
      .trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start < 0 || end < 0) throw new Error('LLM 응답에서 JSON을 찾지 못함')
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch (err) {
    console.error('[screener-recommend] LLM 실패:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '추천 생성 실패' }, { status: 502 })
  }

  // ticker로 후보 매칭 (LLM이 ticker를 정확히 출력해야 함)
  const candByTicker = new Map(candidates.map((c) => [c.ticker.toUpperCase(), c]))
  const rankings: Recommendation[] = []
  for (const r of parsed.rankings ?? []) {
    const cand = candByTicker.get((r.ticker || '').toUpperCase())
    if (!cand) continue
    rankings.push({
      ticker: cand.ticker,
      market: cand.market,
      name: cand.name,
      score: typeof r.score === 'number' ? r.score : 0,
      reasoning: typeof r.reasoning === 'string' ? r.reasoning : '',
    })
  }

  const body_out: RecommendResponse = {
    strategyKey: body.strategyKey,
    strategyName: body.strategyName,
    criteria: typeof parsed.criteria === 'string' ? parsed.criteria : '',
    rankings: rankings.slice(0, 3),
  }

  return NextResponse.json(body_out)
}
