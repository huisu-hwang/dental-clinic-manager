import Anthropic from '@anthropic-ai/sdk';
import type { FacebookContent, GeneratedImageMeta } from '@/types/marketing';

// ============================================
// 블로그 → 페이스북 변환 어댑터
// 500~800자 요약 + 블로그 링크 + 해시태그 3~5개
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function transformToFacebook(
  title: string,
  body: string,
  blogUrl: string,
  images: GeneratedImageMeta[]
): Promise<FacebookContent> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `네이버 블로그 글을 페이스북 포스트로 변환하세요.

## 규칙
- 500~800자로 요약
- 핵심 정보 위주로 간결하게
- 마지막에 "더 자세한 내용은 블로그에서 확인하세요 👇"
- 해시태그 3~5개
- 공유 유도: "도움이 되셨다면 공유해주세요!"

## 출력 형식 (JSON만)
{
  "message": "포스트 본문",
  "hashtags": ["태그1", "태그2"]
}

## 원본
제목: ${title}
본문: ${body.slice(0, 2000)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

  let parsed: { message: string; hashtags: string[] };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { message: title, hashtags: [] };
  } catch {
    parsed = { message: title, hashtags: [] };
  }

  return {
    message: parsed.message,
    link: blogUrl,
    images: images.length > 0 ? [images[0]] : undefined,
    hashtags: parsed.hashtags.slice(0, 5),
  };
}
