import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
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
  SeoKeywordMiningResult,
  ClinicalPhotoInput,
} from '@/types/marketing';
import type { BrandImageOptions } from '@/types/brand';

// ─── 환자 친화 후처리 ───
// 1) 각 문단(빈 줄로 구분된 단락)의 첫 줄 시작 부분에 전각 공백을 자동 추가하여 들여쓰기 효과를 준다.
//    - 이미 들여쓰기되어 있거나 헤딩/리스트/마커/이미지/구분선/해시태그/HTML 줄은 건드리지 않는다.
// 2) 너무 긴 문단이 가독성을 해칠 수 있어 LLM에 짧은 문단을 요청하지만, 이미 생성된 본문은 보수적으로 그대로 유지한다.
const PARAGRAPH_INDENT = '　'; // 전각 공백 U+3000

function isParagraphStartLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^[\s　]/.test(line)) return false;        // 이미 들여쓰기된 줄
  if (/^#{1,6}\s/.test(trimmed)) return false;       // 마크다운 헤딩
  if (/^[-*+]\s/.test(trimmed)) return false;        // 글머리 기호
  if (/^\d+\.\s/.test(trimmed)) return false;        // 번호 리스트
  if (/^>/.test(trimmed)) return false;              // 인용
  if (/^\[(IMAGE|BRAND_IMAGE|CLINICAL_PHOTO)/i.test(trimmed)) return false; // 본문 마커
  if (/^!\[/.test(trimmed)) return false;            // 마크다운 이미지
  if (/^---+$/.test(trimmed)) return false;          // 수평선
  if (/^#[A-Za-z0-9가-힣]/.test(trimmed)) return false; // 해시태그 줄(예: #치과 #스케일링)
  if (/^<\/?[a-zA-Z]/.test(trimmed)) return false;   // HTML 태그 줄
  if (/^```/.test(trimmed)) return false;            // 코드 펜스
  return true;
}

function applyParagraphIndent(body: string): string {
  const lines = body.split('\n');
  const result: string[] = [];
  let prevIsBlank = true; // 본문 시작도 단락 시작으로 간주
  for (const line of lines) {
    if (!line.trim()) {
      result.push(line);
      prevIsBlank = true;
      continue;
    }
    if (prevIsBlank && isParagraphStartLine(line)) {
      result.push(PARAGRAPH_INDENT + line);
    } else {
      result.push(line);
    }
    prevIsBlank = false;
  }
  return result.join('\n');
}

// ─── 브랜드 이미지 마커 삽입 ───
// options.brandImageOptions에 따라 [BRAND_IMAGE:...] 마커를 본문 위치(top/middle/bottom)에 삽입
function insertBrandMarkers(body: string, opts?: BrandImageOptions): string {
  if (!opts) return body;

  type Spot = 'top' | 'middle' | 'bottom';
  const buckets: Record<Spot, string[]> = { top: [], middle: [], bottom: [] };

  if (opts.medicalLaw.enabled) {
    for (const pos of opts.medicalLaw.positions) buckets[pos].push('[BRAND_IMAGE:medical_law]');
  }
  if (opts.title.enabled) {
    const copy = opts.title.copy.replace(/\]/g, '');
    for (const pos of opts.title.positions) buckets[pos].push(`[BRAND_IMAGE:title|copy=${copy}]`);
  }
  if (opts.photo.enabled) {
    const tail = opts.photo.mode === 'manual' && opts.photo.photoId
      ? `id=${opts.photo.photoId}`
      : `mode=${opts.photo.mode}`;
    for (const pos of opts.photo.positions) buckets[pos].push(`[BRAND_IMAGE:photo|${tail}]`);
  }

  // 우선순위 정렬: medical_law → title → photo
  const order = (m: string) => m.includes('medical_law') ? 0 : m.includes(':title') ? 1 : 2;
  for (const k of ['top', 'middle', 'bottom'] as const) {
    buckets[k].sort((a, b) => order(a) - order(b));
  }

  // 위치 결정: top=글 맨 위, middle=헤딩 갯수의 중앙값 위치, bottom=글 끝
  const lines = body.split('\n');
  const headingIdx: number[] = [];
  lines.forEach((l, i) => { if (/^##\s/.test(l)) headingIdx.push(i); });
  const middleHeadingLine = headingIdx.length > 0 ? headingIdx[Math.floor(headingIdx.length / 2)] : Math.floor(lines.length / 2);

  const top = buckets.top.join('\n\n');
  const middle = buckets.middle.join('\n\n');
  const bottom = buckets.bottom.join('\n\n');

  let result = '';
  if (top) result += top + '\n\n';
  if (middle) {
    const before = lines.slice(0, middleHeadingLine).join('\n');
    const after = lines.slice(middleHeadingLine).join('\n');
    result += before + (before.endsWith('\n') ? '' : '\n') + '\n' + middle + '\n\n' + after;
  } else {
    result += body;
  }
  if (bottom) {
    if (!result.endsWith('\n')) result += '\n';
    result += '\n' + bottom;
  }
  return result;
}

// ============================================
// AI 글 생성 엔진
// Claude API를 사용하여 네이버 SEO 최적화 글 생성
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── 사용자 지정 글자수 지시문 (없으면 기본 1,500자~) ───

function buildLengthInstruction(targetWordCount?: number): string {
  if (!targetWordCount || targetWordCount < 800) return '';
  // ±10% 허용 범위로 안내 (SEO 분석 평균값 적용 시 너무 빡빡한 제약 방지)
  const minLen = Math.round(targetWordCount * 0.9);
  const maxLen = Math.round(targetWordCount * 1.15);
  return `\n\n## 본문 길이 목표 (필수)\n사용자가 SEO 분석 결과를 바탕으로 본문 길이를 직접 지정했습니다. 공백을 제외한 본문 글자수가 약 ${targetWordCount.toLocaleString()}자(허용 범위: ${minLen.toLocaleString()}~${maxLen.toLocaleString()}자)가 되도록 작성하세요. 본문이 부족하면 핵심 내용을 풀어쓰거나 사례·수치를 추가하고, 과도하면 중복되는 설명을 정리하세요.`;
}

// ─── 메인 생성 함수 ───

export async function generateContent(
  options: ContentGenerateOptions,
  clinicId: string,
  customSystemPrompt?: string,
  generationSessionId?: string,
  seoKeywordData?: SeoKeywordMiningResult,
  clinicalPhotos?: ClinicalPhotoInput[]
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

  // SEO 키워드 분석 결과를 프롬프트에 주입
  let seoSection = '';
  if (seoKeywordData && seoKeywordData.competitorKeywords.length > 0) {
    const top5 = seoKeywordData.competitorKeywords.slice(0, 5);
    const rest = seoKeywordData.competitorKeywords.slice(5);

    seoSection = `\n\n## SEO 키워드 분석 결과 (경쟁 글 기반)\n\n상위 노출 경쟁 글에서 추출된 핵심 키워드입니다. 아래 키워드들을 자연스럽게 본문에 포함해주세요.\n\n### 필수 포함 키워드 (본문에 각 2-3회 자연스럽게 배치):\n${top5.map(k => `- ${k.keyword} (경쟁 글에서 총 ${k.frequency}회, ${k.postCount}/5개 글에서 사용)`).join('\n')}\n\n${rest.length > 0 ? `### 권장 포함 키워드 (1-2회 자연스럽게 언급):\n${rest.map(k => `- ${k.keyword} (총 ${k.frequency}회, ${k.postCount}/5개 글)`).join('\n')}\n\n` : ''}### 경쟁 글 통계 (참고용):\n- 평균 본문 길이: ${seoKeywordData.avgBodyLength}자\n- 평균 이미지 수: ${seoKeywordData.avgImageCount}개\n- 평균 소제목 수: ${seoKeywordData.avgHeadingCount}개\n${seoKeywordData.commonTags.length > 0 ? `- 자주 사용되는 태그: ${seoKeywordData.commonTags.slice(0, 10).join(', ')}\n` : ''}\n### 키워드 배치 주의사항:\n- 키워드를 억지로 나열하지 말고 문맥에 맞게 자연스럽게 녹여주세요\n- 하나의 문단에 키워드를 몰아넣지 말고 글 전체에 고르게 분포시켜주세요\n- 키워드 밀도가 과도하면 스팸으로 분류될 수 있으니 주의하세요`;
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
    selected_teeth: options.clinical?.selectedTeeth?.length
      ? options.clinical.selectedTeeth.sort((a, b) => a - b).map(t => `#${t}`).join(', ')
      : '',
    // 공지글 변수
    ...options.notice?.templateData,
  }) + imageStyleInstruction + seoSection + buildLengthInstruction(options.targetWordCount);

  // 4. Claude API 호출 (임상 사진이 있으면 멀티모달)
  const callStart = Date.now();

  // 메시지 컨텐츠 빌드
  let userContent: Anthropic.Messages.ContentBlockParam[] | string;

  if (clinicalPhotos && clinicalPhotos.length > 0) {
    // 임상글: 멀티모달 (텍스트 + 이미지)
    const parts: Anthropic.Messages.ContentBlockParam[] = [];

    parts.push({
      type: 'text',
      text: `다음 주제로 임상 사례 블로그 글을 작성해주세요.\n\n주제: ${options.topic}\n키워드: ${options.keyword}\n\n아래는 실제 임상 사진들입니다. 각 사진을 보고 시술 과정과 결과를 구체적으로 설명해주세요.`,
    });

    // 사진 정렬: before → during → after, 각 카테고리 내 sort_order 순
    const typeOrder: Record<string, number> = { before: 0, during: 1, after: 2 };
    const sortedPhotos = [...clinicalPhotos].sort(
      (a, b) => (typeOrder[a.photo_type] ?? 9) - (typeOrder[b.photo_type] ?? 9) || a.sort_order - b.sort_order
    );

    const typeLabels: Record<string, string> = { before: '술전', during: '술중', after: '술후' };

    for (const photo of sortedPhotos) {
      const label = typeLabels[photo.photo_type] || photo.photo_type;
      parts.push({
        type: 'text',
        text: `\n--- ${label} 사진 (${photo.caption || '설명 없음'}) ---`,
      });
      parts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: (photo.media_type || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: photo.base64,
        },
      });
    }

    parts.push({
      type: 'text',
      text: '\n\n위 사진들을 참고하여 글을 작성해주세요. 사진이 들어갈 위치에 [CLINICAL_PHOTO: before_1], [CLINICAL_PHOTO: during_1], [CLINICAL_PHOTO: after_1] 형식의 마커를 삽입해주세요. 숫자는 해당 카테고리 내 순서입니다.',
    });

    userContent = parts;
  } else {
    userContent = `다음 주제로 블로그 글을 작성해주세요.\n\n주제: ${options.topic}\n키워드: ${options.keyword}`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: userContent,
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
  // 사용자가 targetWordCount를 지정했으면 그 값을, 아니면 기본 1,000자 기준으로 재시도 임계 적용
  const minTarget = options.targetWordCount && options.targetWordCount >= 800
    ? Math.round(options.targetWordCount * 0.9)
    : 1000;
  if (parsed.wordCount < minTarget) {
    const retryStart = Date.now();
    const retryGoal = options.targetWordCount && options.targetWordCount >= 800
      ? `${options.targetWordCount.toLocaleString()}자(최소 ${minTarget.toLocaleString()}자)`
      : '1,000자 이상';
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
          content: `글자수가 ${parsed.wordCount}자로 부족합니다. ${retryGoal}으로 내용을 보강하여 다시 작성해주세요. 기존 구조와 [IMAGE:] 마커는 유지해주세요.`,
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
    // 단락 들여쓰기 후 브랜드 마커 삽입 (마커 줄은 들여쓰기 대상이 아니므로 순서 중요)
    retryParsed.body = insertBrandMarkers(applyParagraphIndent(retryParsed.body), options.brandImageOptions);
    return retryParsed;
  }

  parsed.body = insertBrandMarkers(applyParagraphIndent(parsed.body), options.brandImageOptions);
  return parsed;
}

// ─── 프롬프트 로딩 (마스터 프롬프트 전역 적용) ───

async function loadActivePrompt(
  clinicId: string,
  promptKey: string
): Promise<MarketingPrompt | null> {
  // 1. Admin 클라이언트로 마스터 프롬프트 로딩 (RLS 우회, 모든 클리닉 대상)
  //    마스터가 설정한 최신 버전이 모든 클리닉에 적용됨
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: masterData } = await admin
      .from('marketing_prompts')
      .select('*')
      .eq('prompt_key', promptKey)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (masterData) return masterData as MarketingPrompt;
  }

  // 2. 폴백: 사용자 클리닉의 프롬프트 (admin 클라이언트 불가 시)
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

  // [IMAGE: ...] 및 [CLINICAL_PHOTO: ...] 마커 추출
  const imageMarkers: ImageMarker[] = [];
  const imageRegex = /\[IMAGE:\s*(.+?)\]/g;
  let imgMatch;
  while ((imgMatch = imageRegex.exec(body)) !== null) {
    imageMarkers.push({
      position: imgMatch.index,
      prompt: imgMatch[1].trim(),
      sectionTitle: '',
    });
  }
  // 임상 사진 마커도 추출
  const clinicalPhotoRegex = /\[CLINICAL_PHOTO:\s*(.+?)\]/g;
  let cpMatch;
  while ((cpMatch = clinicalPhotoRegex.exec(body)) !== null) {
    imageMarkers.push({
      position: cpMatch.index,
      prompt: cpMatch[1].trim(),
      sectionTitle: 'clinical',
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
