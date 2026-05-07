import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findMonthRows } from '@/utils/hometaxAmount';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
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
