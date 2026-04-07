import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { seedDefaultPromptsIfNeeded } from './seed-prompts';
import { logApiUsage } from './api-usage-logger';
import type { GeneratedImageMeta, ImageMarker, ImageStyleOption, ImageVisualStyle } from '@/types/marketing';

// ============================================
// AI 이미지 생성 (Gemini 3.0 Flash)
// - 블로그 본문의 [IMAGE: 설명] 마커에서 이미지 생성
// - 한글 파일명 자동 생성
// ============================================

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── 이미지 스타일별 추가 지침 ───

function getImageStyleInstruction(imageStyle?: ImageStyleOption): string {
  switch (imageStyle) {
    case 'allow_person':
      return '\n\n추가 지침: 사람(환자, 치과의사 등)을 자연스럽게 포함하여 생성하세요.';
    case 'use_own_image':
      return '\n\n추가 지침: 다음 참조 이미지의 인물 특징을 반영하여 치과 블로그용 이미지를 생성하세요.';
    case 'infographic_only':
      return '\n\n추가 지침: 사람이나 인물 사진을 절대 포함하지 마세요. 도표, 다이어그램, 아이콘, 일러스트 등 정보 시각화 중심으로 생성하세요.';
    default:
      return '';
  }
}

function getVisualStyleInstruction(visualStyle?: ImageVisualStyle): string {
  switch (visualStyle) {
    case 'realistic':
      return '\n\n시각적 스타일: 실제 DSLR 카메라로 촬영한 것처럼 사실적이고 고해상도인 사진 스타일. 자연스러운 조명, 선명한 디테일, 현실감 있는 질감과 색감.';
    case 'pixar_3d':
      return '\n\n시각적 스타일: 픽사/디즈니 애니메이션처럼 귀엽고 매력적인 3D 렌더링 스타일. 둥글둥글한 형태, 생동감 있는 색상, 캐릭터는 큰 눈과 친근한 표정. Pixar-style 3D rendering.';
    case 'ghibli':
      return '\n\n시각적 스타일: 스튜디오 지브리 애니메이션처럼 따뜻하고 감성적인 수채화풍 일러스트. 부드러운 색감, 섬세한 배경 디테일, 동화 같은 분위기. Studio Ghibli anime watercolor style.';
    case 'flat_illustration':
      return '\n\n시각적 스타일: 깔끔한 플랫 디자인 벡터 일러스트 스타일. 단순한 도형, 선명한 색상 블록, 그림자 최소화, 모던하고 세련된 느낌. Flat vector illustration style.';
    case 'watercolor':
      return '\n\n시각적 스타일: 전통 수채화 기법의 부드럽고 자연스러운 아트 스타일. 물감이 번지는 텍스처, 투명한 레이어, 따뜻하고 감성적인 색감. Traditional watercolor painting style.';
    case 'minimal_line':
      return '\n\n시각적 스타일: 미니멀한 라인아트 스타일. 깔끔한 단일 선, 최소한의 색상(흰 배경에 1~2색), 심플하고 세련된 느낌. Minimal single-line art style.';
    default:
      return '';
  }
}

// ─── 마스터가 설정한 이미지 프롬프트 로딩 (전역 적용) ───

async function loadImagePromptTemplate(clinicId: string, promptKey: string = 'image.blog'): Promise<string | null> {
  // 1. Admin 클라이언트로 마스터 프롬프트 로딩 (RLS 우회, 모든 클리닉 대상)
  //    마스터가 설정한 최신 버전이 모든 클리닉에 적용됨
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: masterData } = await admin
      .from('marketing_prompts')
      .select('system_prompt')
      .eq('prompt_key', promptKey)
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .single();

    if (masterData) return masterData.system_prompt;
  }

  // 2. 폴백: 사용자 클리닉의 프롬프트 (admin 클라이언트 불가 시)
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('marketing_prompts')
    .select('system_prompt')
    .eq('clinic_id', clinicId)
    .eq('prompt_key', promptKey)
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    if (error) {
      console.warn('[ImageGen] 이미지 프롬프트 로딩 실패:', error.message, '(clinic:', clinicId, ')');
    }
    // 기본 프롬프트 시드 후 재시도
    const seeded = await seedDefaultPromptsIfNeeded(clinicId);
    if (seeded) {
      const { data: retryData } = await supabase
        .from('marketing_prompts')
        .select('system_prompt')
        .eq('clinic_id', clinicId)
        .eq('prompt_key', promptKey)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      return retryData?.system_prompt || null;
    }
    return null;
  }
  return data.system_prompt;
}

// ─── 블로그 이미지 생성 ───

export async function generateBlogImage(
  prompt: string,
  imageStyle?: ImageStyleOption,
  referenceImageBase64?: string,
  clinicId?: string,
  customSystemPrompt?: string,
  imageVisualStyle?: ImageVisualStyle,
  generationSessionId?: string,
  generationClinicId?: string,
): Promise<{
  imageBase64: string;
  fileName: string;
}> {
  // clinicId 우선순위: 기존 파라미터 > 새 파라미터
  const resolvedClinicId = clinicId || generationClinicId;

  // 마스터 이미지 프롬프트 템플릿 적용
  let fullPrompt: string;

  if (customSystemPrompt) {
    // 테스트 모드: 마스터가 편집 중인 미저장 프롬프트 사용
    fullPrompt = customSystemPrompt.replaceAll('{{image_prompt}}', prompt);
  } else if (resolvedClinicId) {
    // 실제 생성: DB에서 마스터 설정 프롬프트 로딩
    const template = await loadImagePromptTemplate(resolvedClinicId);
    if (template) {
      fullPrompt = template.replaceAll('{{image_prompt}}', prompt);
    } else {
      fullPrompt = buildDefaultImagePrompt(prompt);
    }
  } else {
    fullPrompt = buildDefaultImagePrompt(prompt);
  }

  // 이미지 스타일 지침 추가
  fullPrompt += getImageStyleInstruction(imageStyle);
  fullPrompt += getVisualStyleInstruction(imageVisualStyle);

  // 1. Gemini로 이미지 생성
  const geminiStart = Date.now();
  const { imageBase64, usageMetadata } = await generateImageWithGemini(fullPrompt, imageStyle, referenceImageBase64);
  const geminiDurationMs = Date.now() - geminiStart;

  if (generationSessionId && resolvedClinicId) {
    logApiUsage({
      clinicId: resolvedClinicId,
      generationSessionId,
      apiProvider: 'google',
      model: 'gemini-3.0-flash',
      callType: 'image_generation',
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: usageMetadata?.totalTokenCount ?? 0,
      success: true,
      durationMs: geminiDurationMs,
    });
  }

  // 2. 한글 파일명 생성
  const fileName = await generateImageFileName(prompt, generationSessionId, resolvedClinicId);

  return { imageBase64, fileName };
}

// ─── 플랫폼별 이미지 생성 ───

type SocialPlatform = 'instagram' | 'facebook' | 'threads';

const PLATFORM_IMAGE_STYLES: Record<SocialPlatform, string> = {
  instagram: `인스타그램용 정사각형(1:1) 이미지. 시선을 사로잡는 비주얼, 선명하고 생동감 있는 색감,
깔끔한 구도. 인스타그램 피드에서 눈에 띄는 스타일. 텍스트 오버레이 없이 순수 이미지만.`,
  facebook: `페이스북 공유용 가로형(1200x630) 이미지. 공유하고 싶은 매력적인 비주얼,
정보성을 느낄 수 있는 깔끔한 구도. 텍스트 오버레이 없이 순수 이미지만.`,
  threads: `쓰레드용 정사각형 이미지. 미니멀하고 임팩트 있는 단일 비주얼,
여백을 활용한 깔끔한 구도. 텍스트 오버레이 없이 순수 이미지만.`,
};

export async function generatePlatformImage(
  prompt: string,
  platform: SocialPlatform,
  imageStyle?: ImageStyleOption,
  referenceImageBase64?: string,
  imageVisualStyle?: ImageVisualStyle,
  generationSessionId?: string,
  generationClinicId?: string,
): Promise<{ imageBase64: string; fileName: string }> {
  const platformStyle = PLATFORM_IMAGE_STYLES[platform];
  const styleInstruction = getImageStyleInstruction(imageStyle);
  const visualInstruction = getVisualStyleInstruction(imageVisualStyle);

  // 마스터 프롬프트 템플릿 적용 (플랫폼 이미지에도 마스터 스타일 가이드 반영)
  let fullPrompt: string;
  if (generationClinicId) {
    const template = await loadImagePromptTemplate(generationClinicId);
    if (template) {
      // 마스터 템플릿의 {{image_prompt}}에 플랫폼별 스타일 + 주제를 주입
      fullPrompt = template.replaceAll('{{image_prompt}}', `${platformStyle}\n\n치과 블로그 주제: ${prompt}`);
    } else {
      fullPrompt = `${platformStyle}\n\n치과 블로그 주제: ${prompt}`;
    }
  } else {
    fullPrompt = `${platformStyle}\n\n치과 블로그 주제: ${prompt}`;
  }
  fullPrompt += styleInstruction + visualInstruction;

  const geminiStart = Date.now();
  const { imageBase64, usageMetadata } = await generateImageWithGemini(fullPrompt, imageStyle, referenceImageBase64);
  const geminiDurationMs = Date.now() - geminiStart;

  if (generationSessionId && generationClinicId) {
    logApiUsage({
      clinicId: generationClinicId,
      generationSessionId,
      apiProvider: 'google',
      model: 'gemini-3.0-flash',
      callType: 'platform_image',
      inputTokens: usageMetadata?.promptTokenCount ?? 0,
      outputTokens: usageMetadata?.candidatesTokenCount ?? 0,
      totalTokens: usageMetadata?.totalTokenCount ?? 0,
      success: true,
      durationMs: geminiDurationMs,
    });
  }

  const fileName = await generateImageFileName(`${platform}_${prompt}`, generationSessionId, generationClinicId);

  return { imageBase64, fileName };
}

// ─── 기본 이미지 프롬프트 (DB 미조회 시 폴백) ───

function buildDefaultImagePrompt(prompt: string): string {
  return `치과 블로그에 사용할 고품질 이미지를 생성하세요.

## 스타일 가이드
- 깔끔하고 전문적인 느낌
- 밝고 친근한 색감 (하얀색, 하늘색, 민트색 계열)
- 치과 관련 의료 이미지
- 홍보 문구나 텍스트를 이미지에 넣지 마세요
- 사실적인 일러스트 또는 3D 렌더링 스타일

## 이미지 설명
${prompt}`;
}

// ─── 본문의 모든 이미지 마커에서 이미지 일괄 생성 ───

export async function generateImagesFromMarkers(
  markers: ImageMarker[],
  imageStyle?: ImageStyleOption,
  referenceImageBase64?: string,
): Promise<GeneratedImageMeta[]> {
  const results: GeneratedImageMeta[] = [];

  for (const marker of markers) {
    try {
      const { imageBase64, fileName } = await generateBlogImage(marker.prompt, imageStyle, referenceImageBase64);

      results.push({
        fileName,
        prompt: marker.prompt,
        // base64는 발행 시 임시 파일로 저장하여 사용
        path: `data:image/png;base64,${imageBase64}`,
      });
    } catch (error) {
      console.error(`[ImageGen] 이미지 생성 실패: "${marker.prompt}"`, error);
      // 실패 시 건너뛰고 계속 진행
    }
  }

  return results;
}

// ─── Gemini 3.0 Flash API 호출 ───

interface GeminiResult {
  imageBase64: string;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

async function generateImageWithGemini(
  prompt: string,
  imageStyle?: ImageStyleOption,
  referenceImageBase64?: string,
): Promise<GeminiResult> {
  try {
    // 참조 이미지가 있는 경우 (use_own_image 모드) 멀티모달 입력
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let contents: any;
    if (imageStyle === 'use_own_image' && referenceImageBase64) {
      contents = [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: referenceImageBase64,
              },
            },
            { text: prompt },
          ],
        },
      ];
    } else {
      contents = prompt;
    }

    const response = await genai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents,
      config: {
        responseModalities: ['image', 'text'],
      },
    });

    // 응답에서 이미지 파트 추출
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      throw new Error('이미지 생성 응답이 비어있습니다');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usageMetadata = (response as any).usageMetadata as GeminiResult['usageMetadata'];

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return { imageBase64: part.inlineData.data || '', usageMetadata };
      }
    }

    throw new Error('응답에 이미지가 포함되지 않았습니다');
  } catch (error) {
    console.error('[ImageGen] Gemini API 오류:', error);
    throw error;
  }
}

// ─── 한글 파일명 생성 (Claude Haiku) ───

export async function generateImageFileName(
  prompt: string,
  generationSessionId?: string,
  generationClinicId?: string,
): Promise<string> {
  const haikuStart = Date.now();
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 50,
      messages: [
        {
          role: 'user',
          content: `이미지 프롬프트를 보고 한글 파일명을 만들어주세요.
규칙:
- 핵심 내용 2~4단어
- 띄어쓰기 대신 언더스코어(_)
- 확장자 제외
- 예: "임플란트_시술과정", "스케일링_전후비교"

프롬프트: ${prompt}
파일명:`,
        },
      ],
    });

    const haikuDurationMs = Date.now() - haikuStart;

    if (generationSessionId && generationClinicId) {
      logApiUsage({
        clinicId: generationClinicId,
        generationSessionId,
        apiProvider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        callType: 'filename_generation',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
        success: true,
        durationMs: haikuDurationMs,
      });
    }

    const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '';
    // 파일명 정리 (특수문자 제거, .png 추가)
    const cleanName = text
      .replace(/[^\w가-힣_]/g, '')
      .replace(/^_+|_+$/g, '')
      || '이미지';

    return `${cleanName}.png`;
  } catch (error) {
    console.error('[ImageGen] 파일명 생성 실패:', error);
    // 폴백: 타임스탬프 기반 파일명
    return `치과_이미지_${Date.now()}.png`;
  }
}

// ─── base64 이미지를 Buffer로 변환 ───

export function base64ToBuffer(base64: string): Buffer {
  // data:image/png;base64, 접두사 제거
  const cleanBase64 = base64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(cleanBase64, 'base64');
}

// ─── 이미지를 임시 파일로 저장 ───

export async function saveImageToTempFile(
  base64: string,
  fileName: string
): Promise<string> {
  const fs = await import('fs/promises');
  const path = await import('path');
  const os = await import('os');

  const tempDir = path.join(os.tmpdir(), 'marketing-images');
  await fs.mkdir(tempDir, { recursive: true });

  const filePath = path.join(tempDir, fileName);
  const buffer = base64ToBuffer(base64);
  await fs.writeFile(filePath, buffer);

  return filePath;
}
