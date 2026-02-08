// ============================================
// 지출 관리 API
// GET: 지출 기록 조회
// POST: 지출 기록 저장
// DELETE: 지출 기록 삭제
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 지출 기록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!clinicId || !year) {
      return NextResponse.json({ error: 'clinicId와 year가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    let query = supabase
      .from('expense_records')
      .select(`
        *,
        category:expense_categories(*)
      `)
      .eq('clinic_id', clinicId)
      .eq('year', parseInt(year));

    if (month) {
      query = query.eq('month', parseInt(month));
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching expense records:', error);
      return NextResponse.json({ error: '지출 기록 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in GET /api/financial/expense:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 지출 기록 저장
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clinicId,
      category_id,
      year,
      month,
      amount,
      description,
      vendor_name,
      has_tax_invoice,
      tax_invoice_number,
      tax_invoice_date,
      payment_method,
      is_business_card,
      is_hometax_synced,
      notes,
      userId,
    } = body;

    if (!clinicId || !category_id || !year || !month || amount === undefined) {
      return NextResponse.json(
        { error: 'clinicId, category_id, year, month, amount가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('expense_records')
      .insert({
        clinic_id: clinicId,
        category_id,
        year,
        month,
        amount,
        description: description || null,
        vendor_name: vendor_name || null,
        has_tax_invoice: has_tax_invoice || false,
        tax_invoice_number: tax_invoice_number || null,
        tax_invoice_date: tax_invoice_date || null,
        payment_method: payment_method || null,
        is_business_card: is_business_card || false,
        is_hometax_synced: is_hometax_synced || false,
        notes: notes || null,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error inserting expense record:', error);
      return NextResponse.json({ error: '지출 기록 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { id: data.id } });
  } catch (error) {
    console.error('Unexpected error in POST /api/financial/expense:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// DELETE: 지출 기록 삭제
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const expenseId = searchParams.get('id');

    if (!expenseId) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { error } = await supabase.from('expense_records').delete().eq('id', expenseId);

    if (error) {
      console.error('Error deleting expense record:', error);
      return NextResponse.json({ error: '지출 기록 삭제에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/financial/expense:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
