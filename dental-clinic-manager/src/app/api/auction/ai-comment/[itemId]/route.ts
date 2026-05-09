import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { getServerSupabase } from '@/lib/auction/auctionService'
import { AI_PROMPT_VERSION, AI_SYSTEM_PROMPT, buildUserPrompt } from '@/lib/auction/aiPrompt'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL = 'claude-haiku-4-5-20251001'
const CACHE_TTL_HOURS = 24

interface Ctx { params: Promise<{ itemId: string }> }

export async function POST(_req: NextRequest, ctx: Ctx) {
  const { itemId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sb = getServerSupabase()

  // 1) Cache lookup
  const cached = await sb
    .from('auction_ai_comments')
    .select('*')
    .eq('item_id', itemId)
    .eq('prompt_version', AI_PROMPT_VERSION)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (cached.data) {
    const ageHours = (Date.now() - new Date(cached.data.generated_at).getTime()) / 3_600_000
    if (ageHours < CACHE_TTL_HOURS) {
      return NextResponse.json({ ...cached.data, cached: true })
    }
  }

  // 2) Fetch input data
  const item = await sb.from('auction_items').select('*').eq('id', itemId).single()
  if (!item.data) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const rights = await sb.from('auction_rights_analysis').select('*').eq('item_id', itemId).maybeSingle()

  // 3) Call Claude (system message uses cache_control for prompt caching)
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ai_not_configured' }, { status: 500 })

  const client = new Anthropic({ apiKey })
  const userPrompt = buildUserPrompt({
    caseNumber: item.data.case_number,
    courtName: item.data.court_name,
    propertyType: item.data.property_type,
    appraisalPrice: item.data.appraisal_price,
    minBidPrice: item.data.min_bid_price,
    failureCount: item.data.failure_count,
    rawNoticeText: rights.data?.raw_text ?? null,
    baseRightType: rights.data?.base_right_type ?? null,
    baseRightDate: rights.data?.base_right_date ?? null,
    hasSeniorTenant: rights.data?.has_senior_tenant ?? null,
    totalDeposit: rights.data?.total_deposit ?? null,
  })

  let resp
  try {
    resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: [{
        type: 'text',
        text: AI_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'ai_call_failed', detail: String(e?.message ?? e) }, { status: 502 })
  }

  // 4) Parse response
  const text = resp.content[0]?.type === 'text' ? resp.content[0].text : ''
  let parsed: { summary: string; risk_score: number; bullet_points: string[] }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('no json')
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    return NextResponse.json({ error: 'ai_invalid_response', raw: text }, { status: 502 })
  }

  // 5) Persist
  const { data: saved, error: saveErr } = await sb
    .from('auction_ai_comments')
    .upsert({
      item_id: itemId,
      prompt_version: AI_PROMPT_VERSION,
      model: MODEL,
      summary: parsed.summary,
      risk_score: parsed.risk_score,
      bullet_points: parsed.bullet_points,
      generated_at: new Date().toISOString(),
    }, { onConflict: 'item_id,prompt_version' })
    .select()
    .single()
  if (saveErr) return NextResponse.json({ error: saveErr.message }, { status: 500 })

  return NextResponse.json({ ...saved, cached: false })
}
