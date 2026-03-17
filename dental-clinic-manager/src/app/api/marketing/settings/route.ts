import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 플랫폼 설정 조회
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('clinic_id')
      .eq('id', user.id)
      .single();

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('marketing_platform_settings')
      .select('*')
      .eq('clinic_id', userData.clinic_id);

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('[API] marketing/settings GET:', error);
    return NextResponse.json({ error: '설정 조회 실패' }, { status: 500 });
  }
}

// 플랫폼 설정 저장/업데이트
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

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { platform, enabled, config } = body;

    if (!platform) {
      return NextResponse.json({ error: 'platform은 필수입니다.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('marketing_platform_settings')
      .upsert(
        {
          clinic_id: userData.clinic_id,
          platform,
          enabled: enabled ?? false,
          config: config || {},
        },
        { onConflict: 'clinic_id,platform' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[API] marketing/settings PUT:', error);
    return NextResponse.json({ error: '설정 저장 실패' }, { status: 500 });
  }
}
