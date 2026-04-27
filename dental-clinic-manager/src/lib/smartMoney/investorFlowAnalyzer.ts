/**
 * 외국인 / 기관 매매 동향 분석기
 *
 * 입력: KRInvestorDay[] (최근 N영업일, 오래된 → 최신 또는 그 반대 모두 허용)
 * 출력: 1/5/20일 누적 + 시그널 분류 + 신뢰도
 *
 * 시그널:
 *   - foreigner_net_5d > 0 AND institution_net_5d > 0 → accumulation
 *   - 둘 다 < 0 → distribution
 *   - 그 외 → neutral
 *
 * confidence: |누적 순매수| / 평균 거래대금 비율로 정규화 (0~100)
 */

import type { KRInvestorDay } from '@/lib/kisApiService'
import type { InvestorFlowResult } from '@/types/smartMoney'

export function analyzeInvestorFlow(
  data: KRInvestorDay[]
): InvestorFlowResult | null {
  if (!data || data.length === 0) return null

  // 날짜 오름차순 정렬 (최신이 마지막)
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date))

  const sumLast = (key: keyof Pick<KRInvestorDay, 'foreigner_net' | 'institution_net' | 'retail_net' | 'total_value'>, n: number): number => {
    const slice = sorted.slice(-n)
    let s = 0
    for (const row of slice) {
      const v = row[key]
      if (typeof v === 'number' && Number.isFinite(v)) s += v
    }
    return s
  }

  const today = sorted[sorted.length - 1]
  const foreigner_net_today = today?.foreigner_net ?? 0
  const institution_net_today = today?.institution_net ?? 0

  const foreigner_net_5d = sumLast('foreigner_net', 5)
  const foreigner_net_20d = sumLast('foreigner_net', 20)
  const institution_net_5d = sumLast('institution_net', 5)
  const institution_net_20d = sumLast('institution_net', 20)
  const retail_net_5d = sumLast('retail_net', 5)
  const total_value_20d = sumLast('total_value', 20)

  // 시그널 분류
  let signal: 'accumulation' | 'distribution' | 'neutral' = 'neutral'
  if (foreigner_net_5d > 0 && institution_net_5d > 0) {
    signal = 'accumulation'
  } else if (foreigner_net_5d < 0 && institution_net_5d < 0) {
    signal = 'distribution'
  }

  // confidence: |smart money 5일 합계| / 20일 평균 거래대금 × scale
  const avgDailyValue = total_value_20d > 0 ? total_value_20d / Math.max(1, Math.min(20, sorted.length)) : 0
  const smartMoneyAbs = Math.abs(foreigner_net_5d + institution_net_5d)
  let confidence = 0
  if (avgDailyValue > 0) {
    // 비율: 5일 누적 순매수 / 1일 평균 거래대금
    // ratio가 1.0(하루치) → 50점, 3.0(3일치) → 100점
    const ratio = smartMoneyAbs / avgDailyValue
    confidence = Math.max(0, Math.min(100, (ratio / 3) * 100))
  } else if (smartMoneyAbs > 0) {
    confidence = 50  // 거래대금 데이터 없음 fallback
  }

  // 부호 일치도 보너스 (외국인+기관 같은 방향이면 +)
  if ((foreigner_net_5d > 0) === (institution_net_5d > 0) && foreigner_net_5d !== 0 && institution_net_5d !== 0) {
    confidence = Math.min(100, confidence + 10)
  }

  return {
    foreigner_net_today,
    foreigner_net_5d,
    foreigner_net_20d,
    institution_net_today,
    institution_net_5d,
    institution_net_20d,
    retail_net_5d,
    signal,
    confidence: Math.round(confidence),
  }
}
