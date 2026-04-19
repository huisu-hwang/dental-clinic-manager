import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getKeywordPool, getRelatedKeywordsBatch, titleSimilarity, type KeywordSuggestion } from '@/lib/marketing/keyword-researcher';
import { getKeywordInsights, totalMonthlyQc, isSearchAdConfigured } from '@/lib/marketing/naver-searchad-client';
import { getSeasonalScores, isDataLabConfigured } from '@/lib/marketing/naver-datalab-client';
import { checkMedicalLaw } from '@/lib/marketing/medical-law-checker';
import {
  embedTextsBatch,
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
  isEmbeddingsConfigured,
} from '@/lib/marketing/embeddings';
import {
  DEFAULT_PLATFORM_PRESETS,
  DEFAULT_JOURNEY_DISTRIBUTION,
  JOURNEY_CATEGORY_MAP,
  TOPIC_CATEGORY_LABELS,
  type PostType,
  type ToneType,
  type PlatformOptions,
  type TopicCategory,
  type JourneyStage,
  type TopicProposal,
} from '@/types/marketing';

// ============================================
// AI 콘텐츠 캘린더 v2
// - 6축 카테고리 × 환자 여정 4단계 매트릭스
// - 네이버 검색광고 API 검색량/경쟁도
// - 네이버 데이터랩 시즌 점수
// - 의료광고법 사전 검증 + needs_medical_review 플래그
// - 수동 승인 필수 (초기 상태 'proposed')
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CalendarRequest {
  period: 'weekly' | 'monthly';
  startDate: string;              // YYYY-MM-DD
  postsPerWeek: number;           // 주당 발행 수 (기본 5 = 평일 매일)
  ratio?: {
    informational: number;
    promotional: number;
    clinical: number;
  };
  focusKeywords?: string[];
  excludeKeywords?: string[];
  skipWeekends?: boolean;
  publishTime?: string;           // HH:mm (기본 '10:00')
}

export interface CalendarItemProposal extends TopicProposal {
  publishDate: string;
  publishTime: string;
  postType: PostType;
  useResearch: boolean;
  factCheck: boolean;
  platforms: PlatformOptions;
}

interface JourneySlot {
  journeyStage: JourneyStage;
  topicCategory: TopicCategory;
}

// ─── 메인 ───

export async function generateCalendar(
  clinicId: string,
  userId: string,
  request: CalendarRequest
): Promise<{ calendarId: string; items: CalendarItemProposal[] }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error('Supabase admin 클라이언트 초기화 실패');

  // 1. 과거 180일 발행 이력 (중복 회피)
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 180);
  const { data: historyRows } = await supabase
    .from('keyword_publish_history')
    .select('keyword, published_at')
    .eq('clinic_id', clinicId)
    .gte('published_at', cutoff.toISOString().split('T')[0])
    .order('published_at', { ascending: false });

  const recentKeywords = (historyRows || []).map((r) => r.keyword as string);

  // 최근 발행 제목 + 임베딩도 함께 로드 (유사도 체크용)
  const { data: recentItems } = await supabase
    .from('content_calendar_items')
    .select('title, title_embedding')
    .in('status', ['scheduled', 'publishing', 'published'])
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })
    .limit(100);
  const recentTitles = (recentItems || []).map((i) => i.title as string);
  const recentEmbeddingsRaw = (recentItems || []).map((i) =>
    deserializeEmbedding((i as unknown as { title_embedding: string | null }).title_embedding)
  );
  const recentTitlesNeedingEmbedding = recentTitles
    .map((t, i) => ({ t, i }))
    .filter((x) => recentEmbeddingsRaw[x.i] === null)
    .map((x) => x.t);

  // 임베딩 미생성 분량을 일괄 임베딩 → 메모리 보강
  let recentEmbeddings = recentEmbeddingsRaw;
  if (isEmbeddingsConfigured() && recentTitlesNeedingEmbedding.length > 0) {
    try {
      const generated = await embedTextsBatch(recentTitlesNeedingEmbedding);
      let g = 0;
      recentEmbeddings = recentEmbeddingsRaw.map((existing) => {
        if (existing) return existing;
        const next = generated[g++];
        return next ?? null;
      });
    } catch (e) {
      console.error('[CalendarGen v2] 기존 제목 임베딩 백필 실패:', e);
    }
  }

  const excludeList = [...(request.excludeKeywords || []), ...recentKeywords];

  // 2. 기간·발행일 계산
  const startDate = new Date(request.startDate);
  const endDate = new Date(request.startDate);
  if (request.period === 'weekly') {
    endDate.setDate(endDate.getDate() + 6);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(endDate.getDate() - 1);
  }

  const publishDates = generatePublishDates(
    startDate,
    endDate,
    request.postsPerWeek,
    request.skipWeekends ?? true
  );
  const totalSlots = publishDates.length;

  // 3. 환자 여정 × 카테고리 슬롯 매트릭스
  const journeySlots = allocateJourneySlots(totalSlots);

  // 4. 시드 키워드 풀 로드 + 네이버 검색광고/데이터랩 인사이트
  const month = startDate.getMonth() + 1;
  const year = startDate.getFullYear();
  const seedPool = getKeywordPool(month, excludeList);

  // 시드 키워드 상한 (API 쿼터·응답시간 균형)
  const seedKeywords = Array.from(new Set(seedPool.map((s) => s.keyword))).slice(0, 30);

  // SearchAd 미설정 환경: 자동완성 API로 relKeywords 보강
  const searchAdLive = isSearchAdConfigured();
  const dataLabLive = isDataLabConfigured();

  const [insights, seasonalScores, autocompleteRelated] = await Promise.all([
    getKeywordInsights(seedKeywords),
    getSeasonalScores(seedKeywords, month, year),
    searchAdLive
      ? Promise.resolve(new Map<string, string[]>())
      : getRelatedKeywordsBatch(seedKeywords, 6),
  ]);
  const insightMap = new Map(insights.map((i) => [i.keyword, i]));

  // 시드 키워드에 검색량/경쟁도/시즌점수를 덧붙인 프로파일
  const seedProfiles = seedPool.map((sp) => {
    const insight = insightMap.get(sp.keyword);
    const apiRel = insight?.relKeywords || [];
    const acRel = autocompleteRelated.get(sp.keyword) || [];
    return {
      ...sp,
      monthlyQc: insight ? totalMonthlyQc(insight) : 0,
      compIdx: insight?.compIdx || '중간',
      relKeywords: apiRel.length > 0 ? apiRel : acRel,
      seasonalScore: seasonalScores.get(sp.keyword) ?? 50,
    };
  });

  console.log(
    `[CalendarGen v2] SearchAd=${searchAdLive ? 'live' : 'mock'}, DataLab=${dataLabLive ? 'live' : 'mock'}, autocomplete-rel=${autocompleteRelated.size}`
  );

  // 5. AI 호출 (멀티 제약 JSON 생성)
  const proposals = await proposeTopicsWithAi({
    totalSlots,
    journeySlots,
    seedProfiles,
    excludeList,
    recentTitles,
    focusKeywords: request.focusKeywords || [],
    month,
    year,
  });

  // 5-1. 의미적 중복 검사 (Gemini 임베딩 — 토큰 유사도가 못 잡는 표현 변종 차단)
  let proposalEmbeddings: (number[] | null)[] = proposals.map(() => null);
  if (isEmbeddingsConfigured()) {
    try {
      proposalEmbeddings = await embedTextsBatch(proposals.map((p) => p.title));
      const SIM_THRESHOLD = 0.85;
      for (let i = 0; i < proposals.length; i++) {
        const propEmb = proposalEmbeddings[i];
        if (!propEmb) continue;

        // 기존 발행분과 비교
        for (const existing of recentEmbeddings) {
          if (!existing) continue;
          if (cosineSimilarity(propEmb, existing) >= SIM_THRESHOLD) {
            console.warn(`[CalendarGen v2] 임베딩 중복 감지(과거): ${proposals[i].title}`);
            proposals[i] = fallbackProposal(i, journeySlots[i]);
            proposalEmbeddings[i] = null;
            break;
          }
        }

        // 같은 회차 내 중복도 검사
        for (let j = 0; j < i; j++) {
          if (!proposalEmbeddings[j]) continue;
          if (cosineSimilarity(propEmb, proposalEmbeddings[j]!) >= SIM_THRESHOLD) {
            console.warn(`[CalendarGen v2] 임베딩 중복 감지(회차내): ${proposals[i].title}`);
            proposals[i] = fallbackProposal(i, journeySlots[i]);
            proposalEmbeddings[i] = null;
            break;
          }
        }
      }
    } catch (e) {
      console.error('[CalendarGen v2] 임베딩 중복 검사 실패 — 토큰 유사도로만 진행:', e);
    }
  }

  // 6. 의료법 사전 검증 (제목 수준)
  const verifiedProposals = proposals.map((p) => verifyMedicalLaw(p));

  // 7. 발행 일자 분배 + 플랫폼 옵션 + 포스트 타입
  const items: CalendarItemProposal[] = publishDates.map((date, i) => {
    const prop = verifiedProposals[i] || fallbackProposal(i, journeySlots[i]);
    const postType: PostType = categoryToPostType(prop.topicCategory);

    return {
      publishDate: date,
      publishTime: request.publishTime || '10:00',
      title: prop.title,
      topic: prop.topic,
      keyword: prop.keyword,
      tone: prop.tone,
      topicCategory: prop.topicCategory,
      journeyStage: prop.journeyStage,
      needsMedicalReview: prop.needsMedicalReview,
      planningRationale: prop.planningRationale,
      estimatedSearchVolume: prop.estimatedSearchVolume,
      postType,
      useResearch: postType === 'informational',
      factCheck: prop.topicCategory === 'review' || prop.topicCategory === 'treatment',
      platforms: DEFAULT_PLATFORM_PRESETS[postType],
    };
  });

  // 8. DB 저장 — content_calendars + content_calendar_items
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

  if (calError || !calendar) {
    throw new Error(`캘린더 생성 실패: ${calError?.message || '알 수 없는 오류'}`);
  }

  const itemsToInsert = items.map((item, i) => ({
    calendar_id: calendar.id as string,
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
    topic_category: item.topicCategory,
    journey_stage: item.journeyStage,
    needs_medical_review: item.needsMedicalReview,
    planning_rationale: item.planningRationale,
    estimated_search_volume: item.estimatedSearchVolume,
    title_embedding: serializeEmbedding(proposalEmbeddings[i]),
  }));

  const { error: itemsError } = await supabase
    .from('content_calendar_items')
    .insert(itemsToInsert);

  if (itemsError) {
    throw new Error(`캘린더 항목 저장 실패: ${itemsError.message}`);
  }

  return { calendarId: calendar.id as string, items };
}

// ─── 환자 여정 슬롯 할당 ───

function allocateJourneySlots(total: number): JourneySlot[] {
  const slots: JourneySlot[] = [];
  const dist = DEFAULT_JOURNEY_DISTRIBUTION;

  // 각 여정 단계별 개수 계산 (반올림 후 부족분은 awareness에 추가)
  const counts: Record<JourneyStage, number> = {
    awareness: Math.round(total * (dist.awareness / 100)),
    consideration: Math.round(total * (dist.consideration / 100)),
    decision: Math.round(total * (dist.decision / 100)),
    retention: Math.round(total * (dist.retention / 100)),
  };
  let filled = counts.awareness + counts.consideration + counts.decision + counts.retention;
  while (filled < total) { counts.awareness++; filled++; }
  while (filled > total) {
    // retention → decision → consideration → awareness 순서로 감소
    if (counts.retention > 0) counts.retention--;
    else if (counts.decision > 0) counts.decision--;
    else if (counts.consideration > 0) counts.consideration--;
    else counts.awareness--;
    filled--;
  }

  // 각 슬롯에 카테고리 할당 (여정별 선호 카테고리 내에서 순환)
  const buckets: JourneyStage[] = [];
  for (const stage of ['awareness', 'consideration', 'decision', 'retention'] as JourneyStage[]) {
    for (let i = 0; i < counts[stage]; i++) buckets.push(stage);
  }
  // 인지·검색·결정·유지를 주 단위로 섞기
  const shuffled = interleaveBuckets(buckets);

  for (let i = 0; i < shuffled.length; i++) {
    const stage = shuffled[i];
    const cats = JOURNEY_CATEGORY_MAP[stage];
    const cat = cats[i % cats.length];
    slots.push({ journeyStage: stage, topicCategory: cat });
  }

  return slots;
}

function interleaveBuckets(items: JourneyStage[]): JourneyStage[] {
  // 그룹별 개수 집계
  const groups: Record<JourneyStage, number> = {
    awareness: 0, consideration: 0, decision: 0, retention: 0,
  };
  for (const it of items) groups[it]++;

  const order: JourneyStage[] = ['awareness', 'consideration', 'decision', 'awareness', 'consideration', 'retention'];
  const out: JourneyStage[] = [];
  while (out.length < items.length) {
    let added = false;
    for (const stage of order) {
      if (groups[stage] > 0) {
        out.push(stage);
        groups[stage]--;
        added = true;
        if (out.length >= items.length) break;
      }
    }
    if (!added) break; // 모두 소진
  }
  return out;
}

// ─── AI 주제 제안 ───

async function proposeTopicsWithAi(opts: {
  totalSlots: number;
  journeySlots: JourneySlot[];
  seedProfiles: (KeywordSuggestion & {
    monthlyQc: number;
    compIdx: string;
    relKeywords: string[];
    seasonalScore: number;
  })[];
  excludeList: string[];
  recentTitles: string[];
  focusKeywords: string[];
  month: number;
  year: number;
}): Promise<TopicProposal[]> {
  const { totalSlots, journeySlots, seedProfiles, excludeList, recentTitles, focusKeywords, month, year } = opts;

  // 슬롯 지시서
  const slotLines = journeySlots
    .map((s, i) => {
      const catLabel = TOPIC_CATEGORY_LABELS[s.topicCategory].label;
      return `  ${i + 1}. 여정=${s.journeyStage} / 카테고리=${s.topicCategory}(${catLabel})`;
    })
    .join('\n');

  // 시드 풀 프리브리프 (시즌 점수 높은 순으로 정렬해 우선 노출)
  const sortedSeeds = [...seedProfiles].sort((a, b) => b.seasonalScore - a.seasonalScore);
  const topSeeds = sortedSeeds
    .slice(0, 20)
    .map((s) => {
      const rel = s.relKeywords.length > 0 ? ` ↳ 연관: ${s.relKeywords.slice(0, 4).join(', ')}` : '';
      return `  - "${s.keyword}" [${s.topicCategory}/${s.journeyStage}] 월검색량~${s.monthlyQc} · 경쟁=${s.compIdx} · 시즌점수=${s.seasonalScore}${rel}`;
    })
    .join('\n');

  // 시즌 상위 키워드 (DataLab 트렌드 기반)
  const seasonalTop = sortedSeeds
    .filter((s) => s.seasonalScore >= 70)
    .slice(0, 8)
    .map((s) => `${s.keyword}(${s.seasonalScore}점)`)
    .join(', ');

  const prompt = `당신은 치과 전문 네이버 블로그 SEO 기획자입니다. 아래 조건으로 **정확히 ${totalSlots}개**의 글 주제를 기획해주세요.

## 기본 원칙 (반드시 준수)
1) 네이버 C-Rank: 치과 주제 집중. 벗어난 주제 금지.
2) 네이버 D.I.A.: 고유한 경험·구체적 정보·실용적 HOW-TO 중심. 일반론 금지.
3) 롱테일 3어절: 제목은 "수식어 + 핵심키워드 + 의도" (예: "상악 어금니 임플란트 비용 분당")
4) 의료광고법: '최고·100%·완치·유일·보장' 등 금지. 후기성/수술결과 단정 금지.
5) 본문 1500~2000자 분량을 쓸 수 있는 깊이.

## 시기
- 기준: ${year}년 ${month}월
- 시즌성·이벤트 키워드 적극 반영 (예: 6/9 치아의날, 여름방학 교정, 연말 보험 소진)
${seasonalTop ? `- **이번 달 시즌 상위 (네이버 데이터랩 트렌드)**: ${seasonalTop}\n  → 시즌점수 70+ 키워드는 가급적 1~2개 슬롯에 직접 활용` : ''}

## ${totalSlots}개 슬롯 (여정 단계와 카테고리는 고정)
${slotLines}

## 시드 키워드 풀 (시즌점수 높은 순, 검색량·경쟁도·연관어 포함)
${topSeeds}
${focusKeywords.length ? `\n## 집중 키워드 (있으면 최소 1개 포함)\n  ${focusKeywords.join(', ')}` : ''}

## 중복 금지 (최근 180일 발행분)
키워드: ${excludeList.slice(0, 30).join(', ') || '없음'}
제목: ${recentTitles.slice(0, 15).join(' | ') || '없음'}

## 출력 (JSON 배열만. 코드블록 없이)
[
  {
    "title": "45자 이내 자연스러운 검색어형 제목",
    "topic": "본문에서 다룰 핵심 주제를 1~2문장",
    "keyword": "타겟 롱테일 키워드 (3어절 권장)",
    "tone": "friendly|polite|casual|expert|warm",
    "topicCategory": "info|symptom|treatment|cost|review|clinic_news",
    "journeyStage": "awareness|consideration|decision|retention",
    "needsMedicalReview": false,
    "planningRationale": "이 주제를 선정한 한줄 근거 (시즌/검색량/여정)",
    "estimatedSearchVolume": 1500
  }
]

제약:
- 각 슬롯의 journeyStage, topicCategory는 위 ${totalSlots}개 슬롯 지시를 **순서대로** 따를 것
- 같은 키워드/유사 제목 사용 금지
- 후기(review)·결과 보장 언급 시 needsMedicalReview=true 설정
- estimatedSearchVolume은 시드 검색량에서 추정`;

  const aiResponse = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 6144,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = aiResponse.content[0].type === 'text' ? aiResponse.content[0].text : '[]';

  let parsed: TopicProposal[] = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) parsed = JSON.parse(match[0]) as TopicProposal[];
  } catch (e) {
    console.error('[CalendarGen v2] AI 응답 파싱 실패:', e);
    parsed = [];
  }

  // 길이 보정 (부족/초과 모두 대응)
  if (parsed.length < totalSlots) {
    for (let i = parsed.length; i < totalSlots; i++) {
      parsed.push(fallbackProposal(i, journeySlots[i]));
    }
  } else if (parsed.length > totalSlots) {
    parsed = parsed.slice(0, totalSlots);
  }

  // 제목 유사도 중복 제거
  const seen: string[] = [...recentTitles];
  for (let i = 0; i < parsed.length; i++) {
    const dup = seen.some((t) => titleSimilarity(parsed[i].title, t) >= 0.7);
    if (dup) {
      // fallback으로 교체
      parsed[i] = fallbackProposal(i, journeySlots[i]);
    }
    seen.push(parsed[i].title);
  }

  // 여정/카테고리 슬롯 강제 정렬 (AI가 어긋나게 반환해도 슬롯 지시 유지)
  for (let i = 0; i < parsed.length; i++) {
    parsed[i].journeyStage = journeySlots[i].journeyStage;
    parsed[i].topicCategory = journeySlots[i].topicCategory;
  }

  return parsed;
}

function fallbackProposal(index: number, slot: JourneySlot | undefined): TopicProposal {
  const stage = slot?.journeyStage || 'awareness';
  const cat = slot?.topicCategory || 'info';
  return {
    title: `치과 건강 관리 가이드 #${index + 1}`,
    topic: '일반 구강 건강 정보',
    keyword: '치과 건강 관리',
    tone: 'friendly',
    topicCategory: cat,
    journeyStage: stage,
    needsMedicalReview: cat === 'review',
    planningRationale: 'AI 응답 누락으로 기본 주제 삽입 — 사용자 수정 권장',
    estimatedSearchVolume: 0,
  };
}

// ─── 의료법 검증 ───

function verifyMedicalLaw(p: TopicProposal): TopicProposal {
  // 제목 + topic 텍스트에 대해 간단 검증
  const sample = `${p.title}\n${p.topic}`;
  const result = checkMedicalLaw(sample);
  const needsReview =
    p.needsMedicalReview ||
    p.topicCategory === 'review' ||
    result.forbiddenWords.length > 0 ||
    result.exaggeration ||
    result.guaranteedResult ||
    result.priceComparison;

  return { ...p, needsMedicalReview: needsReview };
}

// ─── 카테고리 → PostType 매핑 ───

function categoryToPostType(cat: TopicCategory): PostType {
  switch (cat) {
    case 'info':
    case 'symptom':
      return 'informational';
    case 'treatment':
    case 'cost':
      return 'informational';
    case 'review':
      return 'clinical';
    case 'clinic_news':
      return 'notice';
    default:
      return 'informational';
  }
}

// ─── 발행일 분산 ───

function generatePublishDates(
  start: Date,
  end: Date,
  postsPerWeek: number,
  skipWeekends: boolean
): string[] {
  const dates: string[] = [];
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay(); // 0=일, 6=토
    const isWeekend = day === 0 || day === 6;
    if (!skipWeekends || !isWeekend) {
      dates.push(current.toISOString().split('T')[0]);
    }
    current.setDate(current.getDate() + 1);
  }

  // postsPerWeek 기반 필터 (주 5회 = 전일, 주 3회 = 월/수/금)
  if (postsPerWeek >= 5) {
    return dates; // 평일 전부
  }

  const filtered: string[] = [];
  const byWeek = new Map<string, string[]>();
  for (const d of dates) {
    const date = new Date(d);
    const weekKey = `${date.getFullYear()}-${getWeekNumber(date)}`;
    if (!byWeek.has(weekKey)) byWeek.set(weekKey, []);
    byWeek.get(weekKey)!.push(d);
  }

  for (const weekDates of byWeek.values()) {
    const picked = pickEvenly(weekDates, postsPerWeek);
    filtered.push(...picked);
  }

  return filtered.sort();
}

function getWeekNumber(d: Date): number {
  const firstDay = new Date(d.getFullYear(), 0, 1);
  const diff = (d.getTime() - firstDay.getTime()) / (1000 * 60 * 60 * 24);
  return Math.ceil((diff + firstDay.getDay() + 1) / 7);
}

function pickEvenly<T>(arr: T[], count: number): T[] {
  if (count >= arr.length) return arr;
  const step = arr.length / count;
  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    out.push(arr[Math.floor(i * step)]);
  }
  return out;
}
