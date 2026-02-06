// ============================================
// CODEF 홈택스 데이터 동기화 API
// POST: 홈택스 데이터 동기화 실행
// GET: 동기화 이력 조회
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  syncHometaxData,
  getTaxInvoicePurchase,
  getCashReceiptPurchase,
  getBusinessCardHistory,
  convertTaxInvoiceToExpense,
  convertCashReceiptToExpense,
  convertBusinessCardToExpense,
  isCodefConfigured,
} from '@/lib/codefService';

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

    const supabase = await createClient();

    // Connected ID 조회
    const { data: connection, error: connError } = await supabase
      .from('codef_connections')
      .select('connected_id')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .single();

    if (connError || !connection?.connected_id) {
      return NextResponse.json(
        { success: false, error: '홈택스 계정이 연결되지 않았습니다. 먼저 계정을 연결해주세요.' },
        { status: 400 }
      );
    }

    const connectedId = connection.connected_id;

    // 조회 기간 설정
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

    const results = {
      taxInvoice: { synced: 0, errors: [] as string[] },
      cashReceipt: { synced: 0, errors: [] as string[] },
      businessCard: { synced: 0, errors: [] as string[] },
    };

    // 기본 카테고리 ID 조회 (또는 생성)
    const { data: categories } = await supabase
      .from('expense_categories')
      .select('id, type')
      .eq('clinic_id', clinicId);

    const getCategoryId = (type: string): string => {
      const category = categories?.find(c => c.type === type);
      return category?.id || categories?.[0]?.id || '';
    };

    // 1. 매입 세금계산서 동기화
    if (syncType === 'all' || syncType === 'taxInvoice') {
      try {
        const taxInvoices = await getTaxInvoicePurchase(connectedId, startDate, endDate);

        for (const invoice of taxInvoices) {
          const expenseData = convertTaxInvoiceToExpense(invoice, getCategoryId('material'));

          // 중복 체크 (세금계산서 번호로)
          const { data: existing } = await supabase
            .from('expense_records')
            .select('id')
            .eq('clinic_id', clinicId)
            .eq('tax_invoice_number', invoice.issueId)
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
              results.taxInvoice.errors.push(`세금계산서 ${invoice.issueId} 저장 실패`);
            } else {
              results.taxInvoice.synced++;
            }
          }
        }
      } catch (error) {
        results.taxInvoice.errors.push(`세금계산서 조회 실패: ${error}`);
      }
    }

    // 2. 매입 현금영수증 동기화
    if (syncType === 'all' || syncType === 'cashReceipt') {
      try {
        const cashReceipts = await getCashReceiptPurchase(connectedId, startDate, endDate);

        for (const receipt of cashReceipts) {
          const expenseData = convertCashReceiptToExpense(receipt, getCategoryId('material'));

          // 중복 체크 (승인번호 + 거래일로)
          const { data: existing } = await supabase
            .from('expense_records')
            .select('id')
            .eq('clinic_id', clinicId)
            .ilike('description', `%${receipt.approvalNumber}%`)
            .single();

          if (!existing) {
            const { error: insertError } = await supabase
              .from('expense_records')
              .insert({
                clinic_id: clinicId,
                category_id: getCategoryId('material'),
                year,
                month,
                payment_method: 'cash',
                ...expenseData,
              });

            if (insertError) {
              results.cashReceipt.errors.push(`현금영수증 ${receipt.approvalNumber} 저장 실패`);
            } else {
              results.cashReceipt.synced++;
            }
          }
        }
      } catch (error) {
        results.cashReceipt.errors.push(`현금영수증 조회 실패: ${error}`);
      }
    }

    // 3. 사업자카드 내역 동기화
    if (syncType === 'all' || syncType === 'businessCard') {
      try {
        const cardHistory = await getBusinessCardHistory(connectedId, startDate, endDate);

        for (const card of cardHistory) {
          const expenseData = convertBusinessCardToExpense(card, getCategoryId('material'));

          // 중복 체크 (승인번호로)
          const { data: existing } = await supabase
            .from('expense_records')
            .select('id')
            .eq('clinic_id', clinicId)
            .ilike('description', `%${card.approvalNumber}%`)
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
              results.businessCard.errors.push(`사업자카드 ${card.approvalNumber} 저장 실패`);
            } else {
              results.businessCard.synced++;
            }
          }
        }
      } catch (error) {
        results.businessCard.errors.push(`사업자카드 조회 실패: ${error}`);
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
      tax_invoice_count: results.taxInvoice.synced,
      cash_receipt_count: results.cashReceipt.synced,
      business_card_count: results.businessCard.synced,
      errors: JSON.stringify([
        ...results.taxInvoice.errors,
        ...results.cashReceipt.errors,
        ...results.businessCard.errors,
      ]),
      synced_at: new Date().toISOString(),
    });

    const totalSynced =
      results.taxInvoice.synced +
      results.cashReceipt.synced +
      results.businessCard.synced;

    const allErrors = [
      ...results.taxInvoice.errors,
      ...results.cashReceipt.errors,
      ...results.businessCard.errors,
    ];

    return NextResponse.json({
      success: true,
      data: {
        totalSynced,
        details: results,
        errors: allErrors,
        message: `${totalSynced}건의 데이터가 동기화되었습니다.`,
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

    const supabase = await createClient();
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
