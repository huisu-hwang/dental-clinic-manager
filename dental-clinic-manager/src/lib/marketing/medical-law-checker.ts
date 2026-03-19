import type { MedicalLawCheckResult } from '@/types/marketing';

// ============================================
// 의료법 자동 검증
// 치과 블로그 글이 대한민국 의료법을 준수하는지 검증
// ============================================

// 금지 표현 목록
const FORBIDDEN_EXPRESSIONS = [
  '최고', '최초', '유일', '100%', '보장', '완벽', '확실',
  '절대', '완치', '기적', '혁신적', '획기적', '독보적',
];

// 결과 보장 표현
const GUARANTEED_RESULT_PATTERNS = [
  '반드시', '확실히', '무조건', '틀림없이', '장담',
  '완벽하게', '100% 만족', '실패 없',
];

// 과장 광고 패턴
const EXAGGERATION_PATTERNS = [
  '국내 최', '세계 최', '업계 최', '대한민국 1', '아시아 최',
  '누구나 만족', '모든 환자', '어떤 경우에도',
];

// 비용 비교 패턴
const PRICE_COMPARISON_PATTERNS = [
  '타 병원', '다른 병원', '경쟁 병원', '보다 저렴', '보다 싸',
  '가장 저렴', '최저가', '파격 할인',
];

// 상업 금지 키워드 (네이버 SEO + 의료법 겸용)
const COMMERCIAL_KEYWORDS = [
  '후기', '효과', '효능', '추천', '최저', '최대', '최고',
  '체험', '제일', '저렴한곳', '무료', '공짜', '1위',
];

// 면책 문구
const DISCLAIMER_TEXT = '개인마다 치아 상태와 치료 결과가 다를 수 있';
const CONSENT_TEXT = '환자분의 동의를 받아';

/**
 * 의료법 준수 검증
 */
export function checkMedicalLaw(
  content: string,
  options?: {
    isClinical?: boolean;
    hasPatientConsent?: boolean;
  }
): MedicalLawCheckResult {
  const details: string[] = [];

  // 1. 금지 표현 검사
  const forbiddenWords: { word: string; position: number }[] = [];
  for (const word of FORBIDDEN_EXPRESSIONS) {
    let idx = content.indexOf(word);
    while (idx !== -1) {
      forbiddenWords.push({ word, position: idx });
      idx = content.indexOf(word, idx + 1);
    }
  }
  if (forbiddenWords.length > 0) {
    details.push(`금지 표현 발견: ${forbiddenWords.map(w => w.word).join(', ')}`);
  }

  // 2. 과장 광고 검사
  const exaggeration = EXAGGERATION_PATTERNS.some((p) => content.includes(p));
  if (exaggeration) {
    const found = EXAGGERATION_PATTERNS.filter((p) => content.includes(p));
    details.push(`과장 광고 표현: ${found.join(', ')}`);
  }

  // 3. 결과 보장 표현 검사
  const guaranteedResult = GUARANTEED_RESULT_PATTERNS.some((p) => content.includes(p));
  if (guaranteedResult) {
    const found = GUARANTEED_RESULT_PATTERNS.filter((p) => content.includes(p));
    details.push(`결과 보장 표현: ${found.join(', ')}`);
  }

  // 4. 타 병원 비용 비교 검사
  const priceComparison = PRICE_COMPARISON_PATTERNS.some((p) => content.includes(p));
  if (priceComparison) {
    const found = PRICE_COMPARISON_PATTERNS.filter((p) => content.includes(p));
    details.push(`비용 비교 표현: ${found.join(', ')}`);
  }

  // 5. 면책 문구 존재 여부 (임상글에서 필수)
  const hasDisclaimer = content.includes(DISCLAIMER_TEXT);
  if (options?.isClinical && !hasDisclaimer) {
    details.push('임상글에 면책 문구가 필요합니다');
  }

  // 6. 환자 동의 확인 (임상글에서 필수)
  const hasConsentFlag = options?.hasPatientConsent ?? content.includes(CONSENT_TEXT);
  if (options?.isClinical && !hasConsentFlag) {
    details.push('환자 동의가 확인되지 않았습니다');
  }

  // 7. 익명화 확인 (임상글)
  const isAnonymized = !hasPersonalInfo(content);
  if (options?.isClinical && !isAnonymized) {
    details.push('개인정보가 포함되어 있을 수 있습니다');
  }

  // 종합 판정
  const passed =
    forbiddenWords.length === 0 &&
    !exaggeration &&
    !guaranteedResult &&
    !priceComparison &&
    (options?.isClinical ? hasDisclaimer && hasConsentFlag && isAnonymized : true);

  if (passed) {
    details.push('의료법 검증 통과');
  }

  return {
    forbiddenWords,
    exaggeration,
    guaranteedResult,
    priceComparison,
    hasDisclaimer,
    hasConsentFlag,
    isAnonymized,
    passed,
    details,
  };
}

/**
 * 개인정보 포함 여부 간이 검사
 */
function hasPersonalInfo(content: string): boolean {
  // 전화번호 패턴
  if (/01[0-9]-?\d{3,4}-?\d{4}/.test(content)) return true;
  // 주민번호 패턴
  if (/\d{6}-?[1-4]\d{6}/.test(content)) return true;
  // 이메일 패턴 (의도적 삽입 감지)
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(content)) return true;

  return false;
}

/**
 * 의료법 위반 항목 자동 수정 제안 생성
 */
export function suggestFixes(result: MedicalLawCheckResult, content: string): string {
  let fixed = content;

  // 금지 표현 제거/완화
  for (const { word } of result.forbiddenWords) {
    const replacements: Record<string, string> = {
      '최고': '우수한',
      '최초': '',
      '유일': '',
      '100%': '높은 확률로',
      '보장': '기대할 수 있',
      '완벽': '만족스러운',
      '확실': '기대되는',
      '완치': '개선',
    };
    fixed = fixed.replaceAll(word, replacements[word] || '');
  }

  // 면책 문구 자동 추가
  if (!result.hasDisclaimer) {
    fixed += '\n\n※ 개인마다 치아 상태와 치료 결과가 다를 수 있으며, 정확한 진단은 내원 상담을 통해 가능합니다.';
  }

  // 동의 문구 자동 추가 (임상글)
  if (!result.hasConsentFlag) {
    fixed += '\n※ 본 게시물은 환자분의 동의를 받아 작성되었습니다.';
  }

  return fixed;
}
