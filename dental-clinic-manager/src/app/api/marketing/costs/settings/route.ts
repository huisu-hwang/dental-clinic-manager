import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_SETTINGS = [
  { model: 'claude-sonnet-4-6', input_price_per_1m: 3.0, output_price_per_1m: 15.0, image_price_per_call: 0, usd_to_krw: 1380 },
  { model: 'claude-haiku-4-5', input_price_per_1m: 0.8, output_price_per_1m: 4.0, image_price_per_call: 0, usd_to_krw: 1380 },
  { model: 'gemini-3.0-flash', input_price_per_1m: 0, output_price_per_1m: 0, image_price_per_call: 0.04, usd_to_krw: 1380 },
  { model: 'gpt-image-2', input_price_per_1m: 0, output_price_per_1m: 0, image_price_per_call: 0.04, usd_to_krw: 1380 },
  { model: 'exchange_rate', input_price_per_1m: 0, output_price_per_1m: 0, image_price_per_call: 0, usd_to_krw: 1380 },
];

// 현재 단가 + 환율 조회
// GET /api/marketing/costs/settings
export async function GET() {
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

    if (userData.role !== 'master_admin') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    let { data: settings, error: queryError } = await supabase
      .from('marketing_cost_settings')
      .select('*')
      .eq('clinic_id', userData.clinic_id)
      .order('model', { ascending: true });

    if (queryError) throw queryError;

    // 설정이 없으면 기본값 시드
    if (!settings || settings.length === 0) {
      const seedRows = DEFAULT_SETTINGS.map(s => ({
        ...s,
        clinic_id: userData.clinic_id,
      }));

      const { data: seeded, error: seedError } = await supabase
        .from('marketing_cost_settings')
        .insert(seedRows)
        .select('*');

      if (seedError) throw seedError;
      settings = seeded ?? [];
    }

    return NextResponse.json({ settings: settings ?? [] });
  } catch (error) {
    console.error('[API] marketing/costs/settings GET:', error);
    return NextResponse.json({ error: '단가 설정 조회 실패' }, { status: 500 });
  }
}

// 단가/환율 수정
// PUT /api/marketing/costs/settings
// Body: { settings: [{ model, input_price_per_1m, output_price_per_1m, image_price_per_call, usd_to_krw }] }
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

    if (userData.role !== 'master_admin') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const { settings } = body as {
      settings: Array<{
        model: string;
        input_price_per_1m?: number;
        output_price_per_1m?: number;
        image_price_per_call?: number;
        usd_to_krw?: number;
      }>;
    };

    if (!Array.isArray(settings) || settings.length === 0) {
      return NextResponse.json({ error: 'settings 배열이 필요합니다.' }, { status: 400 });
    }

    const upsertRows = settings.map(s => ({
      clinic_id: userData.clinic_id,
      model: s.model,
      input_price_per_1m: s.input_price_per_1m ?? 0,
      output_price_per_1m: s.output_price_per_1m ?? 0,
      image_price_per_call: s.image_price_per_call ?? 0,
      usd_to_krw: s.usd_to_krw ?? 1380,
      updated_at: new Date().toISOString(),
    }));

    const { data, error } = await supabase
      .from('marketing_cost_settings')
      .upsert(upsertRows, { onConflict: 'clinic_id,model' })
      .select('*');

    if (error) throw error;

    return NextResponse.json({ settings: data ?? [] });
  } catch (error) {
    console.error('[API] marketing/costs/settings PUT:', error);
    return NextResponse.json({ error: '단가 설정 저장 실패' }, { status: 500 });
  }
}
