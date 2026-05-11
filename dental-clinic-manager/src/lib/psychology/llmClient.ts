// src/lib/psychology/llmClient.ts
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { Market, OHLCV } from '@/types/investment'
import type {
  PsychologyAnalysisOutput,
  PsychologyInputSnapshot,
  PsychologyTriggerKind,
} from '@/types/psychology'
import { calcFearGreed } from '@/lib/indicatorEngine'

/** 공포·탐욕 지수(0~100)를 라벨로 매핑 — narrative 후처리에 사용 */
function fearGreedLabel(score: number): string {
  if (score <= 20) return '극공포'
  if (score <= 40) return '공포'
  if (score < 60) return '중립'
  if (score < 80) return '탐욕'
  return '극탐욕'
}

/**
 * ISO ts (KR=+09:00, US=Z) → KST 표현으로 변환.
 *
 * - 사용자 보고: 미국 종목의 시각이 UTC 로 표시되어 한국 시간과 차이가 큼 → 통일 필요.
 * - LLM 프롬프트 입력 ts 와 후처리 inline 매칭 모두 같은 KST HH:MM 을 쓰도록 통일.
 */
function toKstParts(iso: string): { iso: string; hm: string } | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const kst = new Date(d.getTime() + 9 * 3600 * 1000)
  const y = kst.getUTCFullYear()
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  const ss = String(kst.getUTCSeconds()).padStart(2, '0')
  return {
    iso: `${y}-${m}-${day}T${hh}:${mm}:${ss}+09:00`,
    hm: `${hh}:${mm}`,
  }
}

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

const SYSTEM_PROMPT = `당신은 주식 시장 군중심리 분석 전문가입니다. 주어진 분봉 시계열과 호가 스냅샷을 보고, 호가창과 차트를 수시로 보고 있는 일반 투자자(대중)가 지금 이 순간 느낄 심리를 분석합니다. 출력은 반드시 submit_psychology_analysis 도구를 통해 제출하며, 한국어로 작성합니다. 추측이 아닌 데이터에서 직접 관찰 가능한 패턴 위주로 분석하고, 단정적 매매 권유 표현은 사용하지 않습니다.

**시간 표기 규칙 (필수)**: 모든 시각은 **한국 시간(KST, +09:00) 기준**으로 표기합니다. 입력 분봉의 ts는 이미 KST 로 변환되어 제공되므로 그대로 사용하세요. 미국 시장 종목도 본문에는 KST 시각을 사용합니다 (예: "23:42").

**공포·탐욕 지수 인용 규칙 (필수)**: 각 분봉마다 사전 계산된 공포·탐욕 지수(F 값, 0~100)가 함께 주어집니다. narrative 본문에서 특징적 시점·시각을 언급할 때마다 그 시점의 F 값과 라벨(극공포/공포/중립/탐욕/극탐욕)을 즉시 옆에 표기해야 합니다. 예: "13:42 (공포·탐욕 지수 18, 극공포)에 매도세가 집중되며…". markers 로 표시한 모든 시점은 본문에서도 한 번 이상 명시적으로 인용하며 같은 형식을 사용합니다. 시각을 언급하지 않은 일반 서술에는 표기하지 않습니다.`

export interface AnalyzeArgs {
  ticker: string
  market: Market
  triggerKind: PsychologyTriggerKind
  triggerDetail?: string
  snapshot: PsychologyInputSnapshot
  /** 과거 시점 분석인 경우 ISO 8601 — LLM 프롬프트에 명시해 시제 정합성 확보 */
  asOf?: string
}

export interface AnalyzeResult {
  output: PsychologyAnalysisOutput
  model: string
  latencyMs: number
}

/** 캔들 시계열에서 공포·탐욕 지수(0~100) 시리즈를 계산. 캔들 수 부족 시 빈 배열. */
function computeFearGreedSeries(snapshot: PsychologyInputSnapshot): number[] {
  if (!snapshot.candles || snapshot.candles.length < 5) return []
  // MinuteCandle 은 OHLCV 와 호환 (ts + OHLCV 필드). indicatorEngine 은 OHLCV 만 참조.
  const ohlcv = snapshot.candles as unknown as OHLCV[]
  try {
    // 1분봉 기준이라 기본 14/20/20/10 윈도우는 너무 김 → 짧은 윈도우로 조정
    return calcFearGreed(ohlcv, { rsiPeriod: 7, bbPeriod: 10, volPeriod: 10, momentumPeriod: 5 })
  } catch {
    return []
  }
}

function buildUserPrompt(args: AnalyzeArgs, fearGreed: number[]): string {
  const { ticker, market, triggerKind, triggerDetail, snapshot, asOf } = args
  // 모든 ts 를 KST 로 통일해 LLM 에 전달 — 본문에서도 KST 시각을 사용하게 됨.
  const candleLines = snapshot.candles.map((c, i) => {
    const kst = toKstParts(c.ts)
    const tsStr = kst?.iso ?? c.ts
    const fg = fearGreed[i]
    const fgStr = (typeof fg === 'number' && !Number.isNaN(fg)) ? ` F=${Math.round(fg)}` : ''
    return `[${i}] ${tsStr} O=${c.open} H=${c.high} L=${c.low} C=${c.close} V=${c.volume}${fgStr}`
  }).join('\n')
  const orderbookSummary = snapshot.orderbook
    ? `호가 (10단계): 매수총잔량=${snapshot.orderbook.totalBidQty}, 매도총잔량=${snapshot.orderbook.totalAskQty}\n` +
      `매수: ${snapshot.orderbook.bids.map(b => `${b.price}@${b.qty}`).join(', ')}\n` +
      `매도: ${snapshot.orderbook.asks.map(a => `${a.price}@${a.qty}`).join(', ')}`
    : '호가 데이터 없음 (해외 종목 또는 과거 시점 분석)'
  const asOfLine = asOf
    ? `분석 시점 (asOf): ${toKstParts(asOf)?.iso ?? asOf} (KST) — 이 시각 기준으로 그 직전 ${snapshot.candles.length}분 동안의 흐름을 분석합니다. 과거 시점이므로 narrative는 과거형으로 작성하세요.`
    : null
  const fearGreedNote = fearGreed.length > 0
    ? 'F 값은 사전 계산된 공포·탐욕 지수(0~100): 0~20 극공포, 20~40 공포, 40~60 중립, 60~80 탐욕, 80~100 극탐욕. RSI(7)/Bollinger %B(10)/거래량 스파이크(10)/모멘텀(5)의 가중 합성.'
    : null
  return [
    `종목: ${ticker} (${market})`,
    `분석 요청 사유: ${triggerKind}${triggerDetail ? ` - ${triggerDetail}` : ''}`,
    asOfLine,
    `최근 ${snapshot.candles.length}개 1분봉:`,
    candleLines,
    orderbookSummary,
    fearGreedNote,
    '',
    '위 데이터를 바탕으로 군중심리를 분석하여 submit_psychology_analysis 도구를 호출해주세요.',
    `markers의 candle_index는 위 분봉 배열의 [N] 번호와 정확히 일치해야 합니다. 최대 5개.`,
    fearGreed.length > 0
      ? `**narrative 작성 시 필수**: markers 로 표시한 각 특징적 지점의 공포·탐욕 지수(F 값)를 본문에 명시적으로 언급하세요. 예: "13:42 패닉 셀링 시점의 공포·탐욕 지수는 18(극공포)로 …".`
      : null,
  ].filter((line): line is string => line !== null).join('\n')
}

export async function analyzePsychology(args: AnalyzeArgs): Promise<AnalyzeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 환경변수 누락')
  const client = new Anthropic({ apiKey })

  const fearGreedSeries = computeFearGreedSeries(args.snapshot)
  const userPrompt = buildUserPrompt(args, fearGreedSeries)
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

    // 안전망 (2단):
    //  1) 본문에 등장한 모든 HH:MM 시각 옆에 (공포·탐욕 지수 NN, 라벨) inline 자동 보강
    //  2) markers 중 본문에 인용되지 않은 항목은 끝에 요약 블록으로 부착 (빠짐 방지)
    const enriched = enrichNarrativeWithFearGreed(
      parsed.data,
      fearGreedSeries,
      args.snapshot.candles.map(c => c.ts),
    )

    return {
      output: enriched,
      model: MODEL_ID,
      latencyMs: Date.now() - start,
    }
  }
  throw new Error('LLM 분석 실패 (재시도 한도 초과)')
}

/**
 * narrative 후처리 보강 (2단계):
 *   1) inline annotation — 본문에 등장한 모든 HH:MM 시각 옆에 (공포·탐욕 지수 NN, 라벨) 자동 추가.
 *      이미 같은 시각 옆에 표기가 있으면 skip (중복 방지).
 *   2) 요약 블록 — markers 중 본문에 인용되지 않은 항목은 끝에 "**주요 지점 공포·탐욕 지수**" 부착.
 */
function enrichNarrativeWithFearGreed(
  output: PsychologyAnalysisOutput,
  fearGreed: number[],
  timestamps: string[],
): PsychologyAnalysisOutput {
  if (fearGreed.length === 0) return output

  // HH:MM → 점수/라벨 매핑 (KST 기준 — LLM 본문도 KST 사용)
  const hmToData = new Map<string, { score: number; label: string }>()
  for (let i = 0; i < timestamps.length; i++) {
    const score = fearGreed[i]
    if (typeof score !== 'number' || Number.isNaN(score)) continue
    const kst = toKstParts(timestamps[i])
    if (!kst) continue
    if (!hmToData.has(kst.hm)) {
      hmToData.set(kst.hm, { score: Math.round(score), label: fearGreedLabel(score) })
    }
  }

  // 1) inline 보강 — 본문 안 HH:MM 패턴 옆에 (공포·탐욕 지수 NN, 라벨) 자동 부착
  const annotated = output.narrative.replace(
    /(\d{1,2}):(\d{2})/g,
    (match, _h, _m, offset, full: string) => {
      const data = hmToData.get(match.length === 5 ? match : `0${match}`) ?? hmToData.get(match)
      if (!data) return match
      // 직후 40자 안에 이미 공포/탐욕 관련 표기가 있으면 skip
      const tail = full.slice(offset + match.length, offset + match.length + 40)
      if (/공포·탐욕|공포\s*지수|F=\d|극공포|극탐욕|\(공포|\(탐욕|\(중립/.test(tail)) {
        return match
      }
      return `${match} (공포·탐욕 지수 ${data.score}, ${data.label})`
    },
  )

  // 2) 요약 블록 — markers 중 본문에서 인용되지 않은 시점만 부착 (빠짐 방지)
  //    시각 매칭은 KST HH:MM 기준 (LLM 본문도 KST 사용 가정)
  const missing = output.markers.filter((m) => {
    const sourceTs = m.ts || timestamps[m.candle_index] || ''
    const hm = toKstParts(sourceTs)?.hm ?? ''
    return hm && !annotated.includes(hm)
  })

  let finalNarrative = annotated
  if (missing.length > 0) {
    const lines = missing
      .slice()
      .sort((a, b) => a.candle_index - b.candle_index)
      .map((m) => {
        const score = fearGreed[m.candle_index]
        if (typeof score !== 'number' || Number.isNaN(score)) return null
        const rounded = Math.round(score)
        const sourceTs = m.ts || timestamps[m.candle_index] || ''
        const hm = toKstParts(sourceTs)?.hm
        const tsLabel = hm ?? `idx ${m.candle_index}`
        return `- ${tsLabel} ${m.label}: 공포·탐욕 지수 ${rounded} (${fearGreedLabel(score)})`
      })
      .filter((s): s is string => s !== null)
    if (lines.length > 0) {
      finalNarrative = `${annotated.trim()}\n\n**본문에서 누락된 주요 지점 공포·탐욕 지수**\n${lines.join('\n')}`
    }
  }

  return { ...output, narrative: finalNarrative }
}
