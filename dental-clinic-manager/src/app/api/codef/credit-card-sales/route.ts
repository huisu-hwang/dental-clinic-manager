// ============================================
// CODEF 신용카드 매출자료 조회 API (홈택스 ID/PW 방식)
// POST: 홈택스 아이디/비밀번호 기반 신용카드 매출 데이터 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getCreditCardSalesData,
  isCodefConfigured,
  getActualCodefServiceType,
  decryptPasswordFromStorage,
} from '@/lib/codefService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST: 홈택스 ID/PW 기반 신용카드 매출자료 조회
export async function POST(request: NextRequest) {
  try {
    const isDemoMode = false;

    if (!isDemoMode && !isCodefConfigured()) {
      return NextResponse.json(
        { success: false, error: 'CODEF API가 설정되지 않았습니다. 환경변수를 확인하세요.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      clinicId,       // 클리닉 ID
      year,           // YYYY
      startQuarter,   // "1"~"4"
      endQuarter,     // "1"~"4"
    } = body;

    // 필수값 검증
    if (!clinicId || !year || !startQuarter || !endQuarter) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (clinicId, year, startQuarter, endQuarter)' },
        { status: 400 }
      );
    }

    // 분기 값 검증
    const validQuarters = ['1', '2', '3', '4'];
    if (!validQuarters.includes(startQuarter) || !validQuarters.includes(endQuarter)) {
      return NextResponse.json(
        { success: false, error: '분기 값은 1~4 사이여야 합니다.' },
        { status: 400 }
      );
    }

    if (parseInt(startQuarter, 10) > parseInt(endQuarter, 10)) {
      return NextResponse.json(
        { success: false, error: '시작 분기가 종료 분기보다 클 수 없습니다.' },
        { status: 400 }
      );
    }

    // DB에서 홈택스 연결 정보 조회
    const supabase = getServiceClient();
    const { data: connection, error: connError } = await supabase
      .from('codef_connections')
      .select('connected_id, hometax_user_id, encrypted_password')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    if (connError || !connection) {
      return NextResponse.json(
        { success: false, error: '홈택스 연결 정보가 없습니다. 먼저 홈택스 계정을 연결해주세요.' },
        { status: 400 }
      );
    }

    let hometaxPassword: string;
    try {
      hometaxPassword = decryptPasswordFromStorage(connection.encrypted_password);
    } catch {
      return NextResponse.json(
        { success: false, error: '저장된 비밀번호 복호화에 실패했습니다. 계정을 다시 연결해주세요.' },
        { status: 400 }
      );
    }

    const hometaxId = connection.hometax_user_id;
    const serviceType = getActualCodefServiceType();
    console.log(`CODEF 신용카드 매출 조회: year=${year}, Q${startQuarter}~Q${endQuarter}, serviceType=${serviceType}, id=${hometaxId}`);

    const salesData = isDemoMode ? {
      resSalesHistoryList: [
        { resMonth: `${year}01`, resSalesCount: "134", resSalesAmount: "45000000" },
        { resMonth: `${year}02`, resSalesCount: "112", resSalesAmount: "38500000" },
        { resMonth: `${year}03`, resSalesCount: "156", resSalesAmount: "52000000" }
      ],
      resTotalList: [],
      resSalesHistoryList1: []
    } as any : await getCreditCardSalesData(
      hometaxId,
      hometaxPassword,
      year,
      startQuarter,
      endQuarter
    );

    if (!salesData) {
      return NextResponse.json({
        success: true,
        data: {
          salesHistory: [],
          totalList: [],
          pgSalesHistory: [],
          serviceType,
          message: '조회된 데이터가 없습니다. 홈택스 연결 정보를 확인해주세요.',
        },
      });
    }

    const salesCount = (salesData.resSalesHistoryList || []).length;

    return NextResponse.json({
      success: true,
      data: {
        salesHistory: salesData.resSalesHistoryList || [],
        totalList: salesData.resTotalList || [],
        pgSalesHistory: salesData.resSalesHistoryList1 || [],
        serviceType: isDemoMode ? '정식 (데모데이터)' : serviceType,
        message: `${salesCount}개월 매출 데이터가 조회되었습니다.`,
      },
    });
  } catch (error) {
    console.error('Credit card sales API error:', error);
    const errMsg = error instanceof Error ? error.message : '신용카드 매출 조회 중 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
