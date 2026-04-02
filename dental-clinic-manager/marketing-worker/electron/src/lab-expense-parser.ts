// ============================================
// 기공료 엑셀 파서
// 엑셀 첨부파일에서 기공료 항목(품명, 금액) 추출
// ============================================

// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

export interface LabExpenseItem {
  description: string;
  amount: number;
  vendor_name: string;
}

/** 헤더 감지용 키워드 */
const DESCRIPTION_KEYWORDS = ['품명', '품목', '항목', '내역', '제품명', '보철물', '기공물'];
const AMOUNT_KEYWORDS = ['금액', '단가', '합계', '청구금액', '공급가액', '기공료'];

/**
 * 엑셀 버퍼에서 기공료 항목을 추출한다.
 * 헤더 행을 자동 감지하고, 품명/금액 열을 매칭한다.
 */
export function parseExcelLabExpense(buffer: Buffer, vendorName: string): LabExpenseItem[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const items: LabExpenseItem[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    if (rows.length < 2) continue;

    // 헤더 행 자동 감지
    let headerRowIdx = -1;
    let descColIdx = -1;
    let amountColIdx = -1;

    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      let foundDesc = -1;
      let foundAmount = -1;

      for (let c = 0; c < row.length; c++) {
        const cellStr = String(row[c] ?? '').trim();
        if (!cellStr) continue;

        if (foundDesc === -1 && DESCRIPTION_KEYWORDS.some(kw => cellStr.includes(kw))) {
          foundDesc = c;
        }
        if (foundAmount === -1 && AMOUNT_KEYWORDS.some(kw => cellStr.includes(kw))) {
          foundAmount = c;
        }
      }

      if (foundDesc !== -1 && foundAmount !== -1) {
        headerRowIdx = r;
        descColIdx = foundDesc;
        amountColIdx = foundAmount;
        break;
      }
    }

    if (headerRowIdx === -1) continue;

    // 데이터 행 파싱
    for (let r = headerRowIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const description = String(row[descColIdx] ?? '').trim();
      const rawAmount = row[amountColIdx];

      if (!description) continue;

      const amount = parseAmount(rawAmount);
      if (amount <= 0) continue;

      items.push({
        description,
        amount,
        vendor_name: vendorName,
      });
    }

    // 첫 번째 유효 시트에서 데이터를 찾으면 중단
    if (items.length > 0) break;
  }

  return items;
}

/**
 * 다양한 금액 표현을 숫자로 변환한다.
 * 예: "1,500,000", "1500000", "150만", "1,500,000원"
 */
function parseAmount(value: unknown): number {
  if (typeof value === 'number') return value;
  if (value == null) return 0;

  let str = String(value).trim();
  if (!str) return 0;

  // 단위 제거
  str = str.replace(/원/g, '').trim();

  // "만" 단위 처리 (예: "150만" → 1500000)
  const manMatch = str.match(/^([\d,.]+)\s*만$/);
  if (manMatch) {
    const num = parseFloat(manMatch[1].replace(/,/g, ''));
    return isNaN(num) ? 0 : num * 10000;
  }

  // 콤마 제거 후 숫자 변환
  const cleaned = str.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}
