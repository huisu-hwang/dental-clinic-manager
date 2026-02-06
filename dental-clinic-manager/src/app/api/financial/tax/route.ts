// ============================================
// 세금 관리 API
// GET: 세금 기록 조회
// POST: 세금 기록 저장/수정
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// 종합소득세 계산 함수
function calculateIncomeTax(taxableIncome: number) {
  let incomeTax = 0;

  if (taxableIncome <= 0) {
    return { income_tax: 0, local_income_tax: 0, total_tax: 0, effective_rate: 0 };
  }

  // 2025년 종합소득세 세율표
  if (taxableIncome <= 14000000) {
    incomeTax = taxableIncome * 0.06;
  } else if (taxableIncome <= 50000000) {
    incomeTax = taxableIncome * 0.15 - 1260000;
  } else if (taxableIncome <= 88000000) {
    incomeTax = taxableIncome * 0.24 - 5760000;
  } else if (taxableIncome <= 150000000) {
    incomeTax = taxableIncome * 0.35 - 15440000;
  } else if (taxableIncome <= 300000000) {
    incomeTax = taxableIncome * 0.38 - 19940000;
  } else if (taxableIncome <= 500000000) {
    incomeTax = taxableIncome * 0.40 - 25940000;
  } else if (taxableIncome <= 1000000000) {
    incomeTax = taxableIncome * 0.42 - 35940000;
  } else {
    incomeTax = taxableIncome * 0.45 - 65940000;
  }

  incomeTax = Math.max(0, Math.round(incomeTax));
  const localIncomeTax = Math.round(incomeTax * 0.1);
  const totalTax = incomeTax + localIncomeTax;
  const effectiveRate = taxableIncome > 0 ? Math.round((totalTax / taxableIncome) * 10000) / 100 : 0;

  return {
    income_tax: incomeTax,
    local_income_tax: localIncomeTax,
    total_tax: totalTax,
    effective_rate: effectiveRate,
  };
}

// GET: 세금 기록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const action = searchParams.get('action');

    // 세금 계산 요청
    if (action === 'calculate') {
      const taxableIncome = parseFloat(searchParams.get('taxableIncome') || '0');
      const result = calculateIncomeTax(taxableIncome);
      return NextResponse.json({ success: true, data: result });
    }

    if (!clinicId || !year) {
      return NextResponse.json({ error: 'clinicId와 year가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // 월별 조회
    if (month) {
      const { data, error } = await supabase
        .from('tax_records')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('year', parseInt(year))
        .eq('month', parseInt(month))
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching tax record:', error);
        return NextResponse.json({ error: '세금 기록 조회에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }

    // 연간 조회
    const { data, error } = await supabase
      .from('tax_records')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('year', parseInt(year))
      .order('month', { ascending: true });

    if (error) {
      console.error('Error fetching annual tax records:', error);
      return NextResponse.json({ error: '연간 세금 기록 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in GET /api/financial/tax:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 세금 기록 저장/수정
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clinicId,
      year,
      month,
      taxable_income,
      income_tax,
      local_income_tax,
      vat,
      property_tax,
      other_tax,
      government_support,
      tax_deductions,
      calculation_method,
      notes,
      userId,
    } = body;

    if (!clinicId || !year || !month) {
      return NextResponse.json(
        { error: 'clinicId, year, month가 필요합니다.' },
        { status: 400 }
      );
    }

    const supabase = getServiceClient();

    // 기존 기록 확인
    const { data: existing } = await supabase
      .from('tax_records')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (existing) {
      // UPDATE
      const { data, error } = await supabase
        .from('tax_records')
        .update({
          taxable_income: taxable_income || 0,
          income_tax: income_tax || 0,
          local_income_tax: local_income_tax || 0,
          vat: vat || 0,
          property_tax: property_tax || 0,
          other_tax: other_tax || 0,
          government_support: government_support || 0,
          tax_deductions: tax_deductions || 0,
          calculation_method: calculation_method || 'manual',
          notes: notes || null,
          updated_by: userId,
        })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error) {
        console.error('Error updating tax record:', error);
        return NextResponse.json({ error: '세금 기록 수정에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: { id: data.id, isNew: false } });
    } else {
      // INSERT
      const { data, error } = await supabase
        .from('tax_records')
        .insert({
          clinic_id: clinicId,
          year,
          month,
          taxable_income: taxable_income || 0,
          income_tax: income_tax || 0,
          local_income_tax: local_income_tax || 0,
          vat: vat || 0,
          property_tax: property_tax || 0,
          other_tax: other_tax || 0,
          government_support: government_support || 0,
          tax_deductions: tax_deductions || 0,
          calculation_method: calculation_method || 'manual',
          notes: notes || null,
          created_by: userId,
          updated_by: userId,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error inserting tax record:', error);
        return NextResponse.json({ error: '세금 기록 저장에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: { id: data.id, isNew: true } });
    }
  } catch (error) {
    console.error('Unexpected error in POST /api/financial/tax:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
