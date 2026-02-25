// ============================================
// CODEF 신용카드 매출자료 조회 API
// GET: 신용카드 매출 데이터 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getCreditCardSalesData,
  decryptPasswordFromStorage,
  isCodefConfigured,
  getCodefServiceType,
} from '@/lib/codefService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 신용카드 매출자료 조회
export async function GET(request: NextRequest) {
  try {
    if (!isCodefConfigured()) {
      return NextResponse.json(
        { success: false, error: 'CODEF API가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!clinicId || !year) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (clinicId, year)' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 연결 정보 조회
    const { data: connection, error: connError } = await supabase
      .from('codef_connections')
      .select('connected_id, hometax_user_id, encrypted_password')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    if (connError || !connection?.connected_id) {
      return NextResponse.json(
        { success: false, error: '홈택스 계정이 연결되지 않았습니다.' },
        { status: 400 }
      );
    }

    if (!connection.encrypted_password || !connection.hometax_user_id) {
      return NextResponse.json(
        { success: false, error: '홈택스 계정 정보가 불완전합니다.' },
        { status: 400 }
      );
    }

    // 비밀번호 복호화
    let hometaxPassword: string;
    try {
      hometaxPassword = decryptPasswordFromStorage(connection.encrypted_password);
    } catch {
      return NextResponse.json(
        { success: false, error: '저장된 비밀번호 복호화에 실패했습니다.' },
        { status: 400 }
      );
    }

    // 조회 기간 설정
    const yearNum = parseInt(year, 10);
    let startYearMonth: string;
    let endYearMonth: string;

    if (month) {
      // 특정 월 조회: 해당 월만
      startYearMonth = `${yearNum}${String(parseInt(month, 10)).padStart(2, '0')}`;
      endYearMonth = startYearMonth;
    } else {
      // 연간 조회: 1월~12월
      startYearMonth = `${yearNum}01`;
      endYearMonth = `${yearNum}12`;
    }

    console.log(`CODEF: 신용카드 매출자료 조회 (${startYearMonth}~${endYearMonth})`);

    const salesData = await getCreditCardSalesData(
      connection.hometax_user_id,
      hometaxPassword,
      startYearMonth,
      endYearMonth
    );

    const serviceType = getCodefServiceType();

    if (!salesData) {
      return NextResponse.json({
        success: true,
        data: {
          salesHistory: [],
          totalList: [],
          pgSalesHistory: [],
          serviceType,
          message: serviceType !== '정식'
            ? `현재 ${serviceType} 모드에서는 실제 데이터가 제한될 수 있습니다.`
            : '조회된 데이터가 없습니다.',
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        salesHistory: salesData.resSalesHistoryList || [],
        totalList: salesData.resTotalList || [],
        pgSalesHistory: salesData.resSalesHistoryList1 || [],
        serviceType,
        message: `${(salesData.resSalesHistoryList || []).length}개월 매출 데이터가 조회되었습니다.`,
      },
    });
  } catch (error) {
    console.error('Credit card sales API error:', error);
    return NextResponse.json(
      { success: false, error: '신용카드 매출 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
