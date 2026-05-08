// src/lib/psychology/llmClient.ts
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Market } from '@/types/investment'
import type {
  PsychologyAnalysisOutput,
  PsychologyInputSnapshot,
  PsychologyTriggerKind,
} from '@/types/psychology'

const MODEL_ID = 'claude-haiku-4-5-20251001'

const VALID_MARKER_KINDS = ['panic_sell','fomo_entry','accumulation','distribution','capitulation','indecision'] as const

const ZAnalysis = z.object({
  // 모델이 점수를 문자열/소수로 반환할 수 있어 coerce 처리 + clamp
  psychology_score: z.coerce.number().transform(n => Math.max(0, Math.min(100, Math.round(n)))),
  score_label: z.string().min(1),
  tags: z.array(z.string()).max(8).default([]),
  narrative: z.string().min(1),
  markers: z.array(z.object({
    ts: z.string().default(''),
    // 알 수 없는 kind는 'indecision'으로 fallback (전체 분석 폐기 방지)
    kind: z.string().transform(v => (VALID_MARKER_KINDS as readonly string[]).includes(v) ? v as typeof VALID_MARKER_KINDS[number] : 'indecision'),
    label: z.string().min(1),
    candle_index: z.coerce.number().int().min(0),
  })).max(5).default([]),
  // null 또는 객체 모두 허용 — 모델이 누락 시 null로 정규화
  orderbook_pressure: z.union([
    z.null(),
    z.object({
      bid_pct: z.coerce.number().min(0).max(100),
      ask_pct: z.coerce.number().min(0).max(100),
      interpretation: z.string(),
    }),
  ]).nullable().default(null),
})

const TOOL_DEFINITION = {
  name: 'submit_psychology_analysis',
  description: '주식 군중심리 분석 결과를 제출합니다.',
  input_schema: {
    type: 'object' as const,
    properties: {
      psychology_score: { type: 'integer', minimum: 0, maximum: 100 },
      score_label: { type: 'string', enum: ['극공포','공포','중립','탐욕','극탐욕'] },
      tags: {
        type: 'array',
        items: { type: 'string', enum: ['패닉 셀링','FOMO 매수','익절 압력','누적 매집','분산 매도','관망','반등 시도','투매'] },
        maxItems: 5,
      },
      narrative: { type: 'string' },
      markers: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          properties: {
            ts: { type: 'string' },
            kind: { type: 'string', enum: ['panic_sell','fomo_entry','accumulation','distribution','capitulation','indecision'] },
            label: { type: 'string' },
            candle_index: { type: 'integer', minimum: 0 },
          },
          required: ['ts','kind','label','candle_index'],
        },
      },
      // Anthropic tools input_schema는 'oneOf' 미지원 — anyOf로 표현
      // 호가 데이터가 없는 해외 종목은 null 허용
      orderbook_pressure: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            properties: {
              bid_pct: { type: 'number', minimum: 0, maximum: 100 },
              ask_pct: { type: 'number', minimum: 0, maximum: 100 },
              interpretation: { type: 'string' },
            },
            required: ['bid_pct','ask_pct','interpretation'],
          },
        ],
      },
    },
    required: ['psychology_score','score_label','tags','narrative','markers','orderbook_pressure'],
  },
}

const SYSTEM_PROMPT = `당신은 주식 시장 군중심리 분석 전문가입니다. 주어진 분봉 시계열과 호가 스냅샷을 보고, 호가창과 차트를 수시로 보고 있는 일반 투자자(대중)가 지금 이 순간 느낄 심리를 분석합니다. 출력은 반드시 submit_psychology_analysis 도구를 통해 제출하며, 한국어로 작성합니다. 추측이 아닌 데이터에서 직접 관찰 가능한 패턴 위주로 분석하고, 단정적 매매 권유 표현은 사용하지 않습니다.`

export interface AnalyzeArgs {
  ticker: string
  market: Market
  triggerKind: PsychologyTriggerKind
  triggerDetail?: string
  snapshot: PsychologyInputSnapshot
}

export interface AnalyzeResult {
  output: PsychologyAnalysisOutput
  model: string
  latencyMs: number
}

function buildUserPrompt(args: AnalyzeArgs): string {
  const { ticker, market, triggerKind, triggerDetail, snapshot } = args
  const candleLines = snapshot.candles.map((c, i) =>
    `[${i}] ${c.ts} O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}`
  ).join('\n')
  const orderbookSummary = snapshot.orderbook
    ? `호가 (10단계): 매수총잔량=${snapshot.orderbook.totalBidQty}, 매도총잔량=${snapshot.orderbook.totalAskQty}\n` +
      `매수: ${snapshot.orderbook.bids.map(b => `${b.price}@${b.qty}`).join(', ')}\n` +
      `매도: ${snapshot.orderbook.asks.map(a => `${a.price}@${a.qty}`).join(', ')}`
    : '호가 데이터 없음 (해외 종목)'
  return [
    `종목: ${ticker} (${market})`,
    `분석 요청 사유: ${triggerKind}${triggerDetail ? ` - ${triggerDetail}` : ''}`,
    `최근 ${snapshot.candles.length}개 1분봉:`,
    candleLines,
    orderbookSummary,
    '',
    '위 데이터를 바탕으로 군중심리를 분석하여 submit_psychology_analysis 도구를 호출해주세요.',
    `markers의 candle_index는 위 분봉 배열의 [N] 번호와 정확히 일치해야 합니다. 최대 5개.`,
  ].join('\n')
}

export async function analyzePsychology(args: AnalyzeArgs): Promise<AnalyzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수 누락')
  const client = new Anthropic({ apiKey })

  const userPrompt = buildUserPrompt(args)
  const start = Date.now()

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 1200,
      temperature: 0.3,
      system: SYSTEM_PROMPT,
      tools: [TOOL_DEFINITION],
      tool_choice: { type: 'tool', name: TOOL_DEFINITION.name },
      messages: [{ role: 'user', content: userPrompt }],
    })

    const toolUse = res.content.find(c => c.type === 'tool_use') as
      | { type: 'tool_use'; name: string; input: unknown }
      | undefined
    if (!toolUse) {
      if (attempt === 0) continue
      throw new Error('LLM 응답에 tool_use 없음')
    }

    const parsed = ZAnalysis.safeParse(toolUse.input)
    if (!parsed.success) {
      if (attempt === 0) continue
      console.error('[psychology llm] schema fail. raw:', JSON.stringify(toolUse.input))
      const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' / ')
      throw new Error(`LLM 응답 스키마 검증 실패: ${issues}`)
    }

    return {
      output: parsed.data,
      model: MODEL_ID,
      latencyMs: Date.now() - start,
    }
  }
  throw new Error('LLM 분석 실패 (재시도 한도 초과)')
}
