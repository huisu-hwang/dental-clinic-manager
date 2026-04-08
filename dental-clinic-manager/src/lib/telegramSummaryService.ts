// 텔레그램 메시지 AI 요약 서비스 (Google Gemini)
import { GoogleGenAI } from '@google/genai'

export async function generateDailySummary(
  messages: { sender_name: string; message_text: string | null; message_type: string; telegram_date: string }[],
  groupTitle: string,
  summaryDate: string
): Promise<{ title: string; content: string; topicCount: number; messageCount: number }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }

  const genAI = new GoogleGenAI({ apiKey })

  // 1. telegram_date 오름차순 정렬
  const sorted = [...messages].sort((a, b) =>
    new Date(a.telegram_date).getTime() - new Date(b.telegram_date).getTime()
  )

  // 2. 대화 텍스트 구성: [HH:MM] senderName: text or [messageType] (KST 시간)
  const kstOffsetMs = 9 * 60 * 60 * 1000
  const conversationLines = sorted.map(msg => {
    const kstDate = new Date(new Date(msg.telegram_date).getTime() + kstOffsetMs)
    const hh = String(kstDate.getUTCHours()).padStart(2, '0')
    const mm = String(kstDate.getUTCMinutes()).padStart(2, '0')
    const timeStr = `[${hh}:${mm}]`
    const body = msg.message_text ? msg.message_text : `[${msg.message_type}]`
    return `${timeStr} ${msg.sender_name}: ${body}`
  })

  const conversationText = conversationLines.join('\n')

  // 3. Gemini 프롬프트 (한국어, 간결 요약)
  const prompt = `다음은 텔레그램 그룹 "${groupTitle}"의 ${summaryDate} 대화 내용입니다.

---
${conversationText}
---

위 대화를 아래 지침에 따라 **간결하게** 요약해주세요:

1. 대화를 주제별로 분류하되, 유사한 주제는 하나로 통합하세요.
2. 각 주제에는 핵심을 한눈에 알 수 있는 짧은 제목을 붙이세요.
3. 각 주제별 핵심 포인트를 1~2줄 이내의 짧은 문장으로 나열하세요. 불필요한 배경 설명이나 맥락은 생략합니다.
4. 단순 인사, 감사 표현, 맞장구 등 정보 가치가 없는 대화는 요약에서 제외하세요.
5. 결론이나 합의 사항이 있으면 해당 주제의 마지막 항목에 "→ 결론:" 접두어를 붙여 표시하세요.
6. 참여자 이름은 핵심 발언자만 포함하고, 개인 정보(전화번호, 주소 등)는 제외하세요.
7. 전체 요약 분량은 주제 수와 관계없이 최대 15개 항목(li) 이내로 제한하세요.

출력 형식은 반드시 순수 HTML만 사용하세요:
- 각 주제: <h3> 태그
- 핵심 포인트: <ul><li> 태그 (한 항목당 1~2줄)
- 마크다운, 코드 블록, <p> 태그 사용 금지`

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.3,
    },
  })

  const htmlContent = response.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    .map(p => p.text)
    .join('\n') ?? ''

  // 4. h3 태그 개수로 주제 수 계산
  const topicCount = (htmlContent.match(/<h3/gi) ?? []).length

  return {
    title: `[일일 요약] ${groupTitle} - ${summaryDate}`,
    content: htmlContent,
    topicCount,
    messageCount: messages.length,
  }
}
