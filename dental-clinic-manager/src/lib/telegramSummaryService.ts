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

  // 3. Gemini 프롬프트 (한국어)
  const prompt = `다음은 텔레그램 그룹 "${groupTitle}"의 ${summaryDate} 대화 내용입니다.

---
${conversationText}
---

위 대화를 아래 지침에 따라 요약해주세요:

1. 대화를 주제별로 분류하세요.
2. 각 주제에는 명확한 제목을 붙이세요.
3. 각 주제별 핵심 내용을 3~5문장으로 요약하세요.
4. 참여자 이름은 포함하되, 개인 정보(전화번호, 주소 등)는 제외하세요.
5. 공유된 파일이나 링크가 있으면 간략히 언급하세요.
6. 결론이나 합의된 사항이 있으면 강조해서 표시하세요.

출력 형식은 반드시 HTML로 작성하세요:
- 각 주제는 <h3> 태그로 제목 표시
- 핵심 포인트는 <ul><li> 태그로 나열
- 설명이나 결론은 <p> 태그 사용
- 다른 마크다운이나 코드 블록 없이 순수 HTML만 출력하세요.`

  const response = await genAI.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      temperature: 0.7,
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
