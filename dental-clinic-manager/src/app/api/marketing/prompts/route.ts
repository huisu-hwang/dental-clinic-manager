import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 프롬프트 목록 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id || userData.role !== 'owner') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');

    let query = supabase
      .from('marketing_prompts')
      .select('*')
      .eq('clinic_id', userData.clinic_id)
      .eq('is_active', true)
      .order('prompt_key');

    if (category) query = query.eq('category', category);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[API] marketing/prompts GET:', error);
    return NextResponse.json({ error: '프롬프트 조회 실패' }, { status: 500 });
  }
}

// 프롬프트 수정 (새 버전 생성)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id, role')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id || userData.role !== 'owner') {
      return NextResponse.json({ error: '마스터 권한이 필요합니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { promptId, systemPrompt, changeNote } = body;

    if (!promptId || !systemPrompt) {
      return NextResponse.json({ error: 'promptId와 systemPrompt는 필수입니다.' }, { status: 400 });
    }

    // 기존 프롬프트 조회
    const { data: existing, error: fetchError } = await supabase
      .from('marketing_prompts')
      .select('*')
      .eq('id', promptId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: '프롬프트를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 기존 프롬프트 비활성화
    await supabase
      .from('marketing_prompts')
      .update({ is_active: false })
      .eq('id', promptId);

    // 새 버전 생성
    const { data: newPrompt, error: insertError } = await supabase
      .from('marketing_prompts')
      .insert({
        clinic_id: existing.clinic_id,
        category: existing.category,
        prompt_key: existing.prompt_key,
        name: existing.name,
        system_prompt: systemPrompt,
        variables: existing.variables,
        version: existing.version + 1,
        is_active: true,
        created_by: existing.created_by,
        updated_by: user.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 변경 이력 기록
    await supabase.from('marketing_prompt_history').insert({
      prompt_id: newPrompt.id,
      prompt_key: existing.prompt_key,
      version: newPrompt.version,
      previous_content: existing.system_prompt,
      new_content: systemPrompt,
      changed_by: user.id,
      change_note: changeNote || '',
    });

    return NextResponse.json({ data: newPrompt });
  } catch (error) {
    console.error('[API] marketing/prompts PUT:', error);
    return NextResponse.json({ error: '프롬프트 수정 실패' }, { status: 500 });
  }
}
