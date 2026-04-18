import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { checkMedicalLaw } from '@/lib/marketing/medical-law-checker';
import { titleSimilarity } from '@/lib/marketing/keyword-researcher';
import type { TopicProposal } from '@/types/marketing';

// 개별 캘린더 항목 AI 재생성
// - 같은 journey_stage / topic_category 유지
// - 기존 제목·키워드와는 다른 주제 제안
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, feedback } = body as { itemId: string; feedback?: string };
    if (!itemId) {
      return NextResponse.json({ error: 'itemId는 필수입니다.' }, { status: 400 });
    }

    // 기존 항목 조회
    const { data: item, error: fetchError } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('id', itemId)
      .single();
    if (fetchError || !item) {
      return NextResponse.json({ error: '항목을 찾을 수 없습니다.' }, { status: 404 });
    }

    const typedItem = item as Record<string, unknown>;

    // 재생성 제한: proposed / modified 만 허용
    const currentStatus = typedItem.status as string;
    if (!['proposed', 'modified'].includes(currentStatus)) {
      return NextResponse.json(
        { error: `재생성은 proposed/modified 상태에서만 가능합니다. 현재: ${currentStatus}` },
        { status: 400 }
      );
    }

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `치과 블로그 글 주제를 다시 제안해주세요.

## 같은 제약 유지
- 여정 단계: ${typedItem.journey_stage}
- 카테고리: ${typedItem.topic_category}
- 톤: ${typedItem.tone}

## 기존 (다른 주제로 교체 필요)
- 제목: ${typedItem.title}
- 키워드: ${typedItem.keyword}
${feedback ? `\n## 사용자 피드백\n${feedback}` : ''}

## 규칙
- 네이버 C-Rank: 치과 전문성 유지
- 롱테일 3어절 키워드 (예: "상악 어금니 임플란트 비용")
- 의료광고법 금지어 회피 (최고·100%·완치·유일·보장 등)
- 기존과 다른 각도/세부주제

## 출력 (JSON만)
{
  "title": "45자 이내 검색어형 제목",
  "topic": "본문 주제 1~2문장",
  "keyword": "타겟 롱테일 키워드",
  "planningRationale": "이 주제 선정 근거 한 줄",
  "estimatedSearchVolume": 1500
}`,
        },
      ],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
    let parsed: Partial<TopicProposal> = {};
    try {
      const m = text.match(/\{[\s\S]*\}/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {
      return NextResponse.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });
    }

    if (!parsed.title || !parsed.keyword) {
      return NextResponse.json({ error: 'AI 응답 필드 누락' }, { status: 500 });
    }

    // 기존 제목과 유사도 높으면 거절
    const oldTitle = (typedItem.title as string) || '';
    if (titleSimilarity(parsed.title, oldTitle) >= 0.7) {
      return NextResponse.json(
        { error: '재생성 결과가 기존과 유사합니다. 다시 시도해주세요.' },
        { status: 409 }
      );
    }

    // 의료법 체크
    const lawCheck = checkMedicalLaw(`${parsed.title}\n${parsed.topic || ''}`);
    const needsMedicalReview =
      (typedItem.topic_category as string) === 'review' ||
      lawCheck.forbiddenWords.length > 0 ||
      lawCheck.exaggeration ||
      lawCheck.guaranteedResult;

    // 업데이트 (admin client로 RLS 우회, calendar-level 권한은 미들웨어 인증으로 보장)
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'admin 클라이언트 초기화 실패' }, { status: 500 });

    const { data: updated, error: updateError } = await admin
      .from('content_calendar_items')
      .update({
        title: parsed.title,
        topic: parsed.topic || typedItem.topic,
        keyword: parsed.keyword,
        planning_rationale: parsed.planningRationale || typedItem.planning_rationale,
        estimated_search_volume: parsed.estimatedSearchVolume ?? typedItem.estimated_search_volume,
        needs_medical_review: needsMedicalReview,
        status: 'modified',
      })
      .eq('id', itemId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[API] calendar/items/regenerate:', error);
    const message = error instanceof Error ? error.message : '재생성 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
