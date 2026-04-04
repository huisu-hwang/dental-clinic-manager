import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * raw_data 배열에서 특정 연월에 해당하는 레코드만 필터링
 *
 * 실제 DB 데이터 구조:
 * - cash_receipt_sales: 거래년월 = "2026-01" 형식
 * - business_card_purchase: 거래년월 = "2026-01" 형식
 * - credit_card_sales: 승인년월 = "2026-01" 형식
 * - 요약 행: "상반기 합계" 등은 제외됨
 */
function findMonthRows(
  records: Record<string, unknown>[],
  year: number,
  targetMonth: number,
): Record<string, unknown>[] {
  // YYYY-MM 형식 (예: "2026-04")
  const yearMonthStr = `${year}-${String(targetMonth).padStart(2, '0')}`;

  // YYYY-MM 형식을 담는 필드명 목록
  const yearMonthFields = ['거래년월', '승인년월', '발행년월', '귀속년월', '거래일자'];

  // "N월" 형식 폴백
  const monthPatterns = [
    `${targetMonth}월`,
    `${String(targetMonth).padStart(2, '0')}월`,
  ];
  const monthOnlyFields = ['월', '기간', '거래월', '월별', '조회월'];

  return records.filter(record => {
    // YYYY-MM 형식 필드 확인
    for (const key of yearMonthFields) {
      const val = record[key];
      if (val !== undefined && val !== null && val !== '') {
        if (String(val).trim() === yearMonthStr) return true;
      }
    }
    // "N월" 형식 필드 확인 (폴백)
    for (const key of monthOnlyFields) {
      const val = record[key];
      if (val !== undefined && val !== null && val !== '') {
        const strVal = String(val).replace(/\s/g, '');
        if (monthPatterns.some(p => strVal === p)) return true;
      }
    }
    return false;
  });
}

// GET: 수집 데이터 조회 (타입/기간 필터)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const dataType = searchParams.get('dataType');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    let query = supabase
      .from('hometax_raw_data')
      .select('*')
      .eq('clinic_id', clinicId);

    if (dataType) {
      query = query.eq('data_type', dataType);
    }

    if (year) {
      query = query.eq('year', parseInt(year, 10));
    }

    if (month) {
      query = query.eq('month', parseInt(month, 10));
    }

    query = query.order('year', { ascending: false })
      .order('month', { ascending: false });

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: '데이터 조회에 실패했습니다.' }, { status: 500 });
    }

    // 연월 필터가 있는 경우, raw_data에서 해당 월 레코드만 추출하여 반환
    // (연간/반기 누계 스크래핑 데이터에서 선택한 월 행만 보여주기 위함)
    let filteredData = data || [];
    if (year && month) {
      const targetYear = parseInt(year, 10);
      const targetMonth = parseInt(month, 10);
      filteredData = filteredData.map(row => {
        if (!Array.isArray(row.raw_data) || row.raw_data.length === 0) return row;
        const monthRows = findMonthRows(
          row.raw_data as Record<string, unknown>[],
          targetYear,
          targetMonth,
        );
        return {
          ...row,
          raw_data: monthRows.length > 0 ? monthRows : row.raw_data,
        };
      });
    }

    return NextResponse.json({ success: true, data: filteredData });
  } catch (error) {
    console.error('GET /api/hometax/data error:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
