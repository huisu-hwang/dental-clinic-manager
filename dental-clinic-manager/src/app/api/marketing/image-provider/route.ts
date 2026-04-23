import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getImageProvider,
  setImageProvider,
  invalidateImageProviderCache,
  type ImageProvider,
} from '@/lib/marketing/image-provider-setting';

// 이미지 생성 프로바이더 조회 (로그인 사용자 허용)
// GET /api/marketing/image-provider
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const provider = await getImageProvider();
    return NextResponse.json({ provider });
  } catch (error) {
    console.error('[API] marketing/image-provider GET:', error);
    return NextResponse.json({ error: '프로바이더 조회 실패' }, { status: 500 });
  }
}

// 이미지 생성 프로바이더 변경 (master_admin 전용)
// PUT /api/marketing/image-provider
// Body: { provider: 'gemini' | 'openai' }
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'master_admin') {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 });
    }

    const body = await request.json();
    const provider = body?.provider as ImageProvider | undefined;

    if (provider !== 'gemini' && provider !== 'openai') {
      return NextResponse.json(
        { error: "provider는 'gemini' 또는 'openai'여야 합니다." },
        { status: 400 },
      );
    }

    await setImageProvider(provider, user.id);
    invalidateImageProviderCache();

    return NextResponse.json({ provider });
  } catch (error) {
    console.error('[API] marketing/image-provider PUT:', error);
    return NextResponse.json({ error: '프로바이더 저장 실패' }, { status: 500 });
  }
}
