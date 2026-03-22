import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@/lib/supabase/server';
import { seedDefaultPromptsIfNeeded } from './seed-prompts';
import type { GeneratedImageMeta, ImageMarker, ImageStyleOption } from '@/types/marketing';

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

// ─── 마스터가 설정한 이미지 프롬프트 로딩 ───

async function loadImagePromptTemplate(clinicId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('marketing_prompts')
    .select('system_prompt')
    .eq('clinic_id', clinicId)
    .eq('prompt_key', 'image.blog')
    .eq('is_active', true)
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (!data) {
    // 기본 프롬프트 시드 후 재시도
    const seeded = await seedDefaultPromptsIfNeeded(clinicId);
    if (seeded) {
      const { data: retryData } = await supabase
        .from('marketing_prompts')
        .select('system_prompt')
        .eq('clinic_id', clinicId)
        .eq('prompt_key', 'image.blog')
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
): Promise<{
  imageBase64: string;
  fileName: string;
}> {
  // 마스터 이미지 프롬프트 템플릿 적용
  let fullPrompt: string;

  if (customSystemPrompt) {
    // 테스트 모드: 마스터가 편집 중인 미저장 프롬프트 사용
    fullPrompt = customSystemPrompt.replaceAll('{{image_prompt}}', prompt);
  } else if (clinicId) {
    // 실제 생성: DB에서 마스터 설정 프롬프트 로딩
    const template = await loadImagePromptTemplate(clinicId);
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

  // 1. Gemini로 이미지 생성
  const imageBase64 = await generateImageWithGemini(fullPrompt, imageStyle, referenceImageBase64);

  // 2. 한글 파일명 생성
  const fileName = await generateImageFileName(prompt);

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

async function generateImageWithGemini(
  prompt: string,
  imageStyle?: ImageStyleOption,
  referenceImageBase64?: string,
): Promise<string> {
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

    for (const part of parts) {
      if (part.inlineData?.mimeType?.startsWith('image/')) {
        return part.inlineData.data || '';
      }
    }

    throw new Error('응답에 이미지가 포함되지 않았습니다');
  } catch (error) {
    console.error('[ImageGen] Gemini API 오류:', error);
    throw error;
  }
}

// ─── 한글 파일명 생성 (Claude Haiku) ───

export async function generateImageFileName(prompt: string): Promise<string> {
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
