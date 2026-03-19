import Anthropic from '@anthropic-ai/sdk';
import type { FactCheckResult } from '@/types/marketing';

// ============================================
// 팩트체크 기능 (옵션)
// AI가 생성한 글의 사실 주장을 검증
// ============================================

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * 블로그 글 팩트체크 실행
 * - 수치, 통계, 의학적 주장을 추출
 * - 각 주장을 검증 (verified / unverified / incorrect / outdated)
 * - 부정확한 내용에 대한 수정 제안 제공
 */
export async function factCheckContent(content: string): Promise<{
  results: FactCheckResult[];
  correctedContent: string;
}> {
  // 1. Claude로 팩트체크 실행
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `다음 치과 관련 블로그 글에서 사실 주장(수치, 통계, 의학적 주장)을 추출하고 검증하세요.

## 검증 기준
- verified: 널리 알려진 의학적 사실 또는 공신력 있는 출처로 확인 가능
- unverified: 확인할 수 없는 주장
- incorrect: 의학적으로 부정확한 정보
- outdated: 오래된 정보 (최신 가이드라인과 다름)

## 출력 형식 (반드시 JSON만 출력)
[
  {
    "claim": "검증 대상 문장",
    "verdict": "verified",
    "source": "검증 출처",
    "suggestion": "",
    "confidence": 0.9
  }
]

사실 주장이 없으면 빈 배열 []을 반환하세요.

## 블로그 글
${content}`,
      },
    ],
  });

  const responseText = response.content[0].type === 'text' ? response.content[0].text : '[]';

  // 2. JSON 파싱
  let results: FactCheckResult[] = [];
  try {
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      results = JSON.parse(jsonMatch[0]);
    }
  } catch {
    console.error('[FactCheck] JSON 파싱 실패');
    results = [];
  }

  // 3. 부정확한 내용 자동 수정
  let correctedContent = content;

  for (const result of results) {
    if (result.verdict === 'incorrect' && result.suggestion) {
      correctedContent = correctedContent.replace(result.claim, result.suggestion);
    }
    if (result.verdict === 'unverified') {
      // 단정적 표현을 완화
      const softened = result.claim
        .replace(/입니다\./g, '로 알려져 있습니다.')
        .replace(/합니다\./g, '하는 것으로 보고되고 있습니다.');
      if (softened !== result.claim) {
        correctedContent = correctedContent.replace(result.claim, softened);
      }
    }
  }

  return { results, correctedContent };
}
