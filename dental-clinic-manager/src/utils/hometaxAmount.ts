// ============================================
// 홈택스 raw_data 월별 금액 추출 유틸
// /api/hometax/data/summary, /api/financial/summary 에서 공유 사용
// ============================================

const YEAR_MONTH_FIELDS = ['거래년월', '승인년월', '발행년월', '귀속년월', '거래일자'];
const MONTH_ONLY_FIELDS = ['월', '기간', '거래월', '월별', '조회월'];

const AMOUNT_KEYS = [
  // 실제 DB에서 확인된 금액 필드 (우선순위 순)
  '총금액',        // cash_receipt_sales
  '매출액계',      // credit_card_sales
  '합계(①+②)',  // business_card_purchase
  // 범용 폴백
  '합계(③+④)', '합계', '매입금액',
  '거래금액', '매출금액',
  '공급가액(①)', '공급가액(③)', '공급가액', '전체',
  'total_amount', 'supply_amount',
];

/**
 * raw_data 배열에서 특정 연월에 해당하는 레코드만 필터링.
 * 홈택스 누계 조회는 분기/반기 전체 데이터를 반환하므로 해당 월 행만 추출.
 */
export function findMonthRows(
  records: Record<string, unknown>[],
  year: number,
  targetMonth: number,
): Record<string, unknown>[] {
  const yearMonthStr = `${year}-${String(targetMonth).padStart(2, '0')}`;
  const monthPatterns = [
    `${targetMonth}월`,
    `${String(targetMonth).padStart(2, '0')}월`,
  ];

  return records.filter(record => {
    for (const key of YEAR_MONTH_FIELDS) {
      const val = record[key];
      if (val !== undefined && val !== null && val !== '') {
        if (String(val).trim() === yearMonthStr) return true;
      }
    }
    for (const key of MONTH_ONLY_FIELDS) {
      const val = record[key];
      if (val !== undefined && val !== null && val !== '') {
        const strVal = String(val).replace(/\s/g, '');
        if (monthPatterns.some(p => strVal === p)) return true;
      }
    }
    return false;
  });
}

/**
 * raw_data 레코드 배열에서 해당 월의 금액 추출.
 *
 * 동작:
 * - 레코드에 연월 필드가 존재하는 per-month 데이터인 경우:
 *   해당 월 행만 합산. 일치 행이 없으면 0 반환 (대상 월 데이터 미집계 처리).
 * - 연월 필드가 전혀 없는 집계 전용 데이터인 경우에만 전체 합산 폴백 적용.
 */
export function extractMonthAmount(
  records: Record<string, unknown>[],
  year: number,
  targetMonth: number,
): number {
  if (!Array.isArray(records) || records.length === 0) return 0;

  const hasYearMonthField = records.some(record =>
    YEAR_MONTH_FIELDS.some(key => {
      const val = record[key];
      return val !== undefined && val !== null && val !== '';
    })
  );

  let rowsToSum: Record<string, unknown>[];
  if (hasYearMonthField) {
    const monthRows = findMonthRows(records, year, targetMonth);
    if (monthRows.length === 0) return 0;
    rowsToSum = monthRows;
  } else {
    rowsToSum = records;
  }

  let total = 0;
  for (const record of rowsToSum) {
    for (const key of AMOUNT_KEYS) {
      if (record[key] !== undefined && record[key] !== '') {
        const val = String(record[key]).replace(/[,원\s]/g, '');
        const num = parseInt(val, 10);
        if (!isNaN(num) && num > 0) {
          total += num;
          break;
        }
      }
    }
  }
  return total;
}
