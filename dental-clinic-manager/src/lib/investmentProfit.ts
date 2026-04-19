/**
 * 월별 실현/평가 수익을 반환한다.
 * NOTE: 현재 투자 거래 테이블이 부재하므로 0 반환. 투자 엔진 구현 후 본체 연결.
 */
export async function calculateMonthlyProfit(
  _clinicId: string, _year: number, _month: number
): Promise<{ realized: number; unrealized: number }> {
  return { realized: 0, unrealized: 0 }
}
