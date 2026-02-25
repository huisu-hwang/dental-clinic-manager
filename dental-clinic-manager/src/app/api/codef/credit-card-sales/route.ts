// ============================================
// CODEF 신용카드 매출자료 조회 API (공동인증서 전용)
// POST: 공동인증서 기반 신용카드 매출 데이터 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getCreditCardSalesData,
  isCodefConfigured,
  getActualCodefServiceType,
} from '@/lib/codefService';

// POST: 공동인증서 기반 신용카드 매출자료 조회
export async function POST(request: NextRequest) {
  try {
    const isDemoMode = false; // Set to false to use actual CODEF API

    if (!isDemoMode && !isCodefConfigured()) {
      return NextResponse.json(
        { success: false, error: 'CODEF API가 설정되지 않았습니다. 환경변수를 확인하세요.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const {
      certFile,       // BASE64 인코딩된 인증서 der/pfx 파일
      certPassword,   // 인증서 비밀번호 (평문)
      keyFile,        // BASE64 인코딩된 인증서 key 파일 (der/key 타입)
      certType,       // "1": der/key, "pfx": pfx
      year,           // YYYY
      startQuarter,   // "1"~"4"
      endQuarter,     // "1"~"4"
    } = body;

    // 필수값 검증
    if (!certFile || !certPassword || !certType || !year || !startQuarter || !endQuarter) {
      return NextResponse.json(
        {
          success: false,
          error: '필수 파라미터가 누락되었습니다. (certFile, certPassword, certType, year, startQuarter, endQuarter)',
        },
        { status: 400 }
      );
    }

    // der/key 타입일 때 keyFile 필수
    if (certType === '1' && !keyFile) {
      return NextResponse.json(
        { success: false, error: 'der/key 타입 인증서는 keyFile이 필요합니다.' },
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

    if (!isDemoMode && parseInt(startQuarter, 10) > parseInt(endQuarter, 10)) {
      return NextResponse.json(
        { success: false, error: '시작 분기가 종료 분기보다 클 수 없습니다.' },
        { status: 400 }
      );
    }

    const serviceType = getActualCodefServiceType();
    console.log(`CODEF 신용카드 매출 조회: year=${year}, Q${startQuarter}~Q${endQuarter}, serviceType=${serviceType}`);

    // 데모 모드를 기반으로 실제 신용카드 PDF 데이터 모의 구현
    const salesData = isDemoMode ? {
      resSalesHistoryList: [
        { resMonth: `${year}01`, resSalesCount: "134", resSalesAmount: "45000000" },
        { resMonth: `${year}02`, resSalesCount: "112", resSalesAmount: "38500000" },
        { resMonth: `${year}03`, resSalesCount: "156", resSalesAmount: "52000000" }
      ],
      resTotalList: [],
      resSalesHistoryList1: []
    } as any : await getCreditCardSalesData(
      certFile,
      certPassword,
      keyFile || '',
      certType,
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
          message: '조회된 데이터가 없거나 인증서 정보를 확인해주세요.',
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
