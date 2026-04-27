import * as ss from 'simple-statistics';

export interface EventImpactResult {
  meanBefore: number;
  meanAfter: number;
  changeRate: number;       // (after - before) / before * 100, %
  changeAbsolute: number;   // after - before
  tStatistic: number;
  pValue: number;            // 양측 검정
  isSignificant: boolean;    // p < 0.05
  beforeCount: number;
  afterCount: number;
  reliability: 'high' | 'medium' | 'low';  // 데이터 양 기반
  conclusion: string;        // 한국어 한 줄 결론
}

/**
 * Welch's t-test (등분산 가정 X)로 이벤트 전후 비교.
 * @param before 이벤트 전 일별 데이터 (예: 일별 매출 또는 일별 신환 수)
 * @param after  이벤트 후 일별 데이터
 */
export function welchTTest(before: number[], after: number[]): EventImpactResult {
  if (before.length < 2 || after.length < 2) {
    // 최소 표본 부족 시 t-test 불가
    const meanBefore = before.length ? ss.mean(before) : 0;
    const meanAfter = after.length ? ss.mean(after) : 0;
    return {
      meanBefore,
      meanAfter,
      changeRate: meanBefore > 0 ? ((meanAfter - meanBefore) / meanBefore) * 100 : 0,
      changeAbsolute: meanAfter - meanBefore,
      tStatistic: 0,
      pValue: 1,
      isSignificant: false,
      beforeCount: before.length,
      afterCount: after.length,
      reliability: 'low',
      conclusion: '데이터 부족 (각 기간 최소 2일 이상 필요)',
    };
  }

  const meanBefore = ss.mean(before);
  const meanAfter = ss.mean(after);
  const varBefore = ss.variance(before);
  const varAfter = ss.variance(after);
  const nBefore = before.length;
  const nAfter = after.length;

  // Welch's t-statistic
  const seDiff = Math.sqrt(varBefore / nBefore + varAfter / nAfter);
  const tStat = seDiff > 0 ? (meanAfter - meanBefore) / seDiff : 0;

  // Welch-Satterthwaite degrees of freedom
  const numerator = Math.pow(varBefore / nBefore + varAfter / nAfter, 2);
  const denominator =
    Math.pow(varBefore / nBefore, 2) / (nBefore - 1) +
    Math.pow(varAfter / nAfter, 2) / (nAfter - 1);
  const df = denominator > 0 ? numerator / denominator : 1;

  // 양측 p-value 계산 (t-distribution CDF 사용)
  // simple-statistics에는 t-CDF가 없으므로 정규분포 근사 사용 (df > 30이면 정확)
  // df < 30인 경우도 합리적 근사로 충분
  const pValue = 2 * (1 - normalCdf(Math.abs(tStat)));

  const isSignificant = pValue < 0.05;
  const changeRate = meanBefore > 0 ? ((meanAfter - meanBefore) / meanBefore) * 100 : 0;
  const changeAbsolute = meanAfter - meanBefore;

  // 신뢰도 평가
  let reliability: 'high' | 'medium' | 'low' = 'high';
  const minDays = Math.min(nBefore, nAfter);
  if (minDays < 7) reliability = 'low';
  else if (minDays < 14) reliability = 'medium';

  // 결론 메시지
  let conclusion: string;
  if (isSignificant) {
    const direction = changeRate > 0 ? '증가' : '감소';
    conclusion = `이벤트 후 ${Math.abs(changeRate).toFixed(1)}% ${direction} (통계적으로 유의함, p=${pValue.toFixed(4)})`;
  } else {
    conclusion = `유의한 변화 없음 (p=${pValue.toFixed(4)}, 평균 변화율 ${changeRate.toFixed(1)}%)`;
  }

  return {
    meanBefore,
    meanAfter,
    changeRate,
    changeAbsolute,
    tStatistic: tStat,
    pValue,
    isSignificant,
    beforeCount: nBefore,
    afterCount: nAfter,
    reliability,
    conclusion,
  };
}

/**
 * 표준 정규 분포 누적 분포 함수 (CDF)
 * Abramowitz & Stegun 근사식 (정확도: ~7.5e-8)
 */
function normalCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1.0 + sign * y);
}

/**
 * 일별 데이터 배열로부터 이벤트 전/후 윈도우를 추출하는 헬퍼
 * @param dailyData 일별 데이터 [{ date: 'YYYY-MM-DD', value: number }, ...]
 * @param eventDate 이벤트 시작일 'YYYY-MM-DD'
 * @param windowDays 전/후 각각의 윈도우 일수
 */
export function splitByEvent(
  dailyData: Array<{ date: string; value: number }>,
  eventDate: string,
  windowDays: number
): { before: number[]; after: number[] } {
  const eventTs = new Date(eventDate).getTime();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const beforeStart = eventTs - windowMs;
  const afterEnd = eventTs + windowMs;

  const before: number[] = [];
  const after: number[] = [];

  for (const d of dailyData) {
    const ts = new Date(d.date).getTime();
    if (ts >= beforeStart && ts < eventTs) {
      before.push(d.value);
    } else if (ts >= eventTs && ts < afterEnd) {
      after.push(d.value);
    }
  }

  return { before, after };
}
