import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 마케팅 글 목록 조회
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

    if (!userData?.clinic_id) {
      return NextResponse.json({ error: '클리닉 정보가 없습니다.' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const postType = searchParams.get('postType');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('content_calendar_items')
      .select(`
        *,
        content_calendars!inner(clinic_id)
      `)
      .eq('content_calendars.clinic_id', userData.clinic_id)
      .order('publish_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (postType) query = query.eq('post_type', postType);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[API] marketing/posts GET:', error);
    return NextResponse.json({ error: '글 목록 조회 실패' }, { status: 500 });
  }
}

// 마케팅 글 수동 생성 (캘린더 없이 단독 생성)
export async function POST(request: NextRequest) {
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
    const { title, topic, keyword, postType, tone, useResearch, factCheck, platforms, publishDate, publishTime } = body;

    if (!title || !postType) {
      return NextResponse.json({ error: '제목과 글 유형은 필수입니다.' }, { status: 400 });
    }

    // 단독 글은 임시 캘린더 생성
    const today = new Date().toISOString().split('T')[0];
    const { data: calendar, error: calError } = await supabase
      .from('content_calendars')
      .insert({
        clinic_id: userData.clinic_id,
        period_start: today,
        period_end: today,
        status: 'approved',
        created_by: user.id,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (calError) throw calError;

    // 캘린더 항목 생성
    const { data: item, error: itemError } = await supabase
      .from('content_calendar_items')
      .insert({
        calendar_id: calendar.id,
        publish_date: publishDate || today,
        publish_time: publishTime || '09:00',
        title,
        topic: topic || '',
        keyword: keyword || '',
        post_type: postType,
        tone: tone || 'friendly',
        use_research: useResearch || false,
        fact_check: factCheck || false,
        platforms: platforms || { naverBlog: true, instagram: false, facebook: false, threads: false },
        status: 'approved',
      })
      .select()
      .single();

    if (itemError) throw itemError;

    return NextResponse.json({ data: item }, { status: 201 });
  } catch (error) {
    console.error('[API] marketing/posts POST:', error);
    return NextResponse.json({ error: '글 생성 실패' }, { status: 500 });
  }
}
