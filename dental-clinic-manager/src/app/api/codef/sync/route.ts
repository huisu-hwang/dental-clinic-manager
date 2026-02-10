// ============================================
// CODEF 홈택스 데이터 동기화 API
// POST: 홈택스 데이터 동기화 실행
// GET: 동기화 이력 조회
// Updated: 2026-02-09 - PDF 문서 기반 전면 재작성
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getTaxInvoiceStatistics,
  getCashReceiptPurchaseDetails,
  getCashReceiptSalesDetails,
  convertTaxInvoiceStatsToSummary,
  convertCashReceiptPurchaseToExpense,
  convertTaxInvoicePurchaseToExpense,
  decryptPasswordFromStorage,
  isCodefConfigured,
  getCodefServiceType,
} from '@/lib/codefService';
import type { TaxInvoiceStatisticsItem } from '@/types/codef';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// POST: 홈택스 데이터 동기화
export async function POST(request: NextRequest) {
  try {
    // CODEF 설정 확인
    if (!isCodefConfigured()) {
      return NextResponse.json(
        { success: false, error: 'CODEF API가 설정되지 않았습니다.' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { clinicId, year, month, syncType = 'all' } = body;

    if (!clinicId || !year || !month) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 연결 정보 + 암호화된 비밀번호 조회 (service_role로 RLS 우회)
    const { data: connection, error: connError } = await supabase
      .from('codef_connections')
      .select('connected_id, hometax_user_id, encrypted_password')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    if (connError || !connection?.connected_id) {
      return NextResponse.json(
        { success: false, error: '홈택스 계정이 연결되지 않았습니다. 먼저 계정을 연결해주세요.' },
        { status: 400 }
      );
    }

    if (!connection.encrypted_password || !connection.hometax_user_id) {
      return NextResponse.json(
        { success: false, error: '홈택스 계정 정보가 불완전합니다. 계정을 다시 연결해주세요.' },
        { status: 400 }
      );
    }

    // 비밀번호 복호화
    let hometaxPassword: string;
    try {
      hometaxPassword = decryptPasswordFromStorage(connection.encrypted_password);
    } catch (decryptError) {
      console.error('Password decryption failed:', decryptError);
      return NextResponse.json(
        { success: false, error: '저장된 비밀번호 복호화에 실패했습니다. 계정을 다시 연결해주세요.' },
        { status: 400 }
      );
    }

    const hometaxId = connection.hometax_user_id;

    // 조회 기간 설정
    const yearMonth = `${year}${String(month).padStart(2, '0')}`;
    const startDate = `${year}${String(month).padStart(2, '0')}01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}${String(month).padStart(2, '0')}${lastDay}`;

    const results = {
      taxInvoiceSales: { synced: 0, errors: [] as string[] },
      taxInvoicePurchase: { synced: 0, errors: [] as string[] },
      cashReceiptSales: { synced: 0, errors: [] as string[] },
      cashReceiptPurchase: { synced: 0, errors: [] as string[] },
    };

    // 기본 카테고리 ID 조회
    let { data: categories } = await supabase
      .from('expense_categories')
      .select('id, type')
      .eq('clinic_id', clinicId);

    // 카테고리가 없으면 기본 카테고리 자동 생성
    if (!categories || categories.length === 0) {
      const defaultCategories = [
        { clinic_id: clinicId, name: '재료비', type: 'material' },
        { clinic_id: clinicId, name: '임대료', type: 'rent' },
        { clinic_id: clinicId, name: '인건비', type: 'labor' },
        { clinic_id: clinicId, name: '기타', type: 'other' },
      ];
      const { data: created } = await supabase
        .from('expense_categories')
        .insert(defaultCategories)
        .select('id, type');
      categories = created || [];
    }

    const getCategoryId = (type: string): string => {
      const category = categories?.find(c => c.type === type);
      return category?.id || categories?.[0]?.id || '';
    };

    // ============================================
    // 1. 세금계산서 매출/매입 통계
    // ============================================
    if (syncType === 'all' || syncType === 'taxInvoice') {
      try {
        console.log(`CODEF sync: 세금계산서 통계 조회 (${yearMonth})`);
        const taxStats = await getTaxInvoiceStatistics(hometaxId, hometaxPassword, yearMonth);

        for (const item of taxStats) {
          if (item.resType === '0') {
            // 매출
            results.taxInvoiceSales.synced += parseInt(item.resNumber, 10) || 0;
          } else if (item.resType === '1') {
            // 매입 - 거래처별 상세가 있으면 expense_records에 저장
            const purchaseCount = parseInt(item.resNumber, 10) || 0;
            results.taxInvoicePurchase.synced += purchaseCount;

            if (item.resPartnerSpecList && item.resPartnerSpecList.length > 0) {
              for (const partner of item.resPartnerSpecList) {
                const expenseData = convertTaxInvoicePurchaseToExpense(partner, yearMonth);

                // 중복 체크 (사업자번호 + 년월)
                const { data: existing } = await supabase
                  .from('expense_records')
                  .select('id')
                  .eq('clinic_id', clinicId)
                  .eq('tax_invoice_number', partner.resCompanyIdentityNo)
                  .eq('year', year)
                  .eq('month', month)
                  .eq('is_hometax_synced', true)
                  .ilike('description', '%세금계산서 매입%')
                  .single();

                if (!existing) {
                  const { error: insertError } = await supabase
                    .from('expense_records')
                    .insert({
                      clinic_id: clinicId,
                      category_id: getCategoryId('material'),
                      year,
                      month,
                      ...expenseData,
                    });

                  if (insertError) {
                    results.taxInvoicePurchase.errors.push(
                      `세금계산서 매입 ${partner.resCompanyNm} 저장 실패: ${insertError.message}`
                    );
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.taxInvoiceSales.errors.push(`세금계산서 통계 조회 실패: ${errMsg}`);
        results.taxInvoicePurchase.errors.push(`세금계산서 통계 조회 실패: ${errMsg}`);
      }
    }

    // ============================================
    // 2. 현금영수증 매입내역
    // ============================================
    if (syncType === 'all' || syncType === 'cashReceiptPurchase') {
      try {
        console.log(`CODEF sync: 현금영수증 매입 조회 (${startDate}~${endDate})`);
        const cashPurchase = await getCashReceiptPurchaseDetails(
          hometaxId, hometaxPassword, startDate, endDate
        );

        for (const item of cashPurchase) {
          const expenseData = convertCashReceiptPurchaseToExpense(item);

          // 중복 체크 (승인번호로)
          const { data: existing } = await supabase
            .from('expense_records')
            .select('id')
            .eq('clinic_id', clinicId)
            .eq('tax_invoice_number', item.resApprovalNo)
            .eq('is_hometax_synced', true)
            .single();

          if (!existing) {
            const { error: insertError } = await supabase
              .from('expense_records')
              .insert({
                clinic_id: clinicId,
                category_id: getCategoryId('material'),
                year,
                month,
                ...expenseData,
              });

            if (insertError) {
              results.cashReceiptPurchase.errors.push(
                `현금영수증 매입 ${item.resApprovalNo} 저장 실패: ${insertError.message}`
              );
            } else {
              results.cashReceiptPurchase.synced++;
            }
          }
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.cashReceiptPurchase.errors.push(`현금영수증 매입 조회 실패: ${errMsg}`);
      }
    }

    // ============================================
    // 3. 현금영수증 매출내역
    // ============================================
    if (syncType === 'all' || syncType === 'cashReceiptSales') {
      try {
        console.log(`CODEF sync: 현금영수증 매출 조회 (${startDate}~${endDate})`);
        const cashSales = await getCashReceiptSalesDetails(
          hometaxId, hometaxPassword, startDate, endDate
        );

        // 매출 데이터는 건수만 카운트 (expense_records가 아닌 매출 집계)
        results.cashReceiptSales.synced = cashSales.length;

      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        results.cashReceiptSales.errors.push(`현금영수증 매출 조회 실패: ${errMsg}`);
      }
    }

    // 마지막 동기화 시간 업데이트
    await supabase
      .from('codef_connections')
      .update({
        last_sync_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId);

    // 동기화 이력 저장
    await supabase.from('codef_sync_logs').insert({
      clinic_id: clinicId,
      year,
      month,
      sync_type: syncType,
      tax_invoice_sales_count: results.taxInvoiceSales.synced,
      tax_invoice_purchase_count: results.taxInvoicePurchase.synced,
      cash_receipt_sales_count: results.cashReceiptSales.synced,
      cash_receipt_purchase_count: results.cashReceiptPurchase.synced,
      errors: JSON.stringify([
        ...results.taxInvoiceSales.errors,
        ...results.taxInvoicePurchase.errors,
        ...results.cashReceiptSales.errors,
        ...results.cashReceiptPurchase.errors,
      ]),
      synced_at: new Date().toISOString(),
    });

    const totalSynced =
      results.taxInvoiceSales.synced +
      results.taxInvoicePurchase.synced +
      results.cashReceiptSales.synced +
      results.cashReceiptPurchase.synced;

    const allErrors = [
      ...results.taxInvoiceSales.errors,
      ...results.taxInvoicePurchase.errors,
      ...results.cashReceiptSales.errors,
      ...results.cashReceiptPurchase.errors,
    ];

    const serviceType = getCodefServiceType();
    let message = `${totalSynced}건의 데이터가 동기화되었습니다.`;
    if (totalSynced === 0 && serviceType !== '정식') {
      message = `동기화된 데이터가 없습니다. 현재 ${serviceType} 모드에서는 실제 홈택스 데이터가 제한될 수 있습니다. 실제 데이터 연동을 위해서는 CODEF 정식(PRODUCT) 서비스가 필요합니다.`;
    }

    return NextResponse.json({
      success: true,
      data: {
        totalSynced,
        details: results,
        errors: allErrors,
        serviceType,
        message,
      },
    });
  } catch (error) {
    console.error('CODEF sync error:', error);
    return NextResponse.json(
      { success: false, error: '홈택스 데이터 동기화 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

// GET: 동기화 이력 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    if (!clinicId) {
      return NextResponse.json(
        { success: false, error: 'clinicId가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();
    const { data: logs, error } = await supabase
      .from('codef_sync_logs')
      .select('*')
      .eq('clinic_id', clinicId)
      .order('synced_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: logs || [],
    });
  } catch (error) {
    console.error('CODEF sync logs error:', error);
    return NextResponse.json(
      { success: false, error: '동기화 이력 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
