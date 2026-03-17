import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 캘린더 항목 개별 수정 (승인/거절/수정)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, action, updates } = body;

    if (!itemId) {
      return NextResponse.json({ error: 'itemId는 필수입니다.' }, { status: 400 });
    }

    let updateData: Record<string, unknown> = {};

    switch (action) {
      case 'approve':
        updateData = { status: 'approved' };
        break;
      case 'reject':
        updateData = { status: 'rejected' };
        break;
      case 'modify':
        updateData = {
          ...updates,
          status: 'modified',
        };
        break;
      default:
        // 일반 업데이트
        updateData = updates || {};
    }

    const { data, error } = await supabase
      .from('content_calendar_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('[API] calendar/items PUT:', error);
    return NextResponse.json({ error: '항목 수정 실패' }, { status: 500 });
  }
}

// 캘린더 전체 승인
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
    }

    const body = await request.json();
    const { calendarId, action } = body;

    if (!calendarId) {
      return NextResponse.json({ error: 'calendarId는 필수입니다.' }, { status: 400 });
    }

    if (action === 'approve_all') {
      // 모든 proposed 항목을 approved로
      await supabase
        .from('content_calendar_items')
        .update({ status: 'approved' })
        .eq('calendar_id', calendarId)
        .in('status', ['proposed', 'modified']);

      // 캘린더 상태 업데이트
      await supabase
        .from('content_calendars')
        .update({
          status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', calendarId);

      return NextResponse.json({ message: '전체 승인 완료' });
    }

    if (action === 'reject_all') {
      await supabase
        .from('content_calendar_items')
        .update({ status: 'rejected' })
        .eq('calendar_id', calendarId)
        .eq('status', 'proposed');

      await supabase
        .from('content_calendars')
        .update({ status: 'draft' })
        .eq('id', calendarId);

      return NextResponse.json({ message: '전체 거절 완료' });
    }

    return NextResponse.json({ error: '유효하지 않은 action' }, { status: 400 });
  } catch (error) {
    console.error('[API] calendar/items POST:', error);
    return NextResponse.json({ error: '처리 실패' }, { status: 500 });
  }
}
