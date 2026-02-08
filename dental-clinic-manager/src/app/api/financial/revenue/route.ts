// ============================================
// 수입 관리 API
// GET: 수입 기록 조회
// POST: 수입 기록 저장/수정
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role client for server-side operations
function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 수입 기록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');
    const year = searchParams.get('year');
    const month = searchParams.get('month');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    if (!year) {
      return NextResponse.json({ error: 'year가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // 월별 조회 또는 연간 조회
    if (month) {
      const { data, error } = await supabase
        .from('revenue_records')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('year', parseInt(year))
        .eq('month', parseInt(month))
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching revenue record:', error);
        return NextResponse.json({ error: '수입 기록 조회에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    } else {
      // 연간 조회
      const { data, error } = await supabase
        .from('revenue_records')
        .select('*')
        .eq('clinic_id', clinicId)
        .eq('year', parseInt(year))
        .order('month', { ascending: true });

      if (error) {
        console.error('Error fetching annual revenue records:', error);
        return NextResponse.json({ error: '연간 수입 기록 조회에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data });
    }
  } catch (error) {
    console.error('Unexpected error in GET /api/financial/revenue:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 수입 기록 저장/수정
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clinicId,
      year,
      month,
      insurance_revenue,
      insurance_patient_count,
      non_insurance_revenue,
      non_insurance_patient_count,
      other_revenue,
      other_revenue_description,
      source_type,
      source_file_url,
      source_file_name,
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
      .from('revenue_records')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('year', year)
      .eq('month', month)
      .single();

    if (existing) {
      // UPDATE
      const { data, error } = await supabase
        .from('revenue_records')
        .update({
          insurance_revenue: insurance_revenue || 0,
          insurance_patient_count: insurance_patient_count || 0,
          non_insurance_revenue: non_insurance_revenue || 0,
          non_insurance_patient_count: non_insurance_patient_count || 0,
          other_revenue: other_revenue || 0,
          other_revenue_description: other_revenue_description || null,
          source_type: source_type || 'manual',
          source_file_url: source_file_url || null,
          source_file_name: source_file_name || null,
          notes: notes || null,
          updated_by: userId,
        })
        .eq('id', existing.id)
        .select('id')
        .single();

      if (error) {
        console.error('Error updating revenue record:', error);
        return NextResponse.json({ error: '수입 기록 수정에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: { id: data.id, isNew: false } });
    } else {
      // INSERT
      const { data, error } = await supabase
        .from('revenue_records')
        .insert({
          clinic_id: clinicId,
          year,
          month,
          insurance_revenue: insurance_revenue || 0,
          insurance_patient_count: insurance_patient_count || 0,
          non_insurance_revenue: non_insurance_revenue || 0,
          non_insurance_patient_count: non_insurance_patient_count || 0,
          other_revenue: other_revenue || 0,
          other_revenue_description: other_revenue_description || null,
          source_type: source_type || 'manual',
          source_file_url: source_file_url || null,
          source_file_name: source_file_name || null,
          notes: notes || null,
          created_by: userId,
          updated_by: userId,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error inserting revenue record:', error);
        return NextResponse.json({ error: '수입 기록 저장에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: { id: data.id, isNew: true } });
    }
  } catch (error) {
    console.error('Unexpected error in POST /api/financial/revenue:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
