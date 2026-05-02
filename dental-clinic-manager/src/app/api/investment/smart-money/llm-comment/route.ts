/**
 * Smart Money LLM Comment API
 *
 * POST /api/investment/smart-money/llm-comment
 *   Request:  { analysis: SmartMoneyAnalysis }
 *   Response: { data: { comment: string; generatedAt: string } }
 *
 * - SmartMoneyAnalysis 결과를 받아 한국어 자연어 코멘트 생성 (Claude Haiku)
 * - generateLLMComment helper 사용 (24시간 캐시 내장)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/requireAuth'
import { generateLLMComment } from '@/lib/smartMoney/llmAnalyzer'
import type { SmartMoneyAnalysis, SignalType, Interpretation } from '@/types/smartMoney'

export const dynamic = 'force-dynamic'

const VALID_INTERPRETATIONS: Interpretation[] = [
  'strong-accumulation',
  'mild-accumulation',
  'neutral',
  'mild-distribution',
  'strong-distribution',
]

const VALID_SIGNAL_TYPES: SignalType[] = [
  'spring',
  'upthrust',
  'absorption',
  'twap-distribution',
  'twap-accumulation',
  'vwap-distribution',
  'vwap-accumulation',
  'iceberg-buy',
  'iceberg-sell',
  'sniper-buy',
  'sniper-sell',
  'foreigner-accumulation',
  'foreigner-distribution',
  'institution-accumulation',
  'institution-distribution',
]

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error || !auth.user) {
    return NextResponse.json({ error: auth.error ?? '인증 실패' }, { status: auth.status })
  }

  let body: { analysis?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 })
  }

  if (!body.analysis || typeof body.analysis !== 'object') {
    return NextResponse.json({ error: 'analysis 필드가 필요합니다.' }, { status: 400 })
  }

  const analysis = body.analysis as SmartMoneyAnalysis
  if (!isValidAnalysis(analysis)) {
    return NextResponse.json(
      { error: 'analysis 데이터 구조가 올바르지 않습니다.' },
      { status: 400 }
    )
  }

  try {
    const result = await generateLLMComment(analysis)
    return NextResponse.json({
      data: {
        comment: result.comment,
        perCard: result.perCard,
        generatedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'LLM 코멘트 생성 실패'
    console.error('[smart-money/llm-comment] 실패:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================
// 입력 검증
// ============================================

function isValidAnalysis(input: unknown): input is SmartMoneyAnalysis {
  if (!input || typeof input !== 'object') return false
  const a = input as Record<string, unknown>
  if (typeof a.ticker !== 'string' || a.ticker.length === 0) return false
  if (a.market !== 'KR' && a.market !== 'US') return false
  if (typeof a.asOfDate !== 'string') return false
  if (typeof a.currentPrice !== 'number') return false
  if (!a.vwap || typeof a.vwap !== 'object') return false
  if (!a.wyckoff || typeof a.wyckoff !== 'object') return false
  if (!a.algoFootprint || typeof a.algoFootprint !== 'object') return false
  if (typeof a.overallScore !== 'number') return false
  if (typeof a.interpretation !== 'string' || !VALID_INTERPRETATIONS.includes(a.interpretation as Interpretation)) {
    return false
  }
  if (!Array.isArray(a.signalDetails)) return false
  for (const sig of a.signalDetails) {
    if (!sig || typeof sig !== 'object') return false
    const s = sig as Record<string, unknown>
    if (typeof s.type !== 'string' || !VALID_SIGNAL_TYPES.includes(s.type as SignalType)) return false
    if (typeof s.confidence !== 'number') return false
  }
  return true
}
