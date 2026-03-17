import Anthropic from '@anthropic-ai/sdk';
import type { ThreadsContent, GeneratedImageMeta } from '@/types/marketing';

// ============================================
// 블로그 → 쓰레드 변환 어댑터
// 핵심 한 줄 + 호기심 유발 + 블로그 링크
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function transformToThreads(
  title: string,
  body: string,
  blogUrl: string,
  images: GeneratedImageMeta[]
): Promise<ThreadsContent> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `네이버 블로그 글을 쓰레드 포스트로 변환하세요.

## 규칙
- 500자 이내
- 첫 줄에 호기심 유발 (질문 또는 놀라운 사실)
- 짧고 임팩트 있는 문장
- 마지막에 블로그 링크 유도

## 출력: 텍스트만 (JSON 아님)

## 원본
제목: ${title}
본문: ${body.slice(0, 1500)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : title;

  return {
    text: text.slice(0, 500),
    image: images.length > 0 ? images[0] : undefined,
    link: blogUrl,
  };
}
