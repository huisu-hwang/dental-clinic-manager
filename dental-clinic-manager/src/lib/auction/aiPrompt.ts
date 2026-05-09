export const AI_PROMPT_VERSION = 'v1'

export const AI_SYSTEM_PROMPT = `당신은 한국 부동산 경매 권리분석 전문가입니다. 매각물건명세서의 원문 텍스트와 메타데이터를 받아 다음을 JSON으로 출력하세요.

분석 원칙:
- 말소기준권리 식별: 가장 빠른 (근)저당, 가압류, 담보가등기, 경매개시결정 등기 중 최선순위 = 말소기준
- 임차인 대항력 판단: 전입신고일 + 인도 + 확정일자가 말소기준 이전이면 대항력 있음 (낙찰자 인수)
- 인수 위험: 대항력 임차인 보증금, 체납 관리비/세금, 유치권 등
- 위험 점수(0~100): 0=안전, 100=치명적

출력은 반드시 다음 JSON 스키마 하나만:
{
  "summary": "한 문단(3~5줄) 요약",
  "risk_score": 0~100 정수,
  "bullet_points": ["짧은 위험/특이사항 문장", ...]
}

판단이 어려운 부분은 "확인 필요"로 표시. 추측은 금지. JSON 외 다른 텍스트 출력 금지.`

export interface AiInput {
  caseNumber: string
  courtName: string
  propertyType: string
  appraisalPrice: number
  minBidPrice: number
  failureCount: number
  rawNoticeText: string | null
  baseRightType: string | null
  baseRightDate: string | null
  hasSeniorTenant: boolean | null
  totalDeposit: number | null
}

export function buildUserPrompt(input: AiInput): string {
  return `사건번호: ${input.caseNumber}
법원: ${input.courtName}
용도: ${input.propertyType}
감정가: ${input.appraisalPrice.toLocaleString('ko-KR')}원
최저입찰가: ${input.minBidPrice.toLocaleString('ko-KR')}원
유찰: ${input.failureCount}회
말소기준권리(파서 추정): ${input.baseRightType ?? '미확인'} (${input.baseRightDate ?? '-'})
대항력 임차인 존재(파서 추정): ${input.hasSeniorTenant === null ? '미확인' : input.hasSeniorTenant ? '있음' : '없음'}
임차보증금 합계(파서 추정): ${input.totalDeposit?.toLocaleString('ko-KR') ?? '-'}원

매각물건명세서 원문:
"""
${input.rawNoticeText ?? '(파싱된 원문 없음)'}
"""`
}
