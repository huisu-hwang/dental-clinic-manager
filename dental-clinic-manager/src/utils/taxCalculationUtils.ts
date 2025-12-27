/**
 * 근로소득세 간이세액표 기반 세금 계산 유틸리티
 *
 * 참고: 국세청 근로소득 간이세액표 (2024년 3월 개정)
 * - 소득세: 간이세액표에서 조회
 * - 지방소득세: 소득세의 10%
 */

import type { TaxLookupParams } from '@/types/payroll'

// =====================================================================
// 간이세액표 데이터 (2024년 개정 기준)
// 월급여 구간별, 공제대상 가족수별 세액 (단위: 원)
// =====================================================================

// 간이세액표 구조: 월급여 범위 -> 가족수별 세액
// 가족수: 1명(본인만), 2명, 3명, 4명, 5명, 6명, 7명, 8명, 9명, 10명, 11명 이상

interface TaxTableEntry {
  minSalary: number
  maxSalary: number
  taxByFamily: number[]  // index 0 = 1인, index 1 = 2인, ...
}

// 근로소득 간이세액표 (주요 구간, 실제 사용되는 범위)
// 실제 간이세액표는 매우 상세하므로 주요 구간만 포함하고 보간법 사용
const SIMPLIFIED_TAX_TABLE: TaxTableEntry[] = [
  // 106만원 이하: 세금 0원
  { minSalary: 0, maxSalary: 1060000, taxByFamily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },

  // 106만원 ~ 150만원
  { minSalary: 1060001, maxSalary: 1500000, taxByFamily: [7040, 2970, 1010, 0, 0, 0, 0, 0, 0, 0, 0] },

  // 150만원 ~ 200만원
  { minSalary: 1500001, maxSalary: 2000000, taxByFamily: [25690, 17570, 11660, 5930, 1810, 0, 0, 0, 0, 0, 0] },

  // 200만원 ~ 250만원
  { minSalary: 2000001, maxSalary: 2500000, taxByFamily: [49250, 37440, 28470, 19670, 12150, 5020, 0, 0, 0, 0, 0] },

  // 250만원 ~ 300만원
  { minSalary: 2500001, maxSalary: 3000000, taxByFamily: [77340, 62800, 51070, 40440, 30040, 20660, 11510, 3200, 0, 0, 0] },

  // 300만원 ~ 350만원
  { minSalary: 3000001, maxSalary: 3500000, taxByFamily: [109330, 92030, 77670, 64980, 53080, 41480, 30150, 19690, 9530, 0, 0] },

  // 350만원 ~ 400만원 (이미지 예시 범위)
  { minSalary: 3500001, maxSalary: 4000000, taxByFamily: [145790, 125190, 107800, 92030, 77940, 64440, 51540, 39340, 27780, 16770, 6060] },

  // 400만원 ~ 450만원
  { minSalary: 4000001, maxSalary: 4500000, taxByFamily: [186180, 161650, 141490, 122700, 106010, 90610, 76090, 62180, 48900, 36310, 24390] },

  // 450만원 ~ 500만원
  { minSalary: 4500001, maxSalary: 5000000, taxByFamily: [230800, 201920, 178380, 156160, 136850, 119240, 103000, 87570, 72740, 58600, 45140] },

  // 500만원 ~ 600만원
  { minSalary: 5000001, maxSalary: 6000000, taxByFamily: [289750, 255870, 227100, 201000, 177780, 156580, 137580, 119650, 102810, 86660, 71290] },

  // 600만원 ~ 700만원
  { minSalary: 6000001, maxSalary: 7000000, taxByFamily: [370400, 331730, 297370, 266500, 238040, 212030, 188170, 166040, 145480, 125820, 107150] },

  // 700만원 ~ 800만원
  { minSalary: 7000001, maxSalary: 8000000, taxByFamily: [461680, 418580, 379660, 344020, 310940, 280480, 252030, 225460, 200490, 176690, 153940] },

  // 800만원 ~ 1000만원
  { minSalary: 8000001, maxSalary: 10000000, taxByFamily: [582850, 534190, 489970, 449160, 411180, 375780, 342610, 311340, 281790, 253620, 226830] },

  // 1000만원 초과
  { minSalary: 10000001, maxSalary: Infinity, taxByFamily: [815750, 756590, 702410, 652660, 606260, 562480, 520940, 481510, 443930, 407990, 373600] },
]

// =====================================================================
// 상세 세액표 (350만원 ~ 400만원 구간 상세, 이미지 검증용)
// =====================================================================

// 이미지 기준: 과세 소득 약 355만원, 부양가족 1명(본인) -> 소득세 약 132,110원
// 세부 구간 데이터 (5만원 단위)
const DETAILED_TAX_TABLE_350_400: { [key: number]: number[] } = {
  3500000: [145790, 125190, 107800, 92030, 77940, 64440, 51540, 39340, 27780, 16770, 6060],
  3520000: [147930, 127050, 109430, 93470, 79190, 65530, 52490, 40150, 28460, 17310, 6480],
  3540000: [150070, 128910, 111060, 94910, 80440, 66620, 53440, 40960, 29140, 17850, 6900],
  3560000: [152210, 130770, 112690, 96350, 81690, 67710, 54390, 41770, 29820, 18390, 7320],
  3580000: [154350, 132630, 114320, 97790, 82940, 68800, 55340, 42580, 30500, 18930, 7740],
  3600000: [156490, 134490, 115950, 99230, 84190, 69890, 56290, 43390, 31180, 19470, 8160],
  3620000: [158630, 136350, 117580, 100670, 85440, 70980, 57240, 44200, 31860, 20010, 8580],
  3640000: [160770, 138210, 119210, 102110, 86690, 72070, 58190, 45010, 32540, 20550, 9000],
  3660000: [162910, 140070, 120840, 103550, 87940, 73160, 59140, 45820, 33220, 21090, 9420],
  3680000: [165050, 141930, 122470, 104990, 89190, 74250, 60090, 46630, 33900, 21630, 9840],
  3700000: [167190, 143790, 124100, 106430, 90440, 75340, 61040, 47440, 34580, 22170, 10260],
  3720000: [169330, 145650, 125730, 107870, 91690, 76430, 61990, 48250, 35260, 22710, 10680],
  3740000: [171470, 147510, 127360, 109310, 92940, 77520, 62940, 49060, 35940, 23250, 11100],
  3760000: [173610, 149370, 128990, 110750, 94190, 78610, 63890, 49870, 36620, 23790, 11520],
  3780000: [175750, 151230, 130620, 112190, 95440, 79700, 64840, 50680, 37300, 24330, 11940],
  3800000: [177890, 153090, 132250, 113630, 96690, 80790, 65790, 51490, 37980, 24870, 12360],
  3820000: [180030, 154950, 133880, 115070, 97940, 81880, 66740, 52300, 38660, 25410, 12780],
  3840000: [182170, 156810, 135510, 116510, 99190, 82970, 67690, 53110, 39340, 25950, 13200],
  3860000: [184310, 158670, 137140, 117950, 100440, 84060, 68640, 53920, 40020, 26490, 13620],
  3880000: [186450, 160530, 138770, 119390, 101690, 85150, 69590, 54730, 40700, 27030, 14040],
  3900000: [188590, 162390, 140400, 120830, 102940, 86240, 70540, 55540, 41380, 27570, 14460],
  3920000: [190730, 164250, 142030, 122270, 104190, 87330, 71490, 56350, 42060, 28110, 14880],
  3940000: [192870, 166110, 143660, 123710, 105440, 88420, 72440, 57160, 42740, 28650, 15300],
  3960000: [195010, 167970, 145290, 125150, 106690, 89510, 73390, 57970, 43420, 29190, 15720],
  3980000: [197150, 169830, 146920, 126590, 107940, 90600, 74340, 58780, 44100, 29730, 16140],
  4000000: [199290, 171690, 148550, 128030, 109190, 91690, 75290, 59590, 44780, 30270, 16560],
}

// =====================================================================
// 자녀 세액 공제 (8세 이상 20세 이하)
// =====================================================================

function getChildDeduction(childCount: number): number {
  if (childCount === 0) return 0
  if (childCount === 1) return 12500
  if (childCount === 2) return 29160
  // 3명 이상: 29,160원 + (2명 초과분 × 25,000원)
  return 29160 + (childCount - 2) * 25000
}

// =====================================================================
// 간이세액표 기반 소득세 계산
// =====================================================================

/**
 * 월 급여와 가족수에 따른 소득세 계산
 * @param params 세금 조회 파라미터
 * @returns 소득세 금액 (원)
 */
export function calculateIncomeTax(params: TaxLookupParams): number {
  const { monthlyIncome, familyCount, childCount } = params

  // 가족수는 1~11 범위로 제한
  const effectiveFamilyCount = Math.min(Math.max(familyCount, 1), 11)
  const familyIndex = effectiveFamilyCount - 1

  // 먼저 상세 테이블에서 찾기 (350만원~400만원 구간)
  if (monthlyIncome >= 3500000 && monthlyIncome <= 4000000) {
    // 가장 가까운 하위 구간 찾기
    const roundedIncome = Math.floor(monthlyIncome / 20000) * 20000
    const keys = Object.keys(DETAILED_TAX_TABLE_350_400).map(Number).sort((a, b) => a - b)

    let lowerKey = keys[0]
    let upperKey = keys[0]

    for (let i = 0; i < keys.length; i++) {
      if (keys[i] <= roundedIncome) {
        lowerKey = keys[i]
        upperKey = keys[i + 1] || keys[i]
      } else {
        break
      }
    }

    // 선형 보간
    const lowerTax = DETAILED_TAX_TABLE_350_400[lowerKey]?.[familyIndex] || 0
    const upperTax = DETAILED_TAX_TABLE_350_400[upperKey]?.[familyIndex] || lowerTax

    let tax: number
    if (lowerKey === upperKey) {
      tax = lowerTax
    } else {
      const ratio = (roundedIncome - lowerKey) / (upperKey - lowerKey)
      tax = Math.round(lowerTax + (upperTax - lowerTax) * ratio)
    }

    // 자녀 공제 적용
    const childDeduction = getChildDeduction(childCount)
    tax = Math.max(0, tax - childDeduction)

    return tax
  }

  // 간이세액표에서 해당 구간 찾기
  let baseTax = 0

  for (const entry of SIMPLIFIED_TAX_TABLE) {
    if (monthlyIncome >= entry.minSalary && monthlyIncome <= entry.maxSalary) {
      baseTax = entry.taxByFamily[familyIndex]

      // 구간 내 보간 (선형 근사)
      if (monthlyIncome > entry.minSalary && monthlyIncome < entry.maxSalary) {
        const currentIndex = SIMPLIFIED_TAX_TABLE.indexOf(entry)
        const nextEntry = SIMPLIFIED_TAX_TABLE[currentIndex + 1]

        if (nextEntry) {
          const ratio = (monthlyIncome - entry.minSalary) / (entry.maxSalary - entry.minSalary)
          const nextTax = nextEntry.taxByFamily[familyIndex]
          baseTax = Math.round(baseTax + (nextTax - baseTax) * ratio * 0.5)
        }
      }
      break
    }
  }

  // 자녀 공제 적용
  const childDeduction = getChildDeduction(childCount)
  const finalTax = Math.max(0, baseTax - childDeduction)

  return finalTax
}

/**
 * 지방소득세 계산 (소득세의 10%)
 * @param incomeTax 소득세 금액
 * @returns 지방소득세 금액 (원)
 */
export function calculateLocalIncomeTax(incomeTax: number): number {
  return Math.round(incomeTax * 0.1)
}

/**
 * 소득세 + 지방소득세 총액 계산
 */
export function calculateTotalTax(params: TaxLookupParams): {
  incomeTax: number
  localIncomeTax: number
  totalTax: number
} {
  const incomeTax = calculateIncomeTax(params)
  const localIncomeTax = calculateLocalIncomeTax(incomeTax)

  return {
    incomeTax,
    localIncomeTax,
    totalTax: incomeTax + localIncomeTax
  }
}

// =====================================================================
// 역산 계산 (세후 금액에서 세전 금액 계산)
// =====================================================================

/**
 * 세후 실수령액에서 세전 급여를 역산
 * 이진 탐색 방식 사용
 *
 * @param targetNetPay 목표 실수령액
 * @param insuranceDeductions 4대보험 공제 합계
 * @param nonTaxableAmount 비과세 금액
 * @param familyCount 부양가족 수
 * @param childCount 자녀 수
 * @param otherDeductions 기타 공제액
 * @returns 필요한 세전 급여 (지급액계)
 */
export function calculateGrossFromNet(
  targetNetPay: number,
  insuranceDeductions: number,
  nonTaxableAmount: number,
  familyCount: number,
  childCount: number,
  otherDeductions: number = 0
): {
  grossPay: number
  baseSalary: number
  incomeTax: number
  localIncomeTax: number
  totalDeduction: number
} {
  // 초기 추정값 설정
  let low = targetNetPay
  let high = targetNetPay * 2
  let result = targetNetPay + insuranceDeductions + otherDeductions

  // 이진 탐색으로 세전 급여 찾기
  for (let i = 0; i < 50; i++) {
    const mid = Math.floor((low + high) / 2)

    // 과세 소득 계산 (비과세 제외)
    const taxableIncome = mid - nonTaxableAmount

    // 소득세 계산
    const { incomeTax, localIncomeTax } = calculateTotalTax({
      monthlyIncome: taxableIncome,
      familyCount,
      childCount
    })

    // 총 공제액
    const totalDeduction = insuranceDeductions + incomeTax + localIncomeTax + otherDeductions

    // 실수령액
    const netPay = mid - totalDeduction

    if (Math.abs(netPay - targetNetPay) < 10) {
      // 충분히 가까우면 종료
      result = mid
      break
    }

    if (netPay < targetNetPay) {
      low = mid
    } else {
      high = mid
    }

    result = mid
  }

  // 최종 결과 계산
  const taxableIncome = result - nonTaxableAmount
  const { incomeTax, localIncomeTax } = calculateTotalTax({
    monthlyIncome: taxableIncome,
    familyCount,
    childCount
  })
  const totalDeduction = insuranceDeductions + incomeTax + localIncomeTax + otherDeductions

  return {
    grossPay: result,
    baseSalary: result - nonTaxableAmount, // 기본급 (비과세 제외)
    incomeTax,
    localIncomeTax,
    totalDeduction
  }
}

// =====================================================================
// 세전 급여에서 세후 실수령액 계산
// =====================================================================

/**
 * 세전 급여에서 실수령액 계산
 *
 * @param grossPay 세전 급여 (지급액계)
 * @param insuranceDeductions 4대보험 공제 합계
 * @param nonTaxableAmount 비과세 금액
 * @param familyCount 부양가족 수
 * @param childCount 자녀 수
 * @param otherDeductions 기타 공제액
 * @returns 실수령액 및 세부 내역
 */
export function calculateNetFromGross(
  grossPay: number,
  insuranceDeductions: number,
  nonTaxableAmount: number,
  familyCount: number,
  childCount: number,
  otherDeductions: number = 0
): {
  netPay: number
  incomeTax: number
  localIncomeTax: number
  totalDeduction: number
  taxableIncome: number
} {
  // 과세 소득 계산 (비과세 제외)
  const taxableIncome = grossPay - nonTaxableAmount

  // 소득세 계산
  const { incomeTax, localIncomeTax } = calculateTotalTax({
    monthlyIncome: taxableIncome,
    familyCount,
    childCount
  })

  // 총 공제액
  const totalDeduction = insuranceDeductions + incomeTax + localIncomeTax + otherDeductions

  // 실수령액
  const netPay = grossPay - totalDeduction

  return {
    netPay,
    incomeTax,
    localIncomeTax,
    totalDeduction,
    taxableIncome
  }
}

// =====================================================================
// 4대보험 요율 (2024년 기준, 근로자 부담분)
// =====================================================================

export const INSURANCE_RATES = {
  nationalPension: 0.045,       // 국민연금 4.5%
  healthInsurance: 0.03545,     // 건강보험 3.545%
  longTermCare: 0.1295,         // 장기요양보험 건강보험의 12.95%
  employmentInsurance: 0.009,   // 고용보험 0.9%
}

/**
 * 4대보험료 추정 계산 (월 급여 기준)
 * 주의: 실제 보험료는 1월에 결정되어 연말까지 고정되므로 참고용
 */
export function estimateInsurance(monthlyGrossPay: number): {
  nationalPension: number
  healthInsurance: number
  longTermCare: number
  employmentInsurance: number
  total: number
} {
  const nationalPension = Math.round(monthlyGrossPay * INSURANCE_RATES.nationalPension)
  const healthInsurance = Math.round(monthlyGrossPay * INSURANCE_RATES.healthInsurance)
  const longTermCare = Math.round(healthInsurance * INSURANCE_RATES.longTermCare)
  const employmentInsurance = Math.round(monthlyGrossPay * INSURANCE_RATES.employmentInsurance)

  return {
    nationalPension,
    healthInsurance,
    longTermCare,
    employmentInsurance,
    total: nationalPension + healthInsurance + longTermCare + employmentInsurance
  }
}

// =====================================================================
// 금액 포맷팅 유틸리티
// =====================================================================

/**
 * 금액을 한국 원화 형식으로 포맷
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ko-KR').format(amount)
}

/**
 * 금액 + 원 표시
 */
export function formatKRW(amount: number): string {
  return formatCurrency(amount) + '원'
}
