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
    if (!isCodefConfigured()) {
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
        { success: false, error: '필수 파라미터가 누락되었습니다. (certFile, certPassword, certType, year, startQuarter, endQuarter)' },
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

    const serviceType = getActualCodefServiceType();
    console.log(`CODEF 신용카드 매출 조회: year=${year}, Q${startQuarter}~Q${endQuarter}, serviceType=${serviceType}, certType=${certType}`);

    const salesData = await getCreditCardSalesData(
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
          message: '조회된 데이터가 없습니다.',
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
        serviceType,
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
