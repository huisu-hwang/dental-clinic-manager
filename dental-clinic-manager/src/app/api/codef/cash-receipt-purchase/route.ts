// ============================================
// CODEF 현금영수증 매입내역 조회 API (공동인증서 전용)
// POST: 공동인증서 기반 현금영수증 매입 데이터 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getCashReceiptPurchaseWithCert,
  isCodefConfigured,
  getActualCodefServiceType,
} from '@/lib/codefService';

export async function POST(request: NextRequest) {
  try {
    const useMockData = !isCodefConfigured();

    const body = await request.json();
    const {
      certFile,
      certPassword,
      keyFile,
      certType,
      startDate,      // YYYYMMDD
      endDate,        // YYYYMMDD
      identity,
    } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (startDate, endDate)' },
        { status: 400 }
      );
    }

    if (!useMockData) {
      if (!certFile || !certPassword || !certType) {
        return NextResponse.json(
          { success: false, error: '인증서 파라미터가 누락되었습니다. (certFile, certPassword, certType)' },
          { status: 400 }
        );
      }
      if (certType === '1' && !keyFile) {
        return NextResponse.json(
          { success: false, error: 'der/key 타입 인증서는 keyFile이 필요합니다.' },
          { status: 400 }
        );
      }
    }

    let serviceType = useMockData ? 'UI데모' : getActualCodefServiceType();
    console.log(`CODEF 현금영수증 매입내역 조회: ${startDate}~${endDate}, serviceType=${serviceType}`);

    if (useMockData) {
      const mockData = [
        {
          resUserNm: '이원장',
          resCompanyNm: '하얀치과의원',
          resCompanyIdentityNo: '987-65-43210',
          resUsedDate: startDate,
          resUsedTime: '143025',
          resTransTypeNm: '승인거래',
          resDeductDescription: '공제',
          resMemberStoreName: 'GS편의점',
          resApprovalNo: '12345678',
          resMemberStoreCorpNo: '111-22-33333',
          resSupplyValue: '45000',
          resVAT: '4500',
          resTip: '0',
          resIDMeans: '사업자등록번호',
          resTotalAmount: '49500',
          commStartDate: startDate,
          commEndDate: endDate,
        },
        {
          resUserNm: '이원장',
          resCompanyNm: '하얀치과의원',
          resCompanyIdentityNo: '987-65-43210',
          resUsedDate: startDate,
          resUsedTime: '162010',
          resTransTypeNm: '승인거래',
          resDeductDescription: '공제',
          resMemberStoreName: '다이소',
          resApprovalNo: '87654321',
          resMemberStoreCorpNo: '444-55-66666',
          resSupplyValue: '18000',
          resVAT: '1800',
          resTip: '0',
          resIDMeans: '사업자등록번호',
          resTotalAmount: '19800',
          commStartDate: startDate,
          commEndDate: endDate,
        },
      ];

      return NextResponse.json({
        success: true,
        data: {
          purchases: mockData,
          totalCount: mockData.length,
          serviceType,
          message: `${mockData.length}건의 현금영수증 매입내역이 조회되었습니다.`,
        },
      });
    }

    const { data, isSandboxFallback } = await getCashReceiptPurchaseWithCert(
      certFile, certPassword, keyFile || '', certType, startDate, endDate, identity
    );

    if (isSandboxFallback) {
      serviceType = '샌드박스(인증 실패로 폴백)';
    }

    return NextResponse.json({
      success: true,
      data: {
        purchases: data,
        totalCount: data.length,
        serviceType,
        isSandboxFallback,
        message: isSandboxFallback
          ? `${data.length}건 샌드박스 테스트 데이터입니다.`
          : `${data.length}건의 현금영수증 매입내역이 조회되었습니다.`,
      },
    });
  } catch (error) {
    console.error('Cash receipt purchase API error:', error);
    const errMsg = error instanceof Error ? error.message : '현금영수증 매입내역 조회 중 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
