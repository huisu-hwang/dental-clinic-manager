import Anthropic from '@anthropic-ai/sdk';
import type { InstagramContent, GeneratedImageMeta } from '@/types/marketing';

// ============================================
// 블로그 → 인스타그램 변환 어댑터
// 300~500자 요약 + 캐러셀 + 해시태그 15~20개
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function transformToInstagram(
  title: string,
  body: string,
  keyword: string,
  images: GeneratedImageMeta[]
): Promise<InstagramContent> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `네이버 블로그 글을 인스타그램 캡션으로 변환하세요.

## 규칙
- 300~500자로 요약
- 핵심 포인트 3~5개를 불릿(•)으로 정리
- 첫 줄은 호기심을 끄는 문장
- 마지막에 "자세한 내용은 프로필 링크에서 확인하세요!" CTA
- 해시태그 15~20개 (관련 키워드 + 치과 일반 태그)

## 출력 형식 (JSON만)
{
  "caption": "캡션 본문 (해시태그 제외)",
  "hashtags": ["태그1", "태그2", ...]
}

## 원본
제목: ${title}
키워드: ${keyword}
본문: ${body.slice(0, 2000)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

  let parsed: { caption: string; hashtags: string[] };
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { caption: title, hashtags: [keyword] };
  } catch {
    parsed = { caption: title, hashtags: [keyword] };
  }

  return {
    caption: parsed.caption,
    images: images.map((img) => ({ ...img, width: 1080, height: 1080 })),
    hashtags: parsed.hashtags.slice(0, 20),
    location: '하얀치과',
  };
}
