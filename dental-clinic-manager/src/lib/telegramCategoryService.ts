// 게시판 카테고리 AI 자동 분류 서비스 (Google Gemini)
import { GoogleGenAI } from '@google/genai'

interface ExistingCategory {
  id: string
  name: string
}

interface ClassifyResult {
  action: 'existing' | 'new'
  categoryName: string
  categoryId?: string
}

/**
 * AI로 게시글 카테고리를 자동 분류
 * - 기존 카테고리 중 매칭되면 해당 카테고리 반환
 * - 새로운 주제면 짧은 카테고리명 제안
 * - 실패 시 null 반환 (호출 측에서 "미분류" 폴백)
 */
export async function classifyPostCategory(
  title: string,
  content: string,
  existingCategories: ExistingCategory[],
  groupTitle: string
): Promise<ClassifyResult | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not configured')
    return null
  }

  const genAI = new GoogleGenAI({ apiKey })

  // HTML 태그 제거 + 500자 제한
  const plainContent = content
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)

  const categoryList = existingCategories
    .filter(c => c.name !== '미분류')
    .map(c => `- ${c.name}`)
    .join('\n')

  const prompt = `당신은 "${groupTitle}" 게시판의 게시글 분류 전문가입니다.

아래 게시글의 제목과 내용을 읽고, 적절한 카테고리로 분류해주세요.

## 게시글
제목: ${title}
내용: ${plainContent}

## 기존 카테고리 목록
${categoryList || '(아직 카테고리가 없습니다)'}

## 규칙
1. 기존 카테고리 중 적합한 것이 있으면 반드시 그것을 선택하세요.
2. 기존 카테고리에 맞지 않는 새로운 주제라면 짧고 명확한 카테고리명을 제안하세요 (2~4글자 권장, 최대 10자).
3. 카테고리명은 한국어로, 일반적이고 재사용 가능한 이름이어야 합니다.
4. "미분류"는 선택하지 마세요.

## 출력 형식 (JSON만 출력)
기존 카테고리 선택 시: {"action": "existing", "categoryName": "카테고리명"}
새 카테고리 제안 시: {"action": "new", "categoryName": "새카테고리명"}`

  try {
    const response = await genAI.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        temperature: 0.2,
        responseMimeType: 'application/json',
      },
    })

    const text = response.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      .map(p => p.text)
      .join('') ?? ''

    const parsed = JSON.parse(text)

    if (!parsed.action || !parsed.categoryName) {
      return null
    }

    // 기존 카테고리 매칭 시 ID 찾기
    if (parsed.action === 'existing') {
      const matched = existingCategories.find(
        c => c.name === parsed.categoryName
      )
      if (matched) {
        return {
          action: 'existing',
          categoryName: matched.name,
          categoryId: matched.id,
        }
      }
      // AI가 existing이라 했지만 매칭되지 않으면 유사도 체크
      const fuzzyMatch = existingCategories.find(
        c => c.name !== '미분류' && (
          c.name.includes(parsed.categoryName) ||
          parsed.categoryName.includes(c.name)
        )
      )
      if (fuzzyMatch) {
        return {
          action: 'existing',
          categoryName: fuzzyMatch.name,
          categoryId: fuzzyMatch.id,
        }
      }
      // 매칭 실패 → 새 카테고리로 전환
      return {
        action: 'new',
        categoryName: parsed.categoryName,
      }
    }

    // 새 카테고리 제안 시 기존과 유사한지 체크
    if (parsed.action === 'new') {
      const similarExisting = existingCategories.find(
        c => c.name !== '미분류' && (
          c.name.includes(parsed.categoryName) ||
          parsed.categoryName.includes(c.name)
        )
      )
      if (similarExisting) {
        return {
          action: 'existing',
          categoryName: similarExisting.name,
          categoryId: similarExisting.id,
        }
      }
      return {
        action: 'new',
        categoryName: parsed.categoryName.slice(0, 50),
      }
    }

    return null
  } catch (error) {
    console.error('AI category classification failed:', error)
    return null
  }
}
