// ============================================
// CODEF 사업용 신용카드 매입세액 공제 확인/변경 조회 API (공동인증서 전용)
// POST: 공동인증서 기반 사업용 신용카드 매입세액 공제 데이터 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import {
  getBusinessCardDeductionWithCert,
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
      searchType,     // "0": 일별, "1": 월별, "2": 분기별
      startDate,      // searchType에 따라 형식 다름
      inquiryType,    // "0": 전체, "1": 공제대상, "2": 불공제대상
      detailYN,       // "0": 미포함, "1": 카드정보 포함
      identity,
    } = body;

    if (!searchType || !startDate) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다. (searchType, startDate)' },
        { status: 400 }
      );
    }

    const validSearchTypes = ['0', '1', '2'];
    if (!validSearchTypes.includes(searchType)) {
      return NextResponse.json(
        { success: false, error: 'searchType은 "0"(일별), "1"(월별), "2"(분기별) 중 하나여야 합니다.' },
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
    console.log(`CODEF 사업용 신용카드 매입세액 공제 조회: searchType=${searchType}, startDate=${startDate}, serviceType=${serviceType}`);

    if (useMockData) {
      const mockData = [
        {
          resCompanyIdentityNo: '987-65-43210',
          resCompanyNm: '하얀치과의원',
          resTotalUsedAmt: '3500000',
          resDetailList: [
            {
              resMemberStoreCorpNo: '123-45-67890',
              resMemberStoreName: '치과재료마트',
              resSupplyValue: '2000000',
              resTaxAmt: '200000',
              resTip: '0',
              resTotalAmount: '2200000',
              resType: '일반과세자',
              resBusinessTypes: '도소매',
              resBusinessItems: '의료기기',
              resDeductDescription: '공제',
              resNote: '',
              resUsedDate: startDate.length >= 8 ? startDate : `${startDate}01`,
              resCardCompany: '',
              resCardNo: '',
            },
            {
              resMemberStoreCorpNo: '234-56-78901',
              resMemberStoreName: '오피스디포',
              resSupplyValue: '1200000',
              resTaxAmt: '120000',
              resTip: '0',
              resTotalAmount: '1320000',
              resType: '일반과세자',
              resBusinessTypes: '도소매',
              resBusinessItems: '사무용품',
              resDeductDescription: '공제',
              resNote: '',
              resUsedDate: startDate.length >= 8 ? startDate : `${startDate}15`,
              resCardCompany: '',
              resCardNo: '',
            },
          ],
        },
      ];

      return NextResponse.json({
        success: true,
        data: {
          deductions: mockData,
          serviceType,
          message: `${mockData.length}건의 사업용 신용카드 매입세액 공제 내역이 조회되었습니다.`,
        },
      });
    }

    const { data, isSandboxFallback } = await getBusinessCardDeductionWithCert(
      certFile, certPassword, keyFile || '', certType,
      searchType, startDate, inquiryType, detailYN, identity
    );

    if (isSandboxFallback) {
      serviceType = '샌드박스(인증 실패로 폴백)';
    }

    return NextResponse.json({
      success: true,
      data: {
        deductions: data,
        serviceType,
        isSandboxFallback,
        message: isSandboxFallback
          ? `${data.length}건 샌드박스 테스트 데이터입니다.`
          : `${data.length}건의 사업용 신용카드 매입세액 공제 내역이 조회되었습니다.`,
      },
    });
  } catch (error) {
    console.error('Business card deduction API error:', error);
    const errMsg = error instanceof Error ? error.message : '사업용 신용카드 매입세액 공제 조회 중 오류가 발생했습니다.';
    return NextResponse.json(
      { success: false, error: errMsg },
      { status: 500 }
    );
  }
}
