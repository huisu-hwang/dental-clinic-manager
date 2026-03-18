import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { TONE_INSTRUCTIONS } from './default-prompts';
import {
  ContentGenerateOptions,
  GeneratedContent,
  ImageMarker,
  SEOValidationResult,
  MarketingPrompt,
  FORBIDDEN_COMMERCIAL_KEYWORDS,
} from '@/types/marketing';

// ============================================
// AI 글 생성 엔진
// Claude API를 사용하여 네이버 SEO 최적화 글 생성
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── 메인 생성 함수 ───

export async function generateContent(
  options: ContentGenerateOptions,
  clinicId: string
): Promise<GeneratedContent> {
  // 1. 프롬프트 로딩
  const prompt = await loadActivePrompt(clinicId, `content.${options.postType}`);
  if (!prompt) {
    throw new Error(`프롬프트를 찾을 수 없습니다: content.${options.postType}`);
  }

  // 2. 변수 치환
  const systemPrompt = substituteVariables(prompt.system_prompt, {
    keyword: options.keyword,
    topic: options.topic,
    tone_instruction: TONE_INSTRUCTIONS[options.tone] || TONE_INSTRUCTIONS.friendly,
    research_section: options.useResearch
      ? '## 논문 인용\n가능한 경우 관련 학술 연구를 인용하여 신뢰성을 높여주세요.'
      : '',
    // 임상글 변수
    procedure_type: options.clinical?.procedureType || '',
    procedure_detail: options.clinical?.procedureDetail || '',
    duration: options.clinical?.duration || '',
    patient_age: options.clinical?.patientAge || '',
    patient_gender: options.clinical?.patientGender || '',
    chief_complaint: options.clinical?.chiefComplaint || '',
    // 공지글 변수
    ...options.notice?.templateData,
  });

  // 3. Claude API 호출
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `다음 주제로 블로그 글을 작성해주세요.\n\n주제: ${options.topic}\n키워드: ${options.keyword}`,
      },
    ],
    system: systemPrompt,
  });

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  // 4. 결과 파싱
  const parsed = parseGeneratedContent(rawText, options.keyword);

  // 5. SEO 검증
  const validation = validateSEORules(parsed, options.keyword);

  // 6. 금지 키워드 필터링
  if (validation.forbiddenKeywordsFound.length > 0) {
    parsed.body = filterForbiddenKeywords(parsed.body);
  }

  // 7. 글자수 부족 시 재생성 (1회)
  if (!validation.bodyLengthPassed) {
    const retryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: `다음 주제로 블로그 글을 작성해주세요.\n\n주제: ${options.topic}\n키워드: ${options.keyword}`,
        },
        {
          role: 'assistant',
          content: rawText,
        },
        {
          role: 'user',
          content: `글자수가 ${parsed.wordCount}자로 부족합니다. 1,000자 이상으로 내용을 보강하여 다시 작성해주세요. 기존 구조와 [IMAGE:] 마커는 유지해주세요.`,
        },
      ],
      system: systemPrompt,
    });

    const retryText = retryResponse.content[0].type === 'text' ? retryResponse.content[0].text : '';
    const retryParsed = parseGeneratedContent(retryText, options.keyword);
    return retryParsed;
  }

  return parsed;
}

// ─── 프롬프트 로딩 ───

async function loadActivePrompt(
  clinicId: string,
  promptKey: string
): Promise<MarketingPrompt | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('marketing_prompts')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('prompt_key', promptKey)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as MarketingPrompt;
}

// ─── 변수 치환 ───

function substituteVariables(
  template: string,
  variables: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(variables)) {
    result = result.replaceAll(`{{${key}}}`, value || '');
  }
  // 미사용 변수 제거
  result = result.replace(/\{\{[^}]+\}\}/g, '');
  return result;
}

// ─── 생성 결과 파싱 ───

function parseGeneratedContent(
  rawText: string,
  keyword: string
): GeneratedContent {
  const lines = rawText.split('\n');

  // 제목 추출 (첫 번째 # 또는 첫 줄)
  let title = '';
  let bodyStartIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ')) {
      title = line.replace(/^#\s+/, '');
      bodyStartIndex = i + 1;
      break;
    }
    if (line.startsWith('제목:') || line.startsWith('제목 :')) {
      title = line.replace(/^제목\s*:\s*/, '');
      bodyStartIndex = i + 1;
      break;
    }
  }

  if (!title && lines.length > 0) {
    title = lines[0].trim();
    bodyStartIndex = 1;
  }

  const bodyLines = lines.slice(bodyStartIndex);
  const body = bodyLines.join('\n').trim();

  // [IMAGE: ...] 마커 추출
  const imageMarkers: ImageMarker[] = [];
  const imageRegex = /\[IMAGE:\s*(.+?)\]/g;
  let match;
  while ((match = imageRegex.exec(body)) !== null) {
    imageMarkers.push({
      position: match.index,
      prompt: match[1].trim(),
      sectionTitle: '',
    });
  }

  // 해시태그 추출
  const hashtagRegex = /#([^\s#]+)/g;
  const hashtags: string[] = [];
  let hashMatch;
  const bodyForHash = body;
  while ((hashMatch = hashtagRegex.exec(bodyForHash)) !== null) {
    hashtags.push(hashMatch[1]);
  }

  // 글자수 계산 (띄어쓰기 제외)
  const bodyWithoutImages = body.replace(/\[IMAGE:\s*.+?\]/g, '');
  const wordCount = bodyWithoutImages.replace(/\s/g, '').length;

  // 키워드 출현 횟수
  const keywordCount = (body.match(new RegExp(keyword, 'g')) || []).length;

  return {
    title,
    body,
    imageMarkers,
    hashtags,
    wordCount,
    keywordCount,
  };
}

// ─── SEO 검증 ───

export function validateSEORules(
  content: GeneratedContent,
  keyword: string
): SEOValidationResult {
  const { title, body, wordCount, keywordCount } = content;

  // 제목에 키워드 포함 여부
  const titleHasKeyword = title.includes(keyword);

  // 키워드가 앞쪽에 위치하는지 (제목 앞 절반 이내)
  const keywordPosition = title.indexOf(keyword);
  const keywordAtFront = keywordPosition >= 0 && keywordPosition < title.length / 2;

  // 글자수 검증 (1,000자 이상)
  const bodyLengthPassed = wordCount >= 1000;

  // 키워드 횟수 검증 (3~5회)
  const keywordCountPassed = keywordCount >= 3 && keywordCount <= 7;

  // 금지 키워드 검출
  const forbiddenKeywordsFound = FORBIDDEN_COMMERCIAL_KEYWORDS.filter(
    (kw) => body.includes(kw) || title.includes(kw)
  );

  const passed =
    titleHasKeyword &&
    bodyLengthPassed &&
    keywordCountPassed &&
    forbiddenKeywordsFound.length === 0;

  return {
    titleHasKeyword,
    keywordAtFront,
    bodyLength: wordCount,
    bodyLengthPassed,
    keywordCount,
    keywordCountPassed,
    forbiddenKeywordsFound,
    passed,
  };
}

// ─── 금지 키워드 필터링 ───

export function filterForbiddenKeywords(text: string): string {
  let result = text;
  for (const keyword of FORBIDDEN_COMMERCIAL_KEYWORDS) {
    // 단독으로 사용된 금지 키워드만 제거 (다른 단어의 일부인 경우 유지)
    const regex = new RegExp(`(?<![가-힣a-zA-Z])${keyword}(?![가-힣a-zA-Z])`, 'g');
    result = result.replace(regex, '');
  }
  // 연속된 공백 정리
  result = result.replace(/\s{2,}/g, ' ');
  return result;
}
