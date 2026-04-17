/**
 * 치과 기본 반복 업무 템플릿 시드 데이터
 * 한국 치과의원 운영에서 데스크(접수/행정) 직원이 정기적으로 수행해야 하는 업무 목록.
 * - 법적 의무 (감염관리, 의료폐기물, 건강보험 청구, 세무 신고 등)
 * - 운영 관리 (재고, 수납, 의료기기 점검 등)
 * - 마케팅·고객관리 (리콜, 리뷰 관리, SNS 등)
 *
 * 분기별 업무는 yearly × 4(1/4/7/10월 또는 3/6/9/12월)로 변환.
 */

import type { RecurrenceType, TaskPriority } from '@/types/bulletin'

export interface DefaultTemplateSeed {
  title: string
  description: string
  priority: TaskPriority
  recurrence_type: RecurrenceType
  recurrence_weekday?: number      // weekly: 0(일)~6(토)
  recurrence_day_of_month?: number // monthly/yearly: 1~31
  recurrence_month?: number        // yearly: 1~12
}

export const DEFAULT_RECURRING_TEMPLATES: DefaultTemplateSeed[] = [
  // ============================================================
  // 주간 반복
  // ============================================================
  {
    title: '주간 예약 현황 점검',
    description: '다음 주 예약 현황 확인 및 미예약 환자 리콜 연락',
    priority: 'high',
    recurrence_type: 'weekly',
    recurrence_weekday: 5, // 금요일
  },
  {
    title: '의료폐기물 배출 관리',
    description: '의료폐기물 보관량 확인 및 위탁업체 배출 일정 관리 (폐기물관리법: 보관 7일 이내 위탁)',
    priority: 'urgent',
    recurrence_type: 'weekly',
    recurrence_weekday: 1, // 월요일
  },
  {
    title: '수납/미수금 정리',
    description: '주간 수납 현황 점검 및 미수금 환자 안내',
    priority: 'high',
    recurrence_type: 'weekly',
    recurrence_weekday: 5, // 금요일
  },
  {
    title: '소모품 재고 확인',
    description: '진료 소모품 및 사무용품 재고 확인 후 발주',
    priority: 'medium',
    recurrence_type: 'weekly',
    recurrence_weekday: 3, // 수요일
  },
  {
    title: 'SNS/블로그 콘텐츠 업로드',
    description: '치과 홍보용 SNS 게시물 작성 및 업로드',
    priority: 'medium',
    recurrence_type: 'weekly',
    recurrence_weekday: 2, // 화요일
  },

  // ============================================================
  // 월간 반복
  // ============================================================
  {
    title: '건강보험 진료비 청구',
    description: '당월 건강보험 진료분 심사평가원(HIRA) 전자 청구',
    priority: 'urgent',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 10,
  },
  {
    title: '급여 및 4대보험 처리',
    description: '직원 급여 지급 및 원천세·4대보험료 납부 처리',
    priority: 'urgent',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 25,
  },
  {
    title: '월간 매출·실적 보고',
    description: '월별 매출, 환자 수, 진료 통계 집계 후 원장 보고',
    priority: 'high',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 1,
  },
  {
    title: '리콜 환자 관리',
    description: '정기검진·스케일링 대상 환자에게 리콜 문자/전화 발송',
    priority: 'high',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 1,
  },
  {
    title: '멸균기(오토클레이브) 점검',
    description: '멸균기 생물학적 모니터링(BI test) 실시 및 기록',
    priority: 'high',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 15,
  },
  {
    title: '의료기기 정기 점검',
    description: 'X-ray 등 의료장비 작동 상태 점검 및 기록 유지',
    priority: 'high',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 15,
  },
  {
    title: '세무 자료 정리',
    description: '세금계산서·현금영수증 정리 및 세무 자료 월별 준비',
    priority: 'medium',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 28,
  },
  {
    title: '환자 만족도 리뷰 관리',
    description: '네이버·구글 리뷰 확인, 답변 작성 및 불만사항 처리',
    priority: 'medium',
    recurrence_type: 'monthly',
    recurrence_day_of_month: 1,
  },

  // ============================================================
  // 분기별 → yearly × 4
  // ============================================================

  // 부가가치세 신고 (1/4/7/10월 25일)
  {
    title: '부가가치세 신고 (1분기)',
    description: '1분기 부가가치세 확정 신고 (전년도 하반기분)',
    priority: 'urgent',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 25,
    recurrence_month: 1,
  },
  {
    title: '부가가치세 신고 (2분기)',
    description: '2분기 부가가치세 예정 신고',
    priority: 'urgent',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 25,
    recurrence_month: 4,
  },
  {
    title: '부가가치세 신고 (3분기)',
    description: '3분기 부가가치세 확정 신고 (상반기분)',
    priority: 'urgent',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 25,
    recurrence_month: 7,
  },
  {
    title: '부가가치세 신고 (4분기)',
    description: '4분기 부가가치세 예정 신고',
    priority: 'urgent',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 25,
    recurrence_month: 10,
  },

  // 감염관리 자체 점검 (3/6/9/12월 15일)
  {
    title: '감염관리 자체 점검 (1분기)',
    description: '의료관련 감염관리 체크리스트 자체 점검 및 기록 보관 (의료법 제47조)',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 3,
  },
  {
    title: '감염관리 자체 점검 (2분기)',
    description: '의료관련 감염관리 체크리스트 자체 점검 및 기록 보관',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 6,
  },
  {
    title: '감염관리 자체 점검 (3분기)',
    description: '의료관련 감염관리 체크리스트 자체 점검 및 기록 보관',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 9,
  },
  {
    title: '감염관리 자체 점검 (4분기)',
    description: '의료관련 감염관리 체크리스트 자체 점검 및 기록 보관',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 12,
  },

  // 직원 교육 (3/6/9/12월 20일)
  {
    title: '직원 교육 실시 (1분기)',
    description: '감염관리·개인정보보호·직무 교육 실시 및 기록 보관',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 20,
    recurrence_month: 3,
  },
  {
    title: '직원 교육 실시 (2분기)',
    description: '감염관리·개인정보보호·직무 교육 실시 및 기록 보관',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 20,
    recurrence_month: 6,
  },
  {
    title: '직원 교육 실시 (3분기)',
    description: '감염관리·개인정보보호·직무 교육 실시 및 기록 보관',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 20,
    recurrence_month: 9,
  },
  {
    title: '직원 교육 실시 (4분기)',
    description: '감염관리·개인정보보호·직무 교육 실시 및 기록 보관',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 20,
    recurrence_month: 12,
  },

  // 마케팅 성과 분석 (4/7/10/1월 5일)
  {
    title: '마케팅 성과 분석 (1분기)',
    description: '온라인 광고·SNS 유입 효과 분석 및 마케팅 전략 조정',
    priority: 'medium',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 5,
    recurrence_month: 4,
  },
  {
    title: '마케팅 성과 분석 (2분기)',
    description: '온라인 광고·SNS 유입 효과 분석 및 마케팅 전략 조정',
    priority: 'medium',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 5,
    recurrence_month: 7,
  },
  {
    title: '마케팅 성과 분석 (3분기)',
    description: '온라인 광고·SNS 유입 효과 분석 및 마케팅 전략 조정',
    priority: 'medium',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 5,
    recurrence_month: 10,
  },
  {
    title: '마케팅 성과 분석 (4분기)',
    description: '온라인 광고·SNS 유입 효과 분석 및 마케팅 전략 조정',
    priority: 'medium',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 5,
    recurrence_month: 1,
  },

  // ============================================================
  // 연간 반복
  // ============================================================
  {
    title: '사업장 현황 신고',
    description: '세무서에 의료업 사업장 현황 신고서 제출 (소득세법, 2/10까지)',
    priority: 'urgent',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 10,
    recurrence_month: 2,
  },
  {
    title: '종합소득세 신고',
    description: '원장 종합소득세 확정 신고 및 납부 (5/31까지)',
    priority: 'urgent',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 25,
    recurrence_month: 5,
  },
  {
    title: '의료기관 개설 신고 변경사항 확인',
    description: '관할 보건소 개설 신고 내용 변경 여부 점검',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 1,
  },
  {
    title: '의료폐기물 관리대장 보존 확인',
    description: '연간 의료폐기물 처리 기록부 점검 및 법정 보존 확인',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 10,
    recurrence_month: 1,
  },
  {
    title: '방사선 안전관리 보고',
    description: '방사선 발생장치(X-ray) 안전관리 현황 보고 (연 1회 의무)',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 3,
  },
  {
    title: '건강보험 현지조사 대비 서류 정비',
    description: '심평원 현지조사 대비 진료기록·청구 서류 점검',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 1,
    recurrence_month: 6,
  },
  {
    title: '개인정보 관리 실태 점검',
    description: '개인정보처리방침 갱신 및 파기 대상 환자정보 점검 (개인정보보호법)',
    priority: 'high',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 1,
  },
  {
    title: '직원 건강검진 관리',
    description: '직원 일반·특수 건강검진 일정 안내 및 결과 관리',
    priority: 'medium',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 1,
    recurrence_month: 4,
  },
  {
    title: '소방·안전 점검',
    description: '소방시설 자체 점검 및 안전교육 이수 (소방안전관리)',
    priority: 'medium',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 3,
  },
  {
    title: '연간 마케팅 계획 수립',
    description: '신년도 프로모션·이벤트·마케팅 연간 계획 수립',
    priority: 'medium',
    recurrence_type: 'yearly',
    recurrence_day_of_month: 15,
    recurrence_month: 12,
  },
]
