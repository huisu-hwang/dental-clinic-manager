/**
 * 종목 회사 분석 — yahoo (정량) + Claude (서술) 결합.
 *
 *   GET /api/investment/ticker-analysis?ticker=AAPL&market=US
 *
 * 응답: 회사 소개, 매출/EPS 컨센서스 (올해/내년/내후년), 향후 전망 + 위험 요소.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const revalidate = 86400 // 24시간 캐시
const MODEL_ID = 'claude-haiku-4-5-20251001'

interface AnalysisResponse {
  ticker: string
  market: 'KR' | 'US'
  name: string
  description: string | null
  sector: string | null
  industry: string | null
  earnings: {
    label: string  // "올해", "내년", "내후년"
    revenueAvg: number | null
    earningsAvg: number | null
    growth: number | null  // YoY 성장률 (소수)
  }[]
  outlook: string  // 향후 전망 (3-5문장)
  risks: string[]  // 위험 요소 (3-5개)
  asOf: string
}

interface ProfileSummary {
  name: string
  sector: string | null
  industry: string | null
  longBusinessSummary: string | null
  marketCap: number | null
  trailingPE: number | null
  forwardPE: number | null
  profitMargin: number | null
  revenue: number | null
  earningsTrend: Array<{
    period: string  // 0q/+1q/0y/+1y
    revenueAvg: number | null
    earningsAvg: number | null
    revenueGrowth: number | null
    earningsGrowth: number | null
  }>
  recommendationKey: string | null
}

async function fetchProfile(symbol: string): Promise<ProfileSummary | null> {
  const yahoo = (await import('yahoo-finance2')).default
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sum: any = await yahoo.quoteSummary(symbol, {
      modules: ['assetProfile', 'price', 'summaryProfile', 'summaryDetail', 'defaultKeyStatistics', 'financialData', 'earningsTrend', 'recommendationTrend'],
    })
    const profile = sum?.assetProfile ?? sum?.summaryProfile ?? {}
    const price = sum?.price ?? {}
    const detail = sum?.summaryDetail ?? {}
    const stats = sum?.defaultKeyStatistics ?? {}
    const fin = sum?.financialData ?? {}
    const trends = sum?.earningsTrend?.trend ?? []
    const recs = sum?.recommendationTrend?.trend ?? []

    return {
      name: price?.shortName ?? price?.longName ?? '',
      sector: profile?.sector ?? null,
      industry: profile?.industry ?? null,
      longBusinessSummary: profile?.longBusinessSummary ?? null,
      marketCap: typeof price?.marketCap === 'number' ? price.marketCap : (typeof detail?.marketCap === 'number' ? detail.marketCap : null),
      trailingPE: typeof detail?.trailingPE === 'number' ? detail.trailingPE : null,
      forwardPE: typeof stats?.forwardPE === 'number' ? stats.forwardPE : null,
      profitMargin: typeof fin?.profitMargins === 'number' ? fin.profitMargins : null,
      revenue: typeof fin?.totalRevenue === 'number' ? fin.totalRevenue : null,
      earningsTrend: trends.map((t: any) => ({
        period: t?.period ?? '',
        revenueAvg: typeof t?.revenueEstimate?.avg === 'number' ? t.revenueEstimate.avg : null,
        earningsAvg: typeof t?.earningsEstimate?.avg === 'number' ? t.earningsEstimate.avg : null,
        revenueGrowth: typeof t?.revenueEstimate?.growth === 'number' ? t.revenueEstimate.growth : null,
        earningsGrowth: typeof t?.earningsEstimate?.growth === 'number' ? t.earningsEstimate.growth : null,
      })),
      recommendationKey: recs?.[0]?.toString() ?? null,
    }
  } catch (err) {
    console.error('[ticker-analysis] yahoo profile error:', err instanceof Error ? err.message : err)
    return null
  }
}

async function resolveSymbol(ticker: string, market: 'KR' | 'US'): Promise<string | null> {
  const t = ticker.toUpperCase().trim()
  if (!t) return null
  if (market === 'US') return t
  const yahoo = (await import('yahoo-finance2')).default
  for (const suffix of ['.KS', '.KQ']) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (yahoo.quoteSummary as any)(t + suffix, { modules: ['price'] })
      return t + suffix
    } catch {
      // try next
    }
  }
  return null
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

interface LLMResult {
  description: string
  outlook: string
  risks: string[]
}

async function generateAnalysis(profile: ProfileSummary, ticker: string, market: 'KR' | 'US'): Promise<LLMResult> {
  const anthropic = getAnthropic()
  const prompt = `다음은 ${market === 'KR' ? '한국' : '미국'} 상장 종목 ${ticker} (${profile.name})의 정량 데이터입니다. 이를 바탕으로 한국어로 분석해주세요.

## 정량 데이터
- 섹터/산업: ${profile.sector ?? '미상'} / ${profile.industry ?? '미상'}
- 시가총액: ${profile.marketCap ? `$${(profile.marketCap / 1e9).toFixed(1)}B` : '미상'}
- 주가수익비율(PER): trailing ${profile.trailingPE?.toFixed(1) ?? '미상'}, forward ${profile.forwardPE?.toFixed(1) ?? '미상'}
- 순이익률: ${profile.profitMargin ? (profile.profitMargin * 100).toFixed(1) + '%' : '미상'}
- 연 매출: ${profile.revenue ? `$${(profile.revenue / 1e9).toFixed(1)}B` : '미상'}
- 애널리스트 컨센서스 (period: revenueAvg / earningsGrowth):
${profile.earningsTrend.map(t => `  · ${t.period}: 매출 ${t.revenueAvg ? '$' + (t.revenueAvg / 1e9).toFixed(1) + 'B' : '미상'}, EPS 성장률 ${t.earningsGrowth != null ? (t.earningsGrowth * 100).toFixed(1) + '%' : '미상'}`).join('\n')}
- 회사 사업 요약(영문): ${profile.longBusinessSummary?.slice(0, 500) ?? '미상'}

## 출력 형식 (JSON only, 코드 블록 없이)
{
  "description": "이 회사가 무엇을 하는지 한국어로 2-3문장. 주요 사업 부문과 경쟁력 위주.",
  "outlook": "향후 1-3년 전망을 4-6문장. 매출/이익 성장률, 산업 트렌드, 경쟁 환경, 컨센서스 평가.",
  "risks": ["위험 요소 1", "위험 요소 2", "위험 요소 3", "위험 요소 4"]
}

규칙:
- description, outlook은 단정 대신 "~로 보입니다", "~할 것으로 예상됩니다" 톤
- 매수/매도 추천이나 목표가 명시 금지
- risks는 4-5개, 각 1-2문장
- 영어 약어는 한국어로 풀어쓰고 괄호 표기 (예: "주가수익비율(PER)")`

  const res = await anthropic.messages.create({
    model: MODEL_ID,
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => (b as { text: string }).text)
    .join('\n')
    .trim()

  // JSON 파싱 (모델이 ```json 감쌀 가능성 대비)
  const jsonStart = text.indexOf('{')
  const jsonEnd = text.lastIndexOf('}')
  if (jsonStart < 0 || jsonEnd < 0) throw new Error('LLM 응답에서 JSON을 찾지 못함')
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
  return {
    description: typeof parsed.description === 'string' ? parsed.description : '',
    outlook: typeof parsed.outlook === 'string' ? parsed.outlook : '',
    risks: Array.isArray(parsed.risks) ? parsed.risks.filter((r: unknown) => typeof r === 'string') : [],
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const ticker = (searchParams.get('ticker') ?? '').trim()
  const market = searchParams.get('market') as 'KR' | 'US' | null
  if (!ticker) return NextResponse.json({ error: '종목 코드가 비어있습니다' }, { status: 400 })
  if (market !== 'KR' && market !== 'US') {
    return NextResponse.json({ error: '올바르지 않은 시장 코드' }, { status: 400 })
  }

  const symbol = await resolveSymbol(ticker, market)
  if (!symbol) {
    return NextResponse.json({ error: '종목 정보를 찾을 수 없습니다' }, { status: 404 })
  }

  const profile = await fetchProfile(symbol)
  if (!profile) {
    return NextResponse.json({ error: '종목 프로필을 가져오지 못했습니다' }, { status: 502 })
  }

  let llm: LLMResult
  try {
    llm = await generateAnalysis(profile, ticker, market)
  } catch (err) {
    console.error('[ticker-analysis] LLM 실패:', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: '분석 생성 실패' }, { status: 502 })
  }

  // earningsTrend의 +1y, +2y, 0y 매핑 (yahoo 기준)
  const labelMap: Record<string, string> = {
    '0y': '올해 컨센서스',
    '+1y': '내년 컨센서스',
    '+2y': '내후년 컨센서스',
  }
  const earnings: AnalysisResponse['earnings'] = []
  for (const period of ['0y', '+1y', '+2y']) {
    const t = profile.earningsTrend.find((x) => x.period === period)
    if (!t) continue
    earnings.push({
      label: labelMap[period],
      revenueAvg: t.revenueAvg,
      earningsAvg: t.earningsAvg,
      growth: t.revenueGrowth,
    })
  }

  const body: AnalysisResponse = {
    ticker: ticker.toUpperCase(),
    market,
    name: profile.name,
    description: llm.description,
    sector: profile.sector,
    industry: profile.industry,
    earnings,
    outlook: llm.outlook,
    risks: llm.risks,
    asOf: new Date().toISOString(),
  }

  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=3600',
    },
  })
}
