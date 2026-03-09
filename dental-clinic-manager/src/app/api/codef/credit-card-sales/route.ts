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
    // CODEF 자격증명 설정 여부에 따라 실제 API 호출 또는 UI 데모 데이터 사용
    // CODEF_SERVICE_TYPE=DEMO(development.codef.io)도 실제 데이터를 반환하는 진짜 API 환경
    const useMockData = !isCodefConfigured();

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

    // 필수값 검증 (UI 데모 모드에서는 인증서 관련 파라미터 불필요)
    if (!year || !startQuarter || !endQuarter) {
      return NextResponse.json(
        {
          success: false,
          error: '필수 파라미터가 누락되었습니다. (year, startQuarter, endQuarter)',
        },
        { status: 400 }
      );
    }

    if (!useMockData) {
      if (!certFile || !certPassword || !certType) {
        return NextResponse.json(
          {
            success: false,
            error: '인증서 파라미터가 누락되었습니다. (certFile, certPassword, certType)',
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

    let serviceType = useMockData ? 'UI데모' : getActualCodefServiceType();
    console.log(`CODEF 신용카드 매출 조회: year=${year}, Q${startQuarter}~Q${endQuarter}, serviceType=${serviceType}, useMockData=${useMockData}`);

    // UI 데모용 (CODEF 미설정 시): PDF 스펙 기반 모의 데이터 (필드명 PDF 스펙 준수)
    if (useMockData) {
      const mockSalesData = {
        resSalesHistoryList: [
          { resYearMonth: `${year}01`, resCount: "134", resTotalAmount: "45000000", resPaymentAmt: "40000000", resPaymentAmt1: "5000000", resCashBack: "0" },
          { resYearMonth: `${year}02`, resCount: "112", resTotalAmount: "38500000", resPaymentAmt: "34000000", resPaymentAmt1: "4500000", resCashBack: "0" },
          { resYearMonth: `${year}03`, resCount: "156", resTotalAmount: "52000000", resPaymentAmt: "46000000", resPaymentAmt1: "6000000", resCashBack: "0" },
        ],
        resTotalList: [
          { resQuarter: "1", resType: "0", resCount: "402", resTotalAmount: "135500000" },
        ],
        resSalesHistoryList1: [
          { resYearMonth: `${year}01`, resCount: "28", resSalesAmount: "9500000", resCompanyNm: "PG사 결제" },
          { resYearMonth: `${year}02`, resCount: "24", resSalesAmount: "8200000", resCompanyNm: "PG사 결제" },
          { resYearMonth: `${year}03`, resCount: "33", resSalesAmount: "11000000", resCompanyNm: "PG사 결제" },
        ],
      };

      return NextResponse.json({
        success: true,
        data: {
          salesHistory: mockSalesData.resSalesHistoryList,
          totalList: mockSalesData.resTotalList,
          pgSalesHistory: mockSalesData.resSalesHistoryList1,
          serviceType,
          message: `${mockSalesData.resSalesHistoryList.length}개월 매출 데이터가 조회되었습니다.`,
        },
      });
    }

    // 실제 CODEF API 호출
    const { salesData, isSandboxFallback } = await getCreditCardSalesData(
      certFile,
      certPassword,
      keyFile || '',
      certType,
      year,
      startQuarter,
      endQuarter
    );

    // 샌드박스 폴백 시 서비스 타입 표시 변경
    if (isSandboxFallback) {
      serviceType = '샌드박스(인증 실패로 폴백)';
    }

    if (!salesData) {
      return NextResponse.json({
        success: true,
        data: {
          salesHistory: [],
          totalList: [],
          pgSalesHistory: [],
          serviceType,
          isSandboxFallback,
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
        isSandboxFallback,
        message: isSandboxFallback
          ? `${salesCount}개월 샌드박스 테스트 데이터입니다. CODEF DEMO 인증 정보가 유효하지 않아 샌드박스로 폴백되었습니다.`
          : `${salesCount}개월 매출 데이터가 조회되었습니다.`,
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
