// ============================================
// 개인사업자 예상 세금 계산 유틸 (2025 기준)
// - 올해 누적 순이익을 과세표준으로 간주하여 종합소득세·지방소득세 추정
// - clinic_tax_settings(표준 구성 B) 값으로 공제 반영
// ============================================

import type { ClinicTaxSettings } from '@/types/financial';

// 2025 종합소득세 세율표 (과세표준 한도, 세율, 누진공제)
const INCOME_TAX_BRACKETS: Array<{ limit: number; rate: number; deduction: number }> = [
  { limit: 14_000_000, rate: 0.06, deduction: 0 },
  { limit: 50_000_000, rate: 0.15, deduction: 1_260_000 },
  { limit: 88_000_000, rate: 0.24, deduction: 5_760_000 },
  { limit: 150_000_000, rate: 0.35, deduction: 15_440_000 },
  { limit: 300_000_000, rate: 0.38, deduction: 19_940_000 },
  { limit: 500_000_000, rate: 0.40, deduction: 25_940_000 },
  { limit: 1_000_000_000, rate: 0.42, deduction: 35_940_000 },
  { limit: Number.POSITIVE_INFINITY, rate: 0.45, deduction: 65_940_000 },
];

const BASIC_DEDUCTION_PER_PERSON = 1_500_000; // 본인/부양가족 1인당
const SPOUSE_DEDUCTION = 1_500_000;
const NORANUMBRELLA_ANNUAL_CAP = 6_000_000;
const BOOKKEEPING_TAX_CREDIT_RATE = 0.2; // 복식부기 기장세액공제 20%
const BOOKKEEPING_TAX_CREDIT_CAP = 1_000_000;
const STANDARD_TAX_CREDIT = 70_000;
const LOCAL_INCOME_TAX_RATE = 0.10;

export interface TaxEstimateResult {
  ytd_net_income: number;
  estimated_taxable_income: number;
  estimated_income_tax: number;
  estimated_local_tax: number;
  estimated_total_tax: number;
  estimated_post_tax_profit: number;
  elapsed_months: number;
}

export const DEFAULT_TAX_SETTINGS: ClinicTaxSettings = {
  clinic_id: '',
  business_type: 'individual',
  bookkeeping_type: 'double',
  dependent_count: 1,
  spouse_deduction: false,
  apply_standard_deduction: true,
  noranumbrella_monthly: 0,
  national_pension_monthly: 0,
  health_insurance_monthly: 0,
};

function calcIncomeTax(taxable: number): number {
  if (taxable <= 0) return 0;
  const bracket = INCOME_TAX_BRACKETS.find(b => taxable <= b.limit)!;
  return Math.max(0, taxable * bracket.rate - bracket.deduction);
}

/**
 * 올해 누적 순이익 기준 예상 세금(종합소득세 + 지방소득세) 계산
 * @param ytdNetIncome 올해 1월 ~ 조회 기준월까지 누적 순이익(수입 - 지출)
 * @param settings 병원 세무 설정
 * @param elapsedMonths 올해 경과 월 수 (1~12). 공제 연환산에 사용.
 *                     예: 4월 조회 시 4. 설정의 월 납부액 × 경과월 → 공제 추정.
 */
export function estimateTax(
  ytdNetIncome: number,
  settings: ClinicTaxSettings | null | undefined,
  elapsedMonths: number
): TaxEstimateResult {
  const s = settings ?? DEFAULT_TAX_SETTINGS;
  const months = Math.max(1, Math.min(12, Math.round(elapsedMonths)));

  const basicDed = s.dependent_count * BASIC_DEDUCTION_PER_PERSON;
  const spouseDed = s.spouse_deduction ? SPOUSE_DEDUCTION : 0;
  const pensionDed = s.national_pension_monthly * months;
  const healthDed = s.health_insurance_monthly * months;
  const noraDed = Math.min(s.noranumbrella_monthly * months, NORANUMBRELLA_ANNUAL_CAP);

  const totalDeduction = basicDed + spouseDed + pensionDed + healthDed + noraDed;
  const taxable = Math.max(0, ytdNetIncome - totalDeduction);

  let incomeTax = calcIncomeTax(taxable);

  if (s.bookkeeping_type === 'double') {
    incomeTax -= Math.min(incomeTax * BOOKKEEPING_TAX_CREDIT_RATE, BOOKKEEPING_TAX_CREDIT_CAP);
  }
  if (s.apply_standard_deduction) {
    incomeTax -= STANDARD_TAX_CREDIT;
  }
  incomeTax = Math.max(0, Math.round(incomeTax));

  const localTax = Math.round(incomeTax * LOCAL_INCOME_TAX_RATE);
  const totalTax = incomeTax + localTax;

  return {
    ytd_net_income: Math.round(ytdNetIncome),
    estimated_taxable_income: Math.round(taxable),
    estimated_income_tax: incomeTax,
    estimated_local_tax: localTax,
    estimated_total_tax: totalTax,
    estimated_post_tax_profit: Math.round(ytdNetIncome - totalTax),
    elapsed_months: months,
  };
}
