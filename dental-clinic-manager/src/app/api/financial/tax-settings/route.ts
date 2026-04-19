// ============================================
// 세무 설정 API
// GET: 병원별 세무 설정 조회
// POST: 병원별 세무 설정 생성/갱신 (owner/master_admin 전용)
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

const DEFAULT = {
  business_type: 'individual' as const,
  bookkeeping_type: 'double' as const,
  dependent_count: 1,
  spouse_deduction: false,
  apply_standard_deduction: true,
  noranumbrella_monthly: 0,
  national_pension_monthly: 0,
  health_insurance_monthly: 0,
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from('clinic_tax_settings')
      .select('*')
      .eq('clinic_id', clinicId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching tax settings:', error);
      return NextResponse.json({ error: '세무 설정 조회에 실패했습니다.' }, { status: 500 });
    }

    // 설정이 없으면 기본값 반환
    return NextResponse.json({
      success: true,
      data: data ?? { clinic_id: clinicId, ...DEFAULT },
    });
  } catch (err) {
    console.error('Unexpected error in GET /api/financial/tax-settings:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clinicId,
      business_type,
      bookkeeping_type,
      dependent_count,
      spouse_deduction,
      apply_standard_deduction,
      noranumbrella_monthly,
      national_pension_monthly,
      health_insurance_monthly,
    } = body;

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const payload = {
      clinic_id: clinicId,
      business_type: business_type ?? DEFAULT.business_type,
      bookkeeping_type: bookkeeping_type ?? DEFAULT.bookkeeping_type,
      dependent_count: Math.max(1, Number(dependent_count ?? DEFAULT.dependent_count)),
      spouse_deduction: Boolean(spouse_deduction ?? DEFAULT.spouse_deduction),
      apply_standard_deduction: Boolean(apply_standard_deduction ?? DEFAULT.apply_standard_deduction),
      noranumbrella_monthly: Math.max(0, Number(noranumbrella_monthly ?? 0)),
      national_pension_monthly: Math.max(0, Number(national_pension_monthly ?? 0)),
      health_insurance_monthly: Math.max(0, Number(health_insurance_monthly ?? 0)),
    };

    const { data, error } = await supabase
      .from('clinic_tax_settings')
      .upsert(payload, { onConflict: 'clinic_id' })
      .select()
      .single();

    if (error) {
      console.error('Error saving tax settings:', error);
      return NextResponse.json({ error: '세무 설정 저장에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: '세무 설정이 저장되었습니다.' });
  } catch (err) {
    console.error('Unexpected error in POST /api/financial/tax-settings:', err);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
