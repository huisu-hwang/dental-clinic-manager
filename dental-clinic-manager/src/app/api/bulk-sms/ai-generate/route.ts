import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthedUserWithPermission } from '@/lib/bulkSmsAuth'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5-20251001'

const SYSTEM_PROMPT = `당신은 한국 치과의 단체 문자(SMS/LMS) 카피라이팅 전문가입니다.

원칙:
- 한국어로 작성, 자연스럽고 정중한 톤
- 환자에게 직접 전송되는 메시지이므로 신뢰감 있게 작성
- 변수 사용 권장: {환자명}, {병원명}, {전화번호}
- 의료 광고법 준수: 과장된 효능·치료 결과 보장 표현 금지, "최고", "유일한" 같은 단언 금지, 비교 광고 금지
- 90바이트(SMS 한도)를 가급적 넘지 않게 작성하되, LMS도 허용되므로 정보가 풍부한 안내는 200자 이내 권장
- 이모지는 절제해서 1~2개까지만 (없어도 됨)
- 발신 번호 따로 적지 않음 — 시스템이 자동 표시함

후보 3개를 만들 때는 톤·길이·접근법을 다르게:
1. **정중·격식체** — 처음 받는 환자도 안심할 안내문 톤
2. **친근·따뜻** — 단골 환자에게 보내듯 부드럽고 친밀한 톤
3. **간결·정보 중심** — 짧고 핵심만 담은 행동 유도 톤

응답 형식: 반드시 아래 JSON 형식만 출력 (코드블럭, 설명 없이).
{
  "candidates": [
    "후보 1 본문",
    "후보 2 본문",
    "후보 3 본문"
  ]
}`

function buildUserPrompt(situation: string): string {
  return `상황: ${situation.trim()}

위 상황에 맞는 단체 문자 본문 후보 3개를 JSON으로 생성하세요.`
}

export async function POST(request: NextRequest) {
  const ctx = await getAuthedUserWithPermission('bulk_sms_view')
  if (!ctx) return NextResponse.json({ success: false, error: '권한이 없습니다' }, { status: 403 })

  const body = (await request.json().catch(() => ({}))) as { situation?: string }
  const situation = (body.situation ?? '').trim()
  if (!situation) {
    return NextResponse.json({ success: false, error: '상황을 입력해주세요' }, { status: 400 })
  }
  if (situation.length > 500) {
    return NextResponse.json({ success: false, error: '상황은 500자 이내로 입력해주세요' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'AI가 설정되지 않았습니다' }, { status: 500 })
  }

  const client = new Anthropic({ apiKey })
  let resp
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: buildUserPrompt(situation) }],
    })
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: 'AI 호출 실패', detail: String(e?.message ?? e) },
      { status: 502 }
    )
  }

  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  let parsed: { candidates: unknown }
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) throw new Error('no json')
    parsed = JSON.parse(m[0])
  } catch {
    return NextResponse.json(
      { success: false, error: 'AI 응답을 해석할 수 없습니다', raw: text },
      { status: 502 }
    )
  }

  const arr = Array.isArray(parsed.candidates) ? parsed.candidates : []
  const candidates = arr
    .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
    .map((c) => c.trim())
    .slice(0, 3)

  if (candidates.length === 0) {
    return NextResponse.json(
      { success: false, error: 'AI가 후보를 생성하지 못했습니다' },
      { status: 502 }
    )
  }

  return NextResponse.json({ success: true, candidates })
}
