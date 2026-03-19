import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import type { GeneratedImageMeta, ImageMarker } from '@/types/marketing';

// ============================================
// AI 이미지 생성 (Gemini 3.0 Flash)
// - 블로그 본문의 [IMAGE: 설명] 마커에서 이미지 생성
// - 한글 파일명 자동 생성
// ============================================

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── 블로그 이미지 생성 ───

export async function generateBlogImage(prompt: string): Promise<{
  imageBase64: string;
  fileName: string;
}> {
  // 1. 나노바나나 2로 이미지 생성
  const imageBase64 = await generateImageWithGemini(prompt);

  // 2. 한글 파일명 생성
  const fileName = await generateImageFileName(prompt);

  return { imageBase64, fileName };
}

// ─── 본문의 모든 이미지 마커에서 이미지 일괄 생성 ───

export async function generateImagesFromMarkers(
  markers: ImageMarker[]
): Promise<GeneratedImageMeta[]> {
  const results: GeneratedImageMeta[] = [];

  for (const marker of markers) {
    try {
      const { imageBase64, fileName } = await generateBlogImage(marker.prompt);

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

async function generateImageWithGemini(prompt: string): Promise<string> {
  const dentalPrompt = `치과 블로그용 고품질 이미지. 깔끔하고 전문적인 느낌, 밝고 친근한 색감. 홍보 문구나 텍스트 없이 순수 이미지만: ${prompt}`;

  try {
    const response = await genai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: dentalPrompt,
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
