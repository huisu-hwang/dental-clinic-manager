import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '@/lib/supabase';
import {
  DEFAULT_PLATFORM_PRESETS,
  type PostType,
  type ToneType,
  type PlatformOptions,
} from '@/types/marketing';

// ============================================
// AI 콘텐츠 캘린더 자동 생성
// 주간/월간 발행 계획을 AI가 자동 제안
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CalendarRequest {
  period: 'weekly' | 'monthly';
  startDate: string;              // YYYY-MM-DD
  postsPerWeek: number;           // 주당 발행 수 (기본 5)
  ratio: {
    informational: number;        // % (기본 60)
    promotional: number;          // % (기본 30)
    clinical: number;             // % (기본 10)
  };
  focusKeywords?: string[];
  excludeKeywords?: string[];
  skipWeekends?: boolean;
}

export interface CalendarItemProposal {
  publishDate: string;
  publishTime: string;
  title: string;
  topic: string;
  keyword: string;
  postType: PostType;
  tone: ToneType;
  useResearch: boolean;
  factCheck: boolean;
  platforms: PlatformOptions;
}

/**
 * AI 캘린더 자동 생성
 */
export async function generateCalendar(
  clinicId: string,
  userId: string,
  request: CalendarRequest
): Promise<{ calendarId: string; items: CalendarItemProposal[] }> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 초기화 실패');

  // 1. 기존 발행 키워드 조회 (중복 방지)
  const { data: keywordHistory } = await supabase
    .from('keyword_publish_history')
    .select('keyword, published_at')
    .eq('clinic_id', clinicId)
    .order('published_at', { ascending: false })
    .limit(100);

  const recentKeywords = (keywordHistory || []).map((k) => k.keyword);
  const excludeList = [...(request.excludeKeywords || []), ...recentKeywords];

  // 2. 기간 계산
  const startDate = new Date(request.startDate);
  const endDate = new Date(request.startDate);
  if (request.period === 'weekly') {
    endDate.setDate(endDate.getDate() + 6);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);
  }

  // 3. 발행일 목록 생성
  const publishDates = generatePublishDates(
    startDate,
    endDate,
    request.postsPerWeek,
    request.skipWeekends ?? true
  );

  // 4. 글 유형 배분
  const typeDistribution = distributePostTypes(publishDates.length, request.ratio);

  // 5. AI에게 주제/키워드 제안 요청
  const month = startDate.toLocaleString('ko-KR', { month: 'long' });
  const aiResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `치과 블로그 콘텐츠 캘린더를 만들어주세요.

## 요구사항
- 기간: ${request.startDate} ~ ${endDate.toISOString().split('T')[0]}
- 총 ${publishDates.length}개 글 필요
- 글 유형 배분: 정보성 ${typeDistribution.filter(t => t === 'informational').length}개, 홍보성 ${typeDistribution.filter(t => t === 'promotional').length}개, 임상글 ${typeDistribution.filter(t => t === 'clinical').length}개
${request.focusKeywords?.length ? `- 집중 키워드: ${request.focusKeywords.join(', ')}` : ''}
${excludeList.length ? `- 제외 키워드 (이미 발행됨): ${excludeList.slice(0, 20).join(', ')}` : ''}
- 현재 시기: ${month}

## 규칙
- 같은 키워드 사용 금지
- 계절/시기에 맞는 주제 반영
- 치과 관련 정보성 HOW-TO 콘텐츠 위주
- 키워드는 사람들이 실제 검색하는 자연스러운 검색어

## 출력 형식 (JSON 배열만 출력)
[
  {
    "title": "제목 (키워드 앞쪽 배치)",
    "topic": "주제 설명",
    "keyword": "타겟 키워드",
    "tone": "friendly|polite|casual|expert|warm"
  }
]

정확히 ${publishDates.length}개를 만들어주세요.`,
      },
    ],
  });

  const responseText = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '[]';

  // 6. AI 응답 파싱
  let aiItems: { title: string; topic: string; keyword: string; tone: ToneType }[] = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      aiItems = JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error('[CalendarGen] AI 응답 파싱 실패');
    aiItems = [];
  }

  // 7. 캘린더 항목 조합
  const items: CalendarItemProposal[] = publishDates.map((date, i) => {
    const ai = aiItems[i] || { title: `치과 정보 #${i + 1}`, topic: '', keyword: '치과', tone: 'friendly' as ToneType };
    const postType = typeDistribution[i] || 'informational';

    return {
      publishDate: date,
      publishTime: '09:00',
      title: ai.title,
      topic: ai.topic,
      keyword: ai.keyword,
      postType,
      tone: ai.tone || 'friendly',
      useResearch: postType === 'informational' && i % 3 === 0, // 정보성 글 중 1/3에 논문 인용
      factCheck: postType === 'clinical', // 임상글은 팩트체크 필수
      platforms: DEFAULT_PLATFORM_PRESETS[postType],
    };
  });

  // 8. DB에 캘린더 저장
  const { data: calendar, error: calError } = await supabase
    .from('content_calendars')
    .insert({
      clinic_id: clinicId,
      period_start: request.startDate,
      period_end: endDate.toISOString().split('T')[0],
      status: 'pending_approval',
      created_by: userId,
    })
    .select()
    .single();

  if (calError || !calendar) throw new Error('캘린더 생성 실패');

  // 9. 캘린더 항목 저장
  const itemsToInsert = items.map((item) => ({
    calendar_id: calendar.id,
    publish_date: item.publishDate,
    publish_time: item.publishTime,
    title: item.title,
    topic: item.topic,
    keyword: item.keyword,
    post_type: item.postType,
    tone: item.tone,
    use_research: item.useResearch,
    fact_check: item.factCheck,
    platforms: item.platforms,
    status: 'proposed',
  }));

  const { error: itemsError } = await supabase
    .from('content_calendar_items')
    .insert(itemsToInsert);

  if (itemsError) throw new Error('캘린더 항목 저장 실패');

  return { calendarId: calendar.id, items };
}

// ─── 헬퍼 함수 ───

/**
 * 발행일 목록 생성 (주말 건너뛰기 옵션)
 */
function generatePublishDates(
  start: Date,
  end: Date,
  postsPerWeek: number,
  skipWeekends: boolean
): string[] {
  const dates: string[] = [];
  const current = new Date(start);

  // 주당 발행 요일 분산 (예: 5일이면 월~금)
  const daysInWeek = skipWeekends ? 5 : 7;
  const interval = Math.max(1, Math.floor(daysInWeek / postsPerWeek));

  let dayCount = 0;
  let weekPostCount = 0;

  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0=일, 6=토

    // 주말 건너뛰기
    if (skipWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // 주당 발행 수 제한
    if (dayOfWeek === 1) weekPostCount = 0; // 월요일에 리셋

    if (weekPostCount < postsPerWeek && dayCount % interval === 0) {
      dates.push(current.toISOString().split('T')[0]);
      weekPostCount++;
    }

    dayCount++;
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

/**
 * 글 유형 배분
 */
function distributePostTypes(
  total: number,
  ratio: { informational: number; promotional: number; clinical: number }
): PostType[] {
  const types: PostType[] = [];
  const infoCount = Math.round(total * (ratio.informational / 100));
  const promoCount = Math.round(total * (ratio.promotional / 100));
  const clinicalCount = total - infoCount - promoCount;

  // 정보성 → 홍보성 → 임상 순으로 교차 배치
  let infoLeft = infoCount;
  let promoLeft = promoCount;
  let clinicalLeft = Math.max(0, clinicalCount);

  for (let i = 0; i < total; i++) {
    if (infoLeft > 0 && (i % 3 !== 2 || promoLeft === 0)) {
      types.push('informational');
      infoLeft--;
    } else if (promoLeft > 0) {
      types.push('promotional');
      promoLeft--;
    } else if (clinicalLeft > 0) {
      types.push('clinical');
      clinicalLeft--;
    } else {
      types.push('informational');
    }
  }

  return types;
}
