// ============================================
// CODEF 전자세금계산서 상세 조회 API (공동인증서 전용)
// POST: 공동인증서 기반 전자세금계산서 상세 데이터 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getTaxInvoiceDetailWithCert,
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
    console.log(`CODEF 전자세금계산서 상세 조회: ${startDate}~${endDate}, serviceType=${serviceType}`);

    if (useMockData) {
      const mockData = [
        {
          commStartDate: startDate,
          commEndDate: endDate,
          resSupplierRegNumber: '123-45-67890',
          resSupplierEstablishNo: '',
          resSupplierCompanyName: '(주)치과재료상사',
          resSupplierName: '김공급',
          resContractorRegNumber: '987-65-43210',
          resContractorEstablishNo: '',
          resContractorCompanyName: '하얀치과의원',
          resContractorName: '이원장',
          resTotalAmount: '5500000',
          resETaxInvoiceType: '01',
          resNote: '',
          resReceiptOrCharge: '영수',
          resReasonModification: '',
          resReportingDate: startDate,
          resSupplyValue: '5000000',
          resTaxAmt: '500000',
          resTradeItemList: [
            { resTaxAmt: '500000', resTaxItemName: '임플란트 재료', resSupplyValue: '5000000', resNote: '', resStandards: '', resPurchaseExpiryDate: endDate, resQuantity: '10', resUnitPrice: '500000' },
          ],
        },
        {
          commStartDate: startDate,
          commEndDate: endDate,
          resSupplierRegNumber: '234-56-78901',
          resSupplierEstablishNo: '',
          resSupplierCompanyName: '메디컬서플라이',
          resSupplierName: '박대표',
          resContractorRegNumber: '987-65-43210',
          resContractorEstablishNo: '',
          resContractorCompanyName: '하얀치과의원',
          resContractorName: '이원장',
          resTotalAmount: '2200000',
          resETaxInvoiceType: '01',
          resNote: '',
          resReceiptOrCharge: '영수',
          resReasonModification: '',
          resReportingDate: startDate,
          resSupplyValue: '2000000',
          resTaxAmt: '200000',
          resTradeItemList: [
            { resTaxAmt: '200000', resTaxItemName: '소독 용품', resSupplyValue: '2000000', resNote: '', resStandards: '', resPurchaseExpiryDate: endDate, resQuantity: '5', resUnitPrice: '400000' },
          ],
        },
      ];

      return NextResponse.json({
        success: true,
        data: {
          invoices: mockData,
          serviceType,
          message: `${mockData.length}건의 전자세금계산서가 조회되었습니다.`,
        },
      });
    }

    const { data, isSandboxFallback } = await getTaxInvoiceDetailWithCert(
      certFile, certPassword, keyFile || '', certType, startDate, endDate, identity
    );

    if (isSandboxFallback) {
      serviceType = '샌드박스(인증 실패로 폴백)';
    }

    return NextResponse.json({
      success: true,
      data: {
        invoices: data,
        serviceType,
        isSandboxFallback,
        message: isSandboxFallback
          ? `${data.length}건 샌드박스 테스트 데이터입니다.`
          : `${data.length}건의 전자세금계산서가 조회되었습니다.`,
      },
    });
  } catch (error) {
    console.error('Tax invoice detail API error:', error);
    const errMsg = error instanceof Error ? error.message : '전자세금계산서 상세 조회 중 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
