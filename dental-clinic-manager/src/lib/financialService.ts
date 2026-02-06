// ============================================
// 경영 현황 관리 서비스
// Created: 2026-02-06
// ============================================

import { createClient } from '@/lib/supabase/client';
import {
  ExpenseCategory,
  RevenueRecord,
  ExpenseRecord,
  TaxRecord,
  FinancialSummary,
  RevenueFormData,
  ExpenseFormData,
  TaxFormData,
  TaxCalculationResult,
  AnnualFinancialSummary,
} from '@/types/financial';

// ============================================
// 지출 카테고리 관리
// ============================================

/**
 * 클리닉의 지출 카테고리 목록 조회
 */
export async function getExpenseCategories(clinicId: string): Promise<ExpenseCategory[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching expense categories:', error);
    throw new Error('지출 카테고리를 불러오는데 실패했습니다.');
  }

  return data || [];
}

/**
 * 기본 지출 카테고리 생성 (새 병원용)
 */
export async function createDefaultExpenseCategories(clinicId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.rpc('create_default_expense_categories', {
    p_clinic_id: clinicId,
  });

  if (error) {
    console.error('Error creating default expense categories:', error);
    throw new Error('기본 지출 카테고리 생성에 실패했습니다.');
  }
}

/**
 * 지출 카테고리 추가
 */
export async function addExpenseCategory(
  clinicId: string,
  category: Partial<ExpenseCategory>
): Promise<ExpenseCategory> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('expense_categories')
    .insert({
      clinic_id: clinicId,
      name: category.name,
      type: category.type,
      description: category.description,
      is_hometax_trackable: category.is_hometax_trackable ?? false,
      is_recurring: category.is_recurring ?? false,
      display_order: category.display_order ?? 99,
    })
    .select()
    .single();

  if (error) {
    console.error('Error adding expense category:', error);
    throw new Error('지출 카테고리 추가에 실패했습니다.');
  }

  return data;
}

// ============================================
// 수입 관리
// ============================================

/**
 * 월별 수입 기록 조회
 */
export async function getRevenueRecord(
  clinicId: string,
  year: number,
  month: number
): Promise<RevenueRecord | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('revenue_records')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching revenue record:', error);
    throw new Error('수입 기록을 불러오는데 실패했습니다.');
  }

  return data;
}

/**
 * 연간 수입 기록 조회
 */
export async function getAnnualRevenueRecords(
  clinicId: string,
  year: number
): Promise<RevenueRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('revenue_records')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .order('month', { ascending: true });

  if (error) {
    console.error('Error fetching annual revenue records:', error);
    throw new Error('연간 수입 기록을 불러오는데 실패했습니다.');
  }

  return data || [];
}

/**
 * 수입 기록 저장 (INSERT or UPDATE)
 */
export async function saveRevenueRecord(
  clinicId: string,
  formData: RevenueFormData,
  userId: string,
  fileUrl?: string,
  fileName?: string
): Promise<{ id: string; isNew: boolean }> {
  const supabase = createClient();

  // 기존 기록 확인
  const existing = await getRevenueRecord(clinicId, formData.year, formData.month);

  if (existing) {
    // UPDATE
    const { data, error } = await supabase
      .from('revenue_records')
      .update({
        insurance_revenue: formData.insurance_revenue,
        insurance_patient_count: formData.insurance_patient_count,
        non_insurance_revenue: formData.non_insurance_revenue,
        non_insurance_patient_count: formData.non_insurance_patient_count,
        other_revenue: formData.other_revenue,
        other_revenue_description: formData.other_revenue_description || null,
        source_type: formData.source_type,
        source_file_url: fileUrl || existing.source_file_url,
        source_file_name: fileName || existing.source_file_name,
        notes: formData.notes || null,
        updated_by: userId,
      })
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error) {
      console.error('Error updating revenue record:', error);
      throw new Error('수입 기록 수정에 실패했습니다.');
    }

    return { id: data.id, isNew: false };
  } else {
    // INSERT
    const { data, error } = await supabase
      .from('revenue_records')
      .insert({
        clinic_id: clinicId,
        year: formData.year,
        month: formData.month,
        insurance_revenue: formData.insurance_revenue,
        insurance_patient_count: formData.insurance_patient_count,
        non_insurance_revenue: formData.non_insurance_revenue,
        non_insurance_patient_count: formData.non_insurance_patient_count,
        other_revenue: formData.other_revenue,
        other_revenue_description: formData.other_revenue_description || null,
        source_type: formData.source_type,
        source_file_url: fileUrl || null,
        source_file_name: fileName || null,
        notes: formData.notes || null,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error inserting revenue record:', error);
      throw new Error('수입 기록 저장에 실패했습니다.');
    }

    return { id: data.id, isNew: true };
  }
}

// ============================================
// 지출 관리
// ============================================

/**
 * 월별 지출 기록 목록 조회
 */
export async function getExpenseRecords(
  clinicId: string,
  year: number,
  month: number
): Promise<ExpenseRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('expense_records')
    .select(`
      *,
      category:expense_categories(*)
    `)
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching expense records:', error);
    throw new Error('지출 기록을 불러오는데 실패했습니다.');
  }

  return data || [];
}

/**
 * 연간 지출 기록 조회
 */
export async function getAnnualExpenseRecords(
  clinicId: string,
  year: number
): Promise<ExpenseRecord[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('expense_records')
    .select(`
      *,
      category:expense_categories(*)
    `)
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .order('month', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching annual expense records:', error);
    throw new Error('연간 지출 기록을 불러오는데 실패했습니다.');
  }

  return data || [];
}

/**
 * 지출 기록 저장
 */
export async function saveExpenseRecord(
  clinicId: string,
  formData: ExpenseFormData,
  userId: string
): Promise<{ id: string; isNew: boolean }> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('expense_records')
    .insert({
      clinic_id: clinicId,
      category_id: formData.category_id,
      year: formData.year,
      month: formData.month,
      amount: formData.amount,
      description: formData.description || null,
      vendor_name: formData.vendor_name || null,
      has_tax_invoice: formData.has_tax_invoice,
      tax_invoice_number: formData.tax_invoice_number || null,
      tax_invoice_date: formData.tax_invoice_date || null,
      payment_method: formData.payment_method,
      is_business_card: formData.is_business_card,
      is_hometax_synced: formData.is_hometax_synced,
      notes: formData.notes || null,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Error inserting expense record:', error);
    throw new Error('지출 기록 저장에 실패했습니다.');
  }

  return { id: data.id, isNew: true };
}

/**
 * 지출 기록 수정
 */
export async function updateExpenseRecord(
  expenseId: string,
  formData: Partial<ExpenseFormData>,
  userId: string
): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase
    .from('expense_records')
    .update({
      ...formData,
      updated_by: userId,
    })
    .eq('id', expenseId);

  if (error) {
    console.error('Error updating expense record:', error);
    throw new Error('지출 기록 수정에 실패했습니다.');
  }
}

/**
 * 지출 기록 삭제
 */
export async function deleteExpenseRecord(expenseId: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.from('expense_records').delete().eq('id', expenseId);

  if (error) {
    console.error('Error deleting expense record:', error);
    throw new Error('지출 기록 삭제에 실패했습니다.');
  }
}

// ============================================
// 세금 관리
// ============================================

/**
 * 종합소득세 계산 (클라이언트 사이드)
 */
export function calculateIncomeTaxClient(taxableIncome: number): TaxCalculationResult {
  let incomeTax = 0;

  // 2025년 종합소득세 세율표
  if (taxableIncome <= 0) {
    return { income_tax: 0, local_income_tax: 0, total_tax: 0, effective_rate: 0 };
  }

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

/**
 * 월별 세금 기록 조회
 */
export async function getTaxRecord(
  clinicId: string,
  year: number,
  month: number
): Promise<TaxRecord | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('tax_records')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching tax record:', error);
    throw new Error('세금 기록을 불러오는데 실패했습니다.');
  }

  return data;
}

/**
 * 세금 기록 저장 (INSERT or UPDATE)
 */
export async function saveTaxRecord(
  clinicId: string,
  formData: TaxFormData,
  userId: string
): Promise<{ id: string; isNew: boolean }> {
  const supabase = createClient();

  // 기존 기록 확인
  const existing = await getTaxRecord(clinicId, formData.year, formData.month);

  if (existing) {
    // UPDATE
    const { data, error } = await supabase
      .from('tax_records')
      .update({
        taxable_income: formData.taxable_income,
        income_tax: formData.income_tax,
        local_income_tax: formData.local_income_tax,
        vat: formData.vat,
        property_tax: formData.property_tax,
        other_tax: formData.other_tax,
        government_support: formData.government_support,
        tax_deductions: formData.tax_deductions,
        calculation_method: formData.calculation_method,
        notes: formData.notes || null,
        updated_by: userId,
      })
      .eq('id', existing.id)
      .select('id')
      .single();

    if (error) {
      console.error('Error updating tax record:', error);
      throw new Error('세금 기록 수정에 실패했습니다.');
    }

    return { id: data.id, isNew: false };
  } else {
    // INSERT
    const { data, error } = await supabase
      .from('tax_records')
      .insert({
        clinic_id: clinicId,
        year: formData.year,
        month: formData.month,
        taxable_income: formData.taxable_income,
        income_tax: formData.income_tax,
        local_income_tax: formData.local_income_tax,
        vat: formData.vat,
        property_tax: formData.property_tax,
        other_tax: formData.other_tax,
        government_support: formData.government_support,
        tax_deductions: formData.tax_deductions,
        calculation_method: formData.calculation_method,
        notes: formData.notes || null,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error inserting tax record:', error);
      throw new Error('세금 기록 저장에 실패했습니다.');
    }

    return { id: data.id, isNew: true };
  }
}

// ============================================
// 재무 요약
// ============================================

/**
 * 월별 재무 요약 조회
 */
export async function getFinancialSummary(
  clinicId: string,
  year: number,
  month: number
): Promise<FinancialSummary | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('financial_summary_view')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .eq('month', month)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching financial summary:', error);
    throw new Error('재무 요약을 불러오는데 실패했습니다.');
  }

  return data;
}

/**
 * 연간 재무 요약 조회
 */
export async function getAnnualFinancialSummary(
  clinicId: string,
  year: number
): Promise<AnnualFinancialSummary> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from('financial_summary_view')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('year', year)
    .order('month', { ascending: true });

  if (error) {
    console.error('Error fetching annual financial summary:', error);
    throw new Error('연간 재무 요약을 불러오는데 실패했습니다.');
  }

  const months: FinancialSummary[] = (data || []) as FinancialSummary[];

  // 연간 합계 계산
  const initialTotals = {
    total_revenue: 0,
    total_expense: 0,
    total_tax: 0,
    pre_tax_profit: 0,
    post_tax_profit: 0,
  };
  const totals = months.reduce(
    (acc, m) => ({
      total_revenue: acc.total_revenue + (m.total_revenue || 0),
      total_expense: acc.total_expense + (m.total_expense || 0),
      total_tax: acc.total_tax + (m.actual_tax_paid || 0),
      pre_tax_profit: acc.pre_tax_profit + (m.pre_tax_profit || 0),
      post_tax_profit: acc.post_tax_profit + (m.post_tax_profit || 0),
    }),
    initialTotals
  );

  const monthCount = months.length || 1;

  return {
    clinic_id: clinicId,
    year,
    months,
    totals: {
      ...totals,
      average_monthly_revenue: Math.round(totals.total_revenue / monthCount),
      average_monthly_expense: Math.round(totals.total_expense / monthCount),
      average_profit_margin:
        totals.total_revenue > 0
          ? Math.round(((totals.pre_tax_profit / totals.total_revenue) * 100) * 100) / 100
          : 0,
    },
  };
}

// ============================================
// 급여 연동
// ============================================

/**
 * 급여에서 인건비 지출 자동 생성
 */
export async function syncPayrollToExpense(
  clinicId: string,
  year: number,
  month: number,
  userId: string
): Promise<void> {
  const supabase = createClient();

  // 해당 월의 급여 명세서 조회
  const { data: payrollData, error: payrollError } = await supabase
    .from('payroll_statements')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('payment_year', year)
    .eq('payment_month', month);

  if (payrollError) {
    console.error('Error fetching payroll statements:', payrollError);
    throw new Error('급여 명세서를 불러오는데 실패했습니다.');
  }

  if (!payrollData || payrollData.length === 0) {
    return; // 급여 데이터 없음
  }

  // 인건비 카테고리 조회
  const { data: personnelCategory } = await supabase
    .from('expense_categories')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('type', 'personnel')
    .eq('name', '직원 급여')
    .single();

  if (!personnelCategory) {
    // 기본 카테고리가 없으면 생성
    await createDefaultExpenseCategories(clinicId);
    return syncPayrollToExpense(clinicId, year, month, userId); // 재귀 호출
  }

  // 총 급여 합계
  const totalSalary = payrollData.reduce(
    (sum: number, p: { total_payment?: number }) => sum + (p.total_payment || 0),
    0
  );

  // 기존 인건비 지출 확인 및 업데이트
  const { data: existingExpense } = await supabase
    .from('expense_records')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('category_id', personnelCategory.id)
    .eq('year', year)
    .eq('month', month)
    .eq('description', '직원 급여 (자동 연동)')
    .single();

  if (existingExpense) {
    await supabase
      .from('expense_records')
      .update({
        amount: totalSalary,
        updated_by: userId,
      })
      .eq('id', existingExpense.id);
  } else {
    await supabase.from('expense_records').insert({
      clinic_id: clinicId,
      category_id: personnelCategory.id,
      year,
      month,
      amount: totalSalary,
      description: '직원 급여 (자동 연동)',
      payment_method: 'transfer',
      created_by: userId,
      updated_by: userId,
    });
  }
}

// ============================================
// 파일 업로드 관련
// ============================================

/**
 * 재무 문서 파일 업로드
 */
export async function uploadFinancialDocument(
  clinicId: string,
  file: File,
  type: 'revenue' | 'expense'
): Promise<{ url: string; fileName: string }> {
  const supabase = createClient();

  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = file.name.split('.').pop() || 'file';
  const fileName = `${type}/${clinicId}/${timestamp}_${randomString}.${extension}`;

  const { error } = await supabase.storage
    .from('financial-documents')
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    console.error('Error uploading financial document:', error);
    throw new Error('파일 업로드에 실패했습니다.');
  }

  const { data: urlData } = supabase.storage.from('financial-documents').getPublicUrl(fileName);

  return {
    url: urlData.publicUrl,
    fileName: file.name,
  };
}
