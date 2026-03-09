// ============================================
// CODEF 전자세금계산서 통계 조회 API (공동인증서 전용)
// POST: 공동인증서 기반 전자세금계산서 매출/매입 통계 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getTaxInvoiceStatisticsWithCert,
  isCodefConfigured,
  getActualCodefServiceType,
  convertTaxInvoiceStatsToSummary,
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
      yearMonth,      // YYYYMM
      identity,
    } = body;

    if (!yearMonth) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (yearMonth)' },
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
    console.log(`CODEF 전자세금계산서 통계 조회: ${yearMonth}, serviceType=${serviceType}`);

    if (useMockData) {
      const mockData = [
        { resType: '0', resYearMonth: yearMonth, resPartnerCnt: '12', resNumber: '15', resSupplyValue: '45000000', resTaxAmt: '4500000' },
        { resType: '1', resYearMonth: yearMonth, resPartnerCnt: '8', resNumber: '10', resSupplyValue: '22000000', resTaxAmt: '2200000' },
      ];

      const summary = convertTaxInvoiceStatsToSummary(mockData);

      return NextResponse.json({
        success: true,
        data: {
          statistics: mockData,
          summary,
          serviceType,
          message: `${yearMonth} 세금계산서 통계가 조회되었습니다.`,
        },
      });
    }

    const { data, isSandboxFallback } = await getTaxInvoiceStatisticsWithCert(
      certFile, certPassword, keyFile || '', certType, yearMonth, identity
    );

    if (isSandboxFallback) {
      serviceType = '샌드박스(인증 실패로 폴백)';
    }

    const summary = convertTaxInvoiceStatsToSummary(data);

    return NextResponse.json({
      success: true,
      data: {
        statistics: data,
        summary,
        serviceType,
        isSandboxFallback,
        message: isSandboxFallback
          ? `샌드박스 테스트 데이터입니다.`
          : `${yearMonth} 세금계산서 통계가 조회되었습니다.`,
      },
    });
  } catch (error) {
    console.error('Tax invoice statistics API error:', error);
    const errMsg = error instanceof Error ? error.message : '전자세금계산서 통계 조회 중 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
