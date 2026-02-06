// ============================================
// 지출 카테고리 관리 API
// GET: 카테고리 목록 조회
// POST: 카테고리 추가
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

// GET: 지출 카테고리 목록 조회
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clinicId = searchParams.get('clinicId');

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    const { data, error } = await supabase
      .from('expense_categories')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      console.error('Error fetching expense categories:', error);
      return NextResponse.json({ error: '지출 카테고리 조회에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in GET /api/financial/categories:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

// POST: 기본 카테고리 생성 또는 새 카테고리 추가
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clinicId, action, name, type, description, is_hometax_trackable, is_recurring } = body;

    if (!clinicId) {
      return NextResponse.json({ error: 'clinicId가 필요합니다.' }, { status: 400 });
    }

    const supabase = getServiceClient();

    // 기본 카테고리 생성 요청
    if (action === 'create_defaults') {
      const { error } = await supabase.rpc('create_default_expense_categories', {
        p_clinic_id: clinicId,
      });

      if (error) {
        console.error('Error creating default expense categories:', error);
        return NextResponse.json({ error: '기본 카테고리 생성에 실패했습니다.' }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: '기본 카테고리가 생성되었습니다.' });
    }

    // 새 카테고리 추가
    if (!name || !type) {
      return NextResponse.json({ error: 'name과 type이 필요합니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('expense_categories')
      .insert({
        clinic_id: clinicId,
        name,
        type,
        description: description || null,
        is_hometax_trackable: is_hometax_trackable || false,
        is_recurring: is_recurring || false,
        display_order: 99,
      })
      .select()
      .single();

    if (error) {
      console.error('Error adding expense category:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: '이미 동일한 이름의 카테고리가 있습니다.' }, { status: 400 });
      }
      return NextResponse.json({ error: '지출 카테고리 추가에 실패했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in POST /api/financial/categories:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
