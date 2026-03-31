import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { TONE_INSTRUCTIONS } from './default-prompts';
import { seedDefaultPromptsIfNeeded } from './seed-prompts';
import { logApiUsage } from './api-usage-logger';
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
  clinicId: string,
  customSystemPrompt?: string,
  generationSessionId?: string
): Promise<GeneratedContent> {
  // 1. 프롬프트 로딩 (customSystemPrompt 제공 시 DB 조회 생략)
  let promptTemplate: string;
  if (customSystemPrompt !== undefined) {
    promptTemplate = customSystemPrompt;
  } else {
    let prompt = await loadActivePrompt(clinicId, `content.${options.postType}`);
    if (!prompt) {
      const seeded = await seedDefaultPromptsIfNeeded(clinicId);
      if (seeded) {
        prompt = await loadActivePrompt(clinicId, `content.${options.postType}`);
      }
      if (!prompt) {
        throw new Error(`프롬프트를 찾을 수 없습니다: content.${options.postType}`);
      }
    }
    promptTemplate = prompt.system_prompt;
  }

  // 2. 이미지 개수 및 스타일 지시문 생성
  let imageStyleInstruction = '';
  const imgCount = options.imageCount ?? 3;
  if (imgCount === 0) {
    imageStyleInstruction = '\n\n## 이미지 마커 지침\n[IMAGE:] 마커를 사용하지 마세요. 텍스트만 작성하세요.';
  } else {
    const countNote = `본문에 [IMAGE:] 마커를 정확히 ${imgCount}개 삽입하세요. 글 구조 예시의 이미지 개수와 관계없이 반드시 ${imgCount}개를 삽입해야 합니다. `;
    let styleNote = '';
    if (options.imageStyle === 'allow_person') {
      styleNote = `[IMAGE:] 마커 작성 시 사람(환자, 치과의사 등)이 포함된 장면을 자연스럽게 묘사하세요. 예: "치과의사가 환자에게 올바른 칫솔질 방법을 설명하는 장면"`;
    } else if (options.imageStyle === 'use_own_image') {
      styleNote = `[IMAGE:] 마커 작성 시 치과 원장/직원이 등장하는 장면을 묘사하세요. 예: "원장님이 치아 모형을 들고 임플란트 구조를 설명하는 장면"`;
    } else if (options.imageStyle === 'infographic_only') {
      styleNote = `[IMAGE:] 마커 작성 시 사람을 포함하지 마세요. 인포그래픽, 도표, 다이어그램, 일러스트, 아이콘 등 정보 시각화 중심으로 묘사하세요. 예: "스케일링 전후 치아 상태를 비교하는 인포그래픽 다이어그램"`;
    }
    imageStyleInstruction = `\n\n## 이미지 마커 지침 (필수)\n${countNote}${styleNote}`;
  }

  // 3. 변수 치환
  const systemPrompt = substituteVariables(promptTemplate, {
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
  }) + imageStyleInstruction;

  // 4. Claude API 호출
  const callStart = Date.now();
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
  const callDurationMs = Date.now() - callStart;

  if (generationSessionId) {
    logApiUsage({
      clinicId,
      generationSessionId,
      apiProvider: 'anthropic',
      model: 'claude-sonnet-4-6',
      callType: 'text_generation',
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      generationOptions: {
        topic: options.topic,
        keyword: options.keyword,
        tone: options.tone,
        postType: options.postType,
        imageCount: options.imageCount,
      },
      success: true,
      durationMs: callDurationMs,
    });
  }

  const rawText = response.content[0].type === 'text' ? response.content[0].text : '';

  // 5. 결과 파싱
  const parsed = parseGeneratedContent(rawText, options.keyword);

  // 6. SEO 검증
  const validation = validateSEORules(parsed, options.keyword);

  // 7. 금지 키워드 필터링
  if (validation.forbiddenKeywordsFound.length > 0) {
    parsed.body = filterForbiddenKeywords(parsed.body);
  }

  // 8. 글자수 부족 시 재생성 (1회)
  if (!validation.bodyLengthPassed) {
    const retryStart = Date.now();
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
    const retryDurationMs = Date.now() - retryStart;

    if (generationSessionId) {
      logApiUsage({
        clinicId,
        generationSessionId,
        apiProvider: 'anthropic',
        model: 'claude-sonnet-4-6',
        callType: 'text_retry',
        inputTokens: retryResponse.usage.input_tokens,
        outputTokens: retryResponse.usage.output_tokens,
        totalTokens: retryResponse.usage.input_tokens + retryResponse.usage.output_tokens,
        generationOptions: {
          topic: options.topic,
          keyword: options.keyword,
          tone: options.tone,
          postType: options.postType,
          imageCount: options.imageCount,
        },
        success: true,
        durationMs: retryDurationMs,
      });
    }

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
  let body = bodyLines.join('\n').trim();

  // 후처리: 구조 정규화
  body = normalizeBodyStructure(body);

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
  // 연속된 공백 정리 (줄바꿈은 보존, 수평 공백만 정리)
  result = result.replace(/[^\S\n]{2,}/g, ' ');
  return result;
}

// ─── 본문 구조 정규화 ───

function normalizeBodyStructure(body: string): string {
  let result = body;

  // 1. [IMAGE:] 마커를 별도 줄로 분리
  result = result.replace(/([^\n])\s*(\[IMAGE:\s*.+?\])/g, '$1\n\n$2');
  result = result.replace(/(\[IMAGE:\s*.+?\])\s*([^\n])/g, '$1\n\n$2');

  // 2. ## 소제목을 별도 줄로 분리
  result = result.replace(/([^\n])\s*(#{2,3}\s+)/g, '$1\n\n$2');

  // 3. **볼드 텍스트**로 시작하는 독립 구문을 소제목으로 변환
  // 예: "**치아 미백의 종류** 어쩌구" → "## 치아 미백의 종류\n\n어쩌구"
  result = result.replace(
    /(?:^|\n)\s*\*\*([^*]{2,30})\*\*\s*(?:\n|$)/gm,
    '\n\n## $1\n\n'
  );

  // 4. 긴 줄을 문장 단위로 단락 분리 (200자 초과 시)
  const lines = result.split('\n');
  const processed: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // 이미지 마커, 소제목, 리스트, 구분선은 그대로 유지
    if (
      !trimmed ||
      trimmed.startsWith('##') ||
      trimmed.startsWith('#') ||
      /^\[IMAGE:/.test(trimmed) ||
      /^[-*]\s+/.test(trimmed) ||
      /^\d+\.\s+/.test(trimmed) ||
      /^[-─━]{3,}$/.test(trimmed) ||
      /^#\S/.test(trimmed) // 해시태그
    ) {
      processed.push(line);
      continue;
    }

    // 200자 초과하는 텍스트 줄은 문장 단위로 분리
    if (trimmed.length > 200) {
      // 마침표/물음표/느낌표 + 공백 뒤에서 분리
      const sentences = trimmed.split(/(?<=[.?!。])\s+/);
      let currentParagraph: string[] = [];
      let currentLength = 0;

      for (const sentence of sentences) {
        currentParagraph.push(sentence);
        currentLength += sentence.length;
        // 150자 이상 누적되면 단락 분리
        if (currentLength >= 150) {
          processed.push(currentParagraph.join(' '));
          processed.push('');
          currentParagraph = [];
          currentLength = 0;
        }
      }
      if (currentParagraph.length > 0) {
        processed.push(currentParagraph.join(' '));
      }
    } else {
      processed.push(line);
    }
  }

  result = processed.join('\n');

  // 5. 연속 빈 줄 정리 (3줄 이상 → 2줄로)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}
